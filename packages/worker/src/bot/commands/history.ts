import type { BotContext } from "../context.js";
import { getUserByTelegramId, getUserBetHistory } from "@kazam/db/queries";
import { registerUser } from "../../services/user.js";
import { InlineKeyboard } from "grammy";

function getMarketEmoji(type: string): string {
  const map: Record<string, string> = {
    where: "📍", when: "⏰", how_many: "🔢",
    war_duration: "⚔️", alert_type: "🎯", intensity: "📊",
  };
  return map[type] ?? "🎲";
}

export async function handleHistory(ctx: BotContext): Promise<void> {
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

  const history = await getUserBetHistory(ctx.db, user.id, 10);

  if (history.length === 0) {
    const keyboard = new InlineKeyboard()
      .text("🎲 המר עכשיו!", "bet:start");

    await ctx.reply(
      "📜 *אין לך הימורים עדיין*\n\nהתחל לשחק עכשיו! 🎯",
      { parse_mode: "Markdown", reply_markup: keyboard },
    );
    return;
  }

  // Compute quick stats from the history
  const totalBets = history.length;
  const wins = history.filter((h) => h.is_win).length;
  const totalPayout = history.reduce((sum, h) => sum + (h.payout ?? 0), 0);
  const totalWagered = history.reduce((sum, h) => sum + h.amount, 0);
  const netChange = totalPayout - totalWagered;
  const netStr = netChange >= 0 ? `+${netChange}` : `${netChange}`;
  const netEmoji = netChange > 0 ? "📈" : netChange < 0 ? "📉" : "➡️";

  const lines = history.map((h) => {
    const emoji = getMarketEmoji(h.market_type);
    const resultEmoji = h.is_win === null ? "⏳" : h.is_win ? "✅" : "❌";
    const payoutStr = h.is_win === null
      ? "בהמתנה"
      : h.is_win
        ? `+${h.payout ?? 0} 🪙`
        : `-${h.amount} 🪙`;

    // Format date as dd/mm
    const date = new Date(h.placed_at);
    const timeStr = date.toLocaleDateString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
    });

    return `${resultEmoji} ${emoji} ${h.option_label} (${h.amount}🪙) → ${payoutStr}  _${timeStr}_`;
  });

  const text =
    `📜 *${user.first_name} — היסטוריית הימורים*\n` +
    `${"─".repeat(20)}\n\n` +
    lines.join("\n") +
    `\n\n${netEmoji} *סה"כ:* ${wins}/${totalBets} ניצחונות | ${netStr} 🪙`;

  const keyboard = new InlineKeyboard()
    .text("🎲 המר עכשיו!", "bet:start")
    .text("📊 סטטיסטיקות", "stats_share");

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
