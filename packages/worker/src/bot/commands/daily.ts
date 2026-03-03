import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "@kazam/db/queries";
import { registerUser, claimDailyBonus } from "../../services/user.js";

export async function handleDaily(ctx: BotContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  let user = await getUserByTelegramId(ctx.db, from.id);
  if (!user) {
    user = await registerUser(ctx.db, {
      id: from.id,
      username: from.username,
      first_name: from.first_name,
    });
  }

  const result = await claimDailyBonus(ctx.db, user);

  if ("error" in result) {
    await ctx.reply(
      `⏰ *כבר אספת את הבונוס היומי!*\n\nחזור מחר 🌅`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  const streakEmoji = result.streak >= 7 ? "🔥🔥🔥" : result.streak >= 3 ? "🔥🔥" : "🔥";

  await ctx.reply(
    `🎁 *בונוס יומי!*\n\n` +
      `💰 +${result.coins_awarded} מטבעות\n` +
      `${streakEmoji} רצף: ${result.streak} ימים\n` +
      `🪙 יתרה חדשה: *${result.new_balance}*`,
    { parse_mode: "Markdown" },
  );
}
