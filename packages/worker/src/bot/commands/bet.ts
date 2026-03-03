import type { BotContext } from "../context.js";
import { InlineKeyboard } from "grammy";
import { listMarkets, getMarketOptions } from "@kazam/db/queries";
import { calculateMarketOdds } from "@kazam/shared/odds";

export async function handleBet(ctx: BotContext): Promise<void> {
  const openMarkets = await listMarkets(ctx.db, {
    status: "open",
    limit: 5,
    offset: 0,
  });

  if (openMarkets.length === 0) {
    await ctx.reply(
      "🔒 *אין שווקים פתוחים כרגע*\n\nנעדכן אותך כשייפתח שוק חדש!",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const keyboard = new InlineKeyboard();

  for (const market of openMarkets) {
    const emoji = market.type === "where" ? "📍" : market.type === "when" ? "⏰" : "🔢";
    keyboard
      .text(
        `${emoji} ${market.question.slice(0, 40)}`,
        `bet:market:${market.id}`,
      )
      .row();
  }

  await ctx.reply(
    `🎯 *בחר שוק להימור:*\n\n` +
      openMarkets
        .map((m) => {
          const emoji = m.type === "where" ? "📍" : m.type === "when" ? "⏰" : "🔢";
          return `${emoji} ${m.question} (Pool: ${m.total_pool}🪙)`;
        })
        .join("\n"),
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    },
  );
}
