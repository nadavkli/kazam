import type { BotContext } from "../context.js";
import { InlineKeyboard } from "grammy";
import {
  getMarketById,
  getMarketOptions,
  getUserByTelegramId,
} from "@kazam/db/queries";
import { calculateMarketOdds } from "@kazam/shared/odds";

export async function handleBetFlowCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  const parts = data.split(":");
  // bet:start -> show markets
  // bet:market:ID -> show options
  // bet:option:MARKET_ID:OPTION_ID -> show amount selection
  // bet:amount:MARKET_ID:OPTION_ID:AMOUNT -> show confirmation

  if (parts[1] === "start") {
    // Redirect to /bet command handler
    const { handleBet } = await import("../commands/bet.js");
    await handleBet(ctx);
    return;
  }

  if (parts[1] === "balance") {
    const { handleBalance } = await import("../commands/balance.js");
    await handleBalance(ctx);
    return;
  }

  if (parts[1] === "market") {
    const marketId = parseInt(parts[2], 10);
    await showMarketOptions(ctx, marketId);
    return;
  }

  if (parts[1] === "option") {
    const marketId = parseInt(parts[2], 10);
    const optionId = parseInt(parts[3], 10);
    await showAmountSelection(ctx, marketId, optionId);
    return;
  }

  if (parts[1] === "amount") {
    const marketId = parseInt(parts[2], 10);
    const optionId = parseInt(parts[3], 10);
    const amount = parseInt(parts[4], 10);
    await showConfirmation(ctx, marketId, optionId, amount);
    return;
  }
}

async function showMarketOptions(
  ctx: BotContext,
  marketId: number,
): Promise<void> {
  const market = await getMarketById(ctx.db, marketId);
  if (!market || market.status !== "open") {
    await ctx.reply("🔒 ההימור סגור");
    return;
  }

  const options = await getMarketOptions(ctx.db, marketId);
  const oddsMap = calculateMarketOdds(options, market.total_pool);

  const keyboard = new InlineKeyboard();
  for (const opt of options) {
    const odds = oddsMap.get(opt.id);
    const oddsStr = odds ? `x${odds.odds.toFixed(1)}` : "";
    keyboard
      .text(
        `${opt.label} (${oddsStr})`,
        `bet:option:${marketId}:${opt.id}`,
      )
      .row();
  }
  keyboard.text("◀️ חזרה", "bet:start");

  await ctx.editMessageText(
    `🎯 *${market.question}*\n\n` +
      `💰 קופה: ${market.total_pool} 🪙\n\n` +
      `בחר תשובה:`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    },
  );
}

async function showAmountSelection(
  ctx: BotContext,
  marketId: number,
  optionId: number,
): Promise<void> {
  const amounts = [10, 25, 50, 100, 250, 500];

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < amounts.length; i += 3) {
    for (let j = i; j < Math.min(i + 3, amounts.length); j++) {
      keyboard.text(
        `${amounts[j]} 🪙`,
        `bet:amount:${marketId}:${optionId}:${amounts[j]}`,
      );
    }
    keyboard.row();
  }
  keyboard.text("◀️ חזרה", `bet:market:${marketId}`);

  await ctx.editMessageText(`💰 *בחר סכום הימור:*`, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

async function showConfirmation(
  ctx: BotContext,
  marketId: number,
  optionId: number,
  amount: number,
): Promise<void> {
  const market = await getMarketById(ctx.db, marketId);
  const options = await getMarketOptions(ctx.db, marketId);
  const option = options.find((o) => o.id === optionId);

  if (!market || !option) {
    await ctx.reply("❌ שגיאה, נסה שוב");
    return;
  }

  const oddsMap = calculateMarketOdds(options, market.total_pool);
  const odds = oddsMap.get(optionId);
  const potentialPayout = odds
    ? Math.floor(amount * odds.odds)
    : amount;

  const keyboard = new InlineKeyboard()
    .text("✅ אישור", `confirm:${marketId}:${optionId}:${amount}`)
    .text("❌ ביטול", `bet:market:${marketId}`);

  await ctx.editMessageText(
    `📝 *אישור הימור*\n\n` +
      `🎯 ${market.question}\n` +
      `📍 תשובה: *${option.label}*\n` +
      `💰 סכום: *${amount} 🪙*\n` +
      `📈 רווח פוטנציאלי: *~${potentialPayout} 🪙*\n\n` +
      `בטוח?`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    },
  );
}
