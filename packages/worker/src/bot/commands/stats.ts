import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "@kazam/db/queries";
import { registerUser } from "../../services/user.js";

export async function handleStats(ctx: BotContext): Promise<void> {
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

  const accuracy =
    user.total_predictions > 0
      ? Math.round(
          (user.correct_predictions / user.total_predictions) * 100,
        )
      : 0;

  const score =
    user.correct_predictions * 10 +
    Math.floor(user.total_earned / 100) +
    user.current_streak * 5;

  await ctx.reply(
    `📊 *הסטטיסטיקות שלך*\n\n` +
      `🎯 ניחושים: ${user.correct_predictions}/${user.total_predictions}\n` +
      `📈 דיוק: ${accuracy}%\n` +
      `🔥 רצף נוכחי: ${user.current_streak}\n` +
      `⭐ רצף שיא: ${user.longest_streak}\n` +
      `💰 סה"כ הרוויח: ${user.total_earned}\n` +
      `🏆 ניקוד: ${score}`,
    { parse_mode: "Markdown" },
  );
}
