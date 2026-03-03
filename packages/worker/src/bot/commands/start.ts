import type { BotContext } from "../context.js";
import { registerUser } from "../../services/user.js";
import { checkAchievements } from "../../services/achievement.js";
import { getUserByReferralCode } from "@kazam/db/queries";
import { REFERRAL_BONUS } from "@kazam/shared/constants";
import { InlineKeyboard } from "grammy";
import { Bot } from "grammy";

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

  const keyboard = new InlineKeyboard()
    .webApp("🎮 פתח את Kazam", ctx.env.MINI_APP_URL)
    .row()
    .text("🎯 הימור מהיר", "bet:start")
    .text("💰 יתרה", "bet:balance");

  await ctx.reply(
    `⚡ *ברוך הבא ל-Kazam!*\n\n` +
      `🎯 נחש איפה ומתי תהיה האזעקה הבאה\n` +
      `💰 יש לך *${user.coins} מטבעות* להתחיל\n\n` +
      `🔥 כל יום מגיע בונוס יומי!\n` +
      `📈 תעלה בדירוגים ותפתח הישגים\n\n` +
      `השתמש ב /bet כדי להמר או פתח את האפליקציה 👇`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    },
  );
}
