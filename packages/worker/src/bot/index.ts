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
import { yesterdayCommand } from "./commands/yesterday.js";

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
  bot.command("yesterday", yesterdayCommand);

  // Callback queries (inline keyboard)
  bot.callbackQuery(/^bet:/, handleBetFlowCallback);
  bot.callbackQuery(/^confirm:/, handleConfirmCallback);

  // Daily claim callback (from reminder notification)
  bot.callbackQuery("daily_claim", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleDaily(ctx);
  });

  // Refer friend callback (from reminder notification)
  bot.callbackQuery("refer_friend", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleRefer(ctx);
  });

  // Stats share callback — sends shareable stats as text for forwarding
  bot.callbackQuery("stats_share", async (ctx) => {
    await ctx.answerCallbackQuery();
    const from = ctx.from;
    if (!from) return;

    const { getUserByTelegramId, getUserAchievements } = await import("@kazam/db/queries");
    const { ACHIEVEMENT_INFO } = await import("@kazam/shared/constants");
    const user = await getUserByTelegramId(ctx.db, from.id);
    if (!user) return;

    const accuracy = user.total_predictions > 0
      ? Math.round((user.correct_predictions / user.total_predictions) * 100)
      : 0;
    const score = user.correct_predictions * 10 + Math.floor(user.total_earned / 100) + user.current_streak * 5;

    const achievements = await getUserAchievements(ctx.db, user.id);
    const badgeEmojis = achievements
      .map((a: { type: string }) => (ACHIEVEMENT_INFO as Record<string, { emoji: string }>)[a.type]?.emoji)
      .filter(Boolean)
      .join("");

    const shareText =
      `⚡ Kazam Stats — ${user.first_name}\n\n` +
      `🎯 דיוק: ${accuracy}% (${user.correct_predictions}/${user.total_predictions})\n` +
      `🔥 רצף: ${user.current_streak} | שיא: ${user.longest_streak}\n` +
      `🏆 ניקוד: ${score}\n` +
      `${badgeEmojis ? `🏅 ${badgeEmojis}\n` : ""}` +
      `\nחושבים שאתם יותר טובים? 😏\n` +
      `שחקו ב-@KazamGameBot 🚀`;

    await ctx.reply(shareText);
  });

  // Stats leaderboard callback — show leaderboard
  bot.callbackQuery("stats_leaderboard", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleLeaderboard(ctx);
  });

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