import type { BotContext } from "../context.js";
import { registerUser } from "../../services/user.js";
import { checkAchievements } from "../../services/achievement.js";
import { getUserByReferralCode, listMarkets } from "@kazam/db/queries";
import { REFERRAL_BONUS } from "@kazam/shared/constants";
import { InlineKeyboard } from "grammy";
import { Bot } from "grammy";

function getMarketEmoji(type: string): string {
  const map: Record<string, string> = {
    where: "📍",
    when: "⏰",
    how_many: "🔢",
    war_duration: "⚔️",
    alert_type: "🎯",
    intensity: "📊",
  };
  return map[type] ?? "🎲";
}

export async function handleStart(ctx: BotContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  // Extract referral code from deep link: /start ref_CODE
  const text = ctx.message?.text ?? "";
  const parts = text.split(" ");
  let referralCode: string | undefined;
  if (parts.length > 1 && parts[1].startsWith("ref_")) {
    referralCode = parts[1].replace("ref_", "");
  }

  // Check if user already exists (to detect if this is a new registration)
  const { getUserByTelegramId } = await import("@kazam/db/queries");
  const existingUser = await getUserByTelegramId(ctx.db, from.id);

  const user = await registerUser(
    ctx.db,
    {
      id: from.id,
      username: from.username,
      first_name: from.first_name,
    },
    referralCode,
  );

  // If this was a new user with a referral, notify the referrer
  if (!existingUser && referralCode && user.referred_by) {
    try {
      const referrer = await getUserByReferralCode(ctx.db, referralCode);
      if (referrer) {
        // Check referrer achievements (for refer_1, refer_5)
        await checkAchievements(ctx.db, referrer);
        // Notify referrer via Telegram
        const bot = new Bot(ctx.env.TELEGRAM_BOT_TOKEN);
        await bot.api.sendMessage(
          referrer.telegram_id,
          `🎉 *${from.first_name}* הצטרף דרך ההפניה שלך!\n` +
            `💰 קיבלת *+${REFERRAL_BONUS} מטבעות* בונוס!`,
          { parse_mode: "Markdown" },
        );
      }
    } catch {
      // Don't fail registration if notification fails
    }
  }

  // Fetch open markets to show immediately
  const openMarkets = await listMarkets(ctx.db, {
    status: "open",
    limit: 6,
    offset: 0,
  });

  if (!existingUser && openMarkets.length > 0) {
    // NEW USER with open markets — short welcome + immediate market display
    // Pick the most approachable market (how_many or intensity are simple yes/no style)
    const priorityOrder = ["how_many", "intensity", "alert_type", "where", "when", "war_duration"];
    const sorted = [...openMarkets].sort(
      (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type),
    );
    const featured = sorted[0];
    const featuredEmoji = getMarketEmoji(featured.type);

    const keyboard = new InlineKeyboard()
      .text(`${featuredEmoji} ${featured.question.slice(0, 40)}`, `bet:market:${featured.id}`)
      .row();

    // Add 1-2 more markets if available
    for (let i = 1; i < Math.min(3, sorted.length); i++) {
      const m = sorted[i];
      keyboard
        .text(`${getMarketEmoji(m.type)} ${m.question.slice(0, 40)}`, `bet:market:${m.id}`)
        .row();
    }

    keyboard
      .text("📋 כל ההימורים", "bet:start")
      .row()
      .webApp("🎮 פתח אפליקציה", ctx.env.MINI_APP_URL);

    await ctx.reply(
      `⚡ *${from.first_name}, ברוך הבא ל-Kazam!*\n\n` +
        `💰 קיבלת *${user.coins} מטבעות* — תנחש נכון ותרוויח עוד.\n\n` +
        `🎯 *הימור ראשון — בחר שאלה:*`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      },
    );
  } else if (existingUser) {
    // RETURNING USER
    const keyboard = new InlineKeyboard()
      .text("🎯 הימור מהיר", "bet:start")
      .text("💰 יתרה", "bet:balance")
      .row()
      .text("🎁 בונוס יומי", "daily_claim")
      .row()
      .webApp("🎮 פתח אפליקציה", ctx.env.MINI_APP_URL);

    await ctx.reply(
      `⚡ *בחזרה ל-Kazam!*\n\n` +
        `💰 יתרה: *${user.coins} מטבעות*\n` +
        `🔥 רצף יומי: *${user.daily_streak} ימים*\n\n` +
        `מה עושים?`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      },
    );
  } else {
    // NEW USER but no open markets — just welcome
    const keyboard = new InlineKeyboard()
      .webApp("🎮 פתח את Kazam", ctx.env.MINI_APP_URL)
      .row()
      .text("🎯 הימור מהיר", "bet:start")
      .text("💰 יתרה", "bet:balance");

    await ctx.reply(
      `⚡ *${from.first_name}, ברוך הבא ל-Kazam!*\n\n` +
        `🎯 נחש איפה ומתי תהיה האזעקה הבאה\n` +
        `💰 יש לך *${user.coins} מטבעות* להתחיל\n\n` +
        `🔥 כל יום מגיע בונוס יומי!\n` +
        `📈 תעלה בדירוגים ותפתח הישגים\n\n` +
        `אין הימורים פתוחים כרגע — נעדכן אותך כשייפתח! 👇`,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      },
    );
  }
}