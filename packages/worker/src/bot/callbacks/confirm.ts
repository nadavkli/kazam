import type { BotContext } from "../context.js";
import { getUserByTelegramId } from "@kazam/db/queries";
import { placeBetService } from "../../services/bet.js";
import { registerUser } from "../../services/user.js";
import { checkAchievements } from "../../services/achievement.js";

export async function handleConfirmCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const from = ctx.from;
  if (!from) return;

  await ctx.answerCallbackQuery();

  // confirm:MARKET_ID:OPTION_ID:AMOUNT
  const parts = data.split(":");
  const marketId = parseInt(parts[1], 10);
  const optionId = parseInt(parts[2], 10);
  const amount = parseInt(parts[3], 10);

  let user = await getUserByTelegramId(ctx.db, from.id);
  if (!user) {
    user = await registerUser(ctx.db, {
      id: from.id,
      username: from.username,
      first_name: from.first_name,
    });
  }

  const result = await placeBetService(ctx.db, user, {
    market_id: marketId,
    option_id: optionId,
    amount,
  });

  if ("error" in result) {
    await ctx.editMessageText(`❌ *שגיאה:* ${result.error}`, {
      parse_mode: "Markdown",
    });
    return;
  }

  // Check achievements
  const updatedUser = { ...user, total_predictions: user.total_predictions + 1 };
  await checkAchievements(ctx.db, updatedUser);

  const option = result.market.options.find((o) => o.id === optionId);
  const potentialPayout = option
    ? Math.floor(amount * option.odds)
    : amount;

  await ctx.editMessageText(
    `⚡ *Kazam! ההימור הוצב!*\n\n` +
      `🎯 ${result.market.question}\n` +
      `📍 ${option?.label ?? "?"}\n` +
      `💰 ${amount} 🪙\n` +
      `📈 רווח פוטנציאלי: ~${potentialPayout} 🪙\n\n` +
      `🪙 יתרה: *${result.new_balance}*\n\n` +
      `בהצלחה! 🤞`,
    { parse_mode: "Markdown" },
  );
}
