import type { Env } from "../index.js";
import type { NotificationMessage } from "@kazam/shared/types";
import type { Database } from "@kazam/db";
import { REGION_LABELS, type Region } from "@kazam/shared/regions";
import { createDb } from "@kazam/db";
import { getAllUsers, getUsersWithoutDailyClaim } from "@kazam/db/queries";
import { IST_TIMEZONE, DAILY_BONUS } from "@kazam/shared/constants";

/**
 * Process notification queue messages — sends Telegram messages to users.
 */
export async function handleNotificationBatch(
  batch: MessageBatch,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    try {
      const notification = message.body as NotificationMessage;
      await processNotification(notification, env);
      message.ack();
    } catch (err) {
      console.error("Notification processing error:", err);
      message.retry();
    }
  }
}

async function processNotification(
  notification: NotificationMessage,
  env: Env,
): Promise<void> {
  switch (notification.type) {
    case "alert":
      await sendAlertNotification(notification, env);
      break;
    case "bet_result":
      await sendBetResultNotification(notification, env);
      break;
    case "market_opened":
      await sendMarketOpenedNotification(notification, env);
      break;
  }
}

async function sendAlertNotification(
  notification: Extract<NotificationMessage, { type: "alert" }>,
  env: Env,
): Promise<void> {
  const { alert } = notification;
  const regionNames = (alert.regions as Region[])
    .map((r) => REGION_LABELS[r]?.he ?? r)
    .join(", ");

  const cityList = alert.cities.slice(0, 5).join(", ");
  const moreCount = Math.max(0, alert.cities.length - 5);
  const cityStr = moreCount > 0 ? `${cityList} +${moreCount}` : cityList;

  const text =
    `🚨 *אזעקה!*\n\n` +
    `📍 ${regionNames}\n` +
    `🏙️ ${cityStr}\n\n` +
    `⚡ יש הימורים פתוחים — בואו לנחש!`;

  const keyboard = {
    inline_keyboard: [
      [{ text: "🎲 המר עכשיו!", callback_data: "bet:start" }],
    ],
  };

  // Broadcast to all users
  const db = createDb(env.DB);
  const users = await getAllUsers(db);

  for (const user of users) {
    try {
      await sendTelegramMessageWithKeyboard(env.TELEGRAM_BOT_TOKEN, user.telegram_id, text, keyboard);
    } catch {
      // Skip users who blocked the bot
    }
  }
}

async function sendBetResultNotification(
  notification: Extract<NotificationMessage, { type: "bet_result" }>,
  env: Env,
): Promise<void> {
  const { telegram_id, market_question, option_label, is_win, payout } =
    notification;

  let text: string;
  if (is_win) {
    text =
      `⚡ *Kazam! ניצחת!*\n\n` +
      `🎯 ${market_question}\n` +
      `✅ תשובה: ${option_label}\n` +
      `💰 +${payout} מטבעות\n\n` +
      `You called it! 🔥\n\n` +
      `🤝 הזמן חברים עם /refer וקבל עוד 200 מטבעות!`;
  } else {
    text =
      `😔 *לא הפעם...*\n\n` +
      `🎯 ${market_question}\n` +
      `❌ התשובה הנכונה: ${option_label}\n\n` +
      `נגמרו המטבעות? הזמן חבר עם /refer וקבל 200 מטבעות בונוס! 🤝\n` +
      `נסה שוב! בפעם הבאה תצליח 💪`;
  }

  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegram_id, text);
}

async function sendMarketOpenedNotification(
  notification: Extract<NotificationMessage, { type: "market_opened" }>,
  env: Env,
): Promise<void> {
  const { market } = notification;

  const emojiMap: Record<string, string> = {
    where: "📍", when: "⏰", how_many: "🔢",
    war_duration: "⚔️", alert_type: "🎯", intensity: "📊",
  };
  const typeEmoji = emojiMap[market.type] ?? "🎲";
  const text =
    `${typeEmoji} *הימור חדש נפתח!*\n\n` +
    `🎯 ${market.question}\n\n` +
    `לחץ למטה כדי להמר עכשיו! 👇`;

  // Inline keyboard with bet button
  const keyboard = {
    inline_keyboard: [
      [{ text: "🎲 המר עכשיו!", callback_data: `bet:market:${market.id}` }],
    ],
  };

  const db = createDb(env.DB);
  const users = await getAllUsers(db);

  for (const user of users) {
    try {
      await sendTelegramMessageWithKeyboard(env.TELEGRAM_BOT_TOKEN, user.telegram_id, text, keyboard);
    } catch {
      // Skip users who blocked the bot
    }
  }
}

/**
 * Send daily reminder to users who haven't claimed their bonus today.
 * Called by cron at noon IST (09:00 UTC).
 */
export async function sendDailyReminders(
  db: Database,
  env: Env,
): Promise<void> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
  const users = await getUsersWithoutDailyClaim(db, today);

  console.log(`[DAILY] Sending reminders to ${users.length} users`);

  for (const user of users) {
    const streakWarning = user.current_streak > 0
      ? `\n🔥 יש לך רצף של ${user.current_streak} ימים! אל תפספס!`
      : "";

    const text =
      `🎁 *לא שכחת לאסוף את הבונוס היומי?*\n\n` +
      `💰 ${DAILY_BONUS} מטבעות מחכים לך!${streakWarning}\n\n` +
      `👉 לחץ /daily לאיסוף\n\n` +
      `🤝 הזמן חברים עם /refer וקבל 200 מטבעות בונוס לשניכם!`;

    const keyboard = {
      inline_keyboard: [
        [{ text: "🎁 אסוף בונוס יומי", callback_data: "daily_claim" }],
        [{ text: "🤝 הזמן חבר", callback_data: "refer_friend" }],
      ],
    };

    try {
      await sendTelegramMessageWithKeyboard(env.TELEGRAM_BOT_TOKEN, user.telegram_id, text, keyboard);
    } catch {
      // Skip users who blocked the bot
    }
  }
}

async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  parseMode = "Markdown",
): Promise<void> {
  await sendTelegramMessageWithKeyboard(botToken, chatId, text, undefined, parseMode);
}

async function sendTelegramMessageWithKeyboard(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: object,
  parseMode = "Markdown",
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Telegram API error: ${response.status} - ${errorText}`);
  }
}
