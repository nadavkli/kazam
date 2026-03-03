import type { Env } from "../index.js";
import type { NotificationMessage } from "@kazam/shared/types";
import { REGION_LABELS, type Region } from "@kazam/shared/regions";

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
      // Could broadcast to subscribed users
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

  // This is a broadcast — in production you'd maintain a subscribers list
  // For now, this just logs. Real implementation would iterate subscribers.
  console.log(
    `[ALERT] ${regionNames}: ${cityStr}`,
  );
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
