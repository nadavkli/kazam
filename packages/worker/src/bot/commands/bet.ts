import type { BotContext } from "../context.js";
import { InlineKeyboard } from "grammy";
import { listMarkets, getMarketOptions } from "@kazam/db/queries";
import { calculateMarketOdds } from "@kazam/shared/odds";

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

export async function handleBet(ctx: BotContext): Promise<void> {
  const openMarkets = await listMarkets(ctx.db, {
    status: "open",
    limit: 10,
    offset: 0,
  });

  if (openMarkets.length === 0) {
    await ctx.reply(
      "🔒 *אין הימורים פתוחים כרגע*\n\nנעדכן אותך כשייפתח הימור חדש!",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const keyboard = new InlineKeyboard();

  for (const market of openMarkets) {
    const emoji = getMarketEmoji(market.type);
    keyboard
      .text(
        `${emoji} ${market.question.slice(0, 40)}`,
        `bet:market:${market.id}`,
      )
      .row();
  }

  await ctx.reply(
    `🎯 *בחר הימור:*\n\n` +
      openMarkets
        .map((m) => {
          const emoji = getMarketEmoji(m.type);
          return `${emoji} ${m.question} (Pool: ${m.total_pool}🪙)`;
        })
        .join("\n"),
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    },
  );
}
