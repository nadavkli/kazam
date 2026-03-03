import type { BotContext } from "../context.js";
import { getUserByTelegramId, getUserActiveBets } from "@kazam/db/queries";
import { registerUser } from "../../services/user.js";

export async function handleBalance(ctx: BotContext): Promise<void> {
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

  const activeBets = await getUserActiveBets(ctx.db, user.id);
  const totalAtRisk = activeBets.reduce((sum, b) => sum + b.bets.amount, 0);

  await ctx.reply(
    `💰 *היתרה שלך*\n\n` +
      `🪙 מטבעות: *${user.coins}*\n` +
      `🎯 הימורים פעילים: *${activeBets.length}*\n` +
      `⚠️ בסיכון: *${totalAtRisk}*\n\n` +
      `📊 סה"כ הרוויח: ${user.total_earned}\n` +
      `📊 סה"כ הימר: ${user.total_wagered}\n` +
      `🔥 רצף: ${user.current_streak} | שיא: ${user.longest_streak}`,
    { parse_mode: "Markdown" },
  );
}
