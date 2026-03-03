import type { BotContext } from "../context.js";
import { getLeaderboard } from "@kazam/db/queries";

export async function handleLeaderboard(ctx: BotContext): Promise<void> {
  const entries = await getLeaderboard(ctx.db, {
    limit: 5,
    offset: 0,
    period: "weekly",
  });

  if (entries.length === 0) {
    await ctx.reply("🏆 *הדירוג ריק*\n\nהיה הראשון להמר!", {
      parse_mode: "Markdown",
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

  const lines = entries.map((e, i) => {
    const medal = medals[i] ?? `${i + 1}.`;
    const name = e.username ? `@${e.username}` : e.first_name;
    const accuracy =
      e.total_predictions > 0
        ? Math.round((e.correct_predictions / e.total_predictions) * 100)
        : 0;
    return `${medal} *${name}* — ${e.score} נק' (${accuracy}% דיוק)`;
  });

  await ctx.reply(
    `🏆 *דירוג שבועי*\n\n${lines.join("\n")}\n\n` +
      `השתמש באפליקציה לדירוג מלא 📊`,
    { parse_mode: "Markdown" },
  );
}
