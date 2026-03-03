import { Bot, webhookCallback } from "grammy";
import type { BotContext } from "./context.js";
import { createDb } from "@kazam/db";
import type { Env } from "../index.js";

// Commands
import { handleStart } from "./commands/start.js";
import { handleBet } from "./commands/bet.js";
import { handleBalance } from "./commands/balance.js";
import { handleLeaderboard } from "./commands/leaderboard.js";
import { handleDaily } from "./commands/daily.js";
import { handleStats } from "./commands/stats.js";
import { handleRefer } from "./commands/refer.js";
import { handleHelp } from "./commands/help.js";

// Callbacks
import { handleBetFlowCallback } from "./callbacks/bet-flow.js";
import { handleConfirmCallback } from "./callbacks/confirm.js";

function createBot(env: Env): Bot<BotContext> {
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

  // Error handler - log but don't crash
  bot.catch((err) => {
    console.error("Bot error:", err.message);
  });

  // Inject DB and env into context
  bot.use(async (ctx, next) => {
    ctx.db = createDb(env.DB);
    ctx.env = {
      TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
      MINI_APP_URL: env.MINI_APP_URL,
      NOTIFICATION_QUEUE: env.NOTIFICATION_QUEUE,
      DB: env.DB,
    };
    await next();
  });

  // Commands
  bot.command("start", handleStart);
  bot.command("bet", handleBet);
  bot.command("balance", handleBalance);
  bot.command("leaderboard", handleLeaderboard);
  bot.command("daily", handleDaily);
  bot.command("stats", handleStats);
  bot.command("refer", handleRefer);
  bot.command("help", handleHelp);

  // Callback queries (inline keyboard)
  bot.callbackQuery(/^bet:/, handleBetFlowCallback);
  bot.callbackQuery(/^confirm:/, handleConfirmCallback);

  // Copy referral link callback — sends link as plain text for easy copying
  bot.callbackQuery(/^copy_referral_/, async (ctx) => {
    const code = ctx.callbackQuery.data.replace("copy_referral_", "");
    const botUsername = ctx.me.username;
    const link = `https://t.me/${botUsername}?start=ref_${code}`;
    await ctx.answerCallbackQuery();
    await ctx.reply(link);
  });

  return bot;
}

export async function handleBotWebhook(
  update: unknown,
  env: Env,
): Promise<void> {
  try {
    const bot = createBot(env);
    const handleUpdate = webhookCallback(bot, "cloudflare-mod");
    const fakeRequest = new Request("https://internal/bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    await handleUpdate(fakeRequest);
  } catch (err) {
    console.error("Webhook handler error:", err);
    // Don't rethrow — return 200 to Telegram so it doesn't retry
  }
}
