import type { Env } from "../index.js";
import type { NotificationMessage } from "@kazam/shared/types";
import { REGION_LABELS, type Region } from "@kazam/shared/regions";
import { createDb } from "@kazam/db";
import { getAllUsers } from "@kazam/db/queries";

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
    `⚡ יש שווקים פתוחים — בואו לנחש!`;

  // Broadcast to all users
  const db = createDb(env.DB);
  const users = await getAllUsers(db);

  for (const user of users) {
    try {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, user.telegram_id, text);
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
      `You called it! 🔥`;
  } else {
    text =
      `😔 *לא הפעם...*\n\n` +
      `🎯 ${market_question}\n` +
      `❌ התשובה הנכונה: ${option_label}\n\n` +
      `נסה שוב! בפעם הבאה תצליח 💪`;
  }

  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, telegram_id, text);
}

async function sendMarketOpenedNotification(
  notification: Extract<NotificationMessage, { type: "market_opened" }>,
  env: Env,
): Promise<void> {
  const { market } = notification;

  const typeEmoji = market.type === "where" ? "📍" : market.type === "when" ? "⏰" : "🔢";
  const text =
    `${typeEmoji} *שוק חדש נפתח!*\n\n` +
    `🎯 ${market.question}\n\n` +
    `השתמש ב /bet כדי להמר עכשיו!`;

  const db = createDb(env.DB);
  const users = await getAllUsers(db);

  for (const user of users) {
    try {
      await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, user.telegram_id, text);
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
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Telegram API error: ${response.status} - ${errorText}`);
  }
}
