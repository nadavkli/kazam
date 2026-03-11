import type { Env } from "../index.js";
import type { NotificationMessage } from "@kazam/shared/types";
import type { Database } from "@kazam/db";
import { REGION_LABELS, type Region } from "@kazam/shared/regions";
import { createDb } from "@kazam/db";
import { getAllUsers, getUsersWithoutDailyClaim } from "@kazam/db/queries";
import { IST_TIMEZONE, DAILY_BONUS } from "@kazam/shared/constants";

/** Telegram allows ~30 msgs/sec to different chats. Use batches of 25 for safety. */
const BROADCAST_BATCH_SIZE = 25;

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
    case "markets_batch_opened":
      await sendMarketsBatchNotification(notification, env);
      break;
    case "daily_summary":
      await sendDailySummaryNotification(notification, env);
      break;
  }
}

// ====== Broadcast helper ======

/**
 * Send a message to all users in parallel batches.
 * Handles rate limiting by processing BROADCAST_BATCH_SIZE users concurrently.
 * Silently skips users who blocked the bot (403 errors).
 */
async function broadcastToAllUsers(
  env: Env,
  text: string,
  keyboard?: object,
): Promise<void> {
  const db = createDb(env.DB);
  const users = await getAllUsers(db);

  for (let i = 0; i < users.length; i += BROADCAST_BATCH_SIZE) {
    const batch = users.slice(i, i + BROADCAST_BATCH_SIZE);
    await Promise.allSettled(
      batch.map((user) =>
        sendTelegramMessageWithKeyboard(env.TELEGRAM_BOT_TOKEN, user.telegram_id, text, keyboard),
      ),
    );
  }
}

// ====== Notification handlers ======

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

  await broadcastToAllUsers(env, text, keyboard);
}

async function sendBetResultNotification(
  notification: Extract<NotificationMessage, { type: "bet_result" }>,
  env: Env,
): Promise<void> {
  const { telegram_id, market_question, option_label, is_win, payout, prediction_streak } =
    notification;

  let text: string;
  let keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; switch_inline_query?: string }>> } | undefined;

  if (is_win) {
    // Build streak display for winners
    let streakLine = "";
    if (prediction_streak >= 10) {
      streakLine = `\n🔥🔥🔥 *רצף אגדי! ${prediction_streak} ברצף!* 🔥🔥🔥`;
    } else if (prediction_streak >= 7) {
      streakLine = `\n🔥🔥 *רצף מטורף! ${prediction_streak} ברצף!* 🔥🔥`;
    } else if (prediction_streak >= 5) {
      streakLine = `\n🔥 *Hot Streak! ${prediction_streak} ברצף!*`;
    } else if (prediction_streak >= 3) {
      streakLine = `\n🔥 *רצף ניצחונות — ${prediction_streak} ברצף!*`;
    }

    text =
      `⚡ *Kazam! ניצחת!*\n\n` +
      `🎯 ${market_question}\n` +
      `✅ תשובה: ${option_label}\n` +
      `💰 +${payout} מטבעות${streakLine}\n\n` +
      `You called it! 🔥`;

    // Win: show "bet again" + "share" + "refer" buttons
    keyboard = {
      inline_keyboard: [
        [{ text: "🎲 המר שוב!", callback_data: "bet:start" }],
        [
          { text: "📤 שתף ניצחון", switch_inline_query: `⚡ ניצחתי ב-Kazam! +${payout} מטבעות ${streakLine ? `(${prediction_streak} ברצף!)` : ""}\nבואו לשחק: @KazamGameBot 🎯` },
          { text: "🤝 הזמן חבר", callback_data: "refer_friend" },
        ],
      ],
    };
  } else {
    text =
      `😔 *לא הפעם...*\n\n` +
      `🎯 ${market_question}\n` +
      `❌ התשובה הנכונה: ${option_label}\n\n` +
      `אל תוותר! הנקמה מתוקה 🔥`;

    // Loss: show "revenge bet" + "refer for coins" buttons
    keyboard = {
      inline_keyboard: [
        [{ text: "🔄 נקמה! המר שוב", callback_data: "bet:start" }],
        [{ text: "🤝 הזמן חבר → +200 מטבעות", callback_data: "refer_friend" }],
      ],
    };
  }

  await sendTelegramMessageWithKeyboard(env.TELEGRAM_BOT_TOKEN, telegram_id, text, keyboard);
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

  const keyboard = {
    inline_keyboard: [
      [{ text: "🎲 המר עכשיו!", callback_data: `bet:market:${market.id}` }],
    ],
  };

  await broadcastToAllUsers(env, text, keyboard);
}

async function sendMarketsBatchNotification(
  notification: Extract<NotificationMessage, { type: "markets_batch_opened" }>,
  env: Env,
): Promise<void> {
  const { markets: newMarkets } = notification;
  if (newMarkets.length === 0) return;

  const emojiMap: Record<string, string> = {
    where: "📍", when: "⏰", how_many: "🔢",
    war_duration: "⚔️", alert_type: "🎯", intensity: "📊",
  };

  const lines = newMarkets.map((m) => {
    const emoji = emojiMap[m.market.type] ?? "🎲";
    return `${emoji} ${m.market.question}`;
  });

  const text =
    `🎲 *${newMarkets.length} הימורים חדשים נפתחו!*\n\n` +
    lines.join("\n") +
    `\n\nלחץ למטה כדי להמר! 👇`;

  const buttons = newMarkets.map((m) => {
    const emoji = emojiMap[m.market.type] ?? "🎲";
    const typeLabels: Record<string, string> = {
      where: "איפה?", when: "מתי?", alert_type: "מה?",
      how_many: "כמה?", intensity: "עוצמה", war_duration: "כמה זמן?",
    };
    return [{ text: `${emoji} ${typeLabels[m.market.type] ?? "המר"}`, callback_data: `bet:market:${m.market.id}` }];
  });

  const keyboard = { inline_keyboard: buttons };

  await broadcastToAllUsers(env, text, keyboard);
}

async function sendDailySummaryNotification(
  notification: Extract<NotificationMessage, { type: "daily_summary" }>,
  env: Env,
): Promise<void> {
  const { settled, newMarkets } = notification;

  const emojiMap: Record<string, string> = {
    where: "📍", when: "⏰", how_many: "🔢",
    war_duration: "⚔️", alert_type: "🎯", intensity: "📊",
  };

  let text = `📊 *סיכום יומי*\n\n`;

  if (settled > 0) {
    text += `✅ ${settled} הימורים נסגרו — בדקו אם ניצחתם!\n\n`;
  }

  if (newMarkets.length > 0) {
    text += `🎲 *הימורים חדשים למחר:*\n`;
    for (const m of newMarkets) {
      const emoji = emojiMap[m.type] ?? "🎲";
      text += `${emoji} ${m.question}\n`;
    }
    text += `\nלחצו למטה להמר! 👇`;
  }

  const buttons = newMarkets.map((m) => {
    const emoji = emojiMap[m.type] ?? "🎲";
    const typeLabels: Record<string, string> = {
      how_many: "כמה מחר?", intensity: "עוצמה מחר",
      where: "איפה?", when: "מתי?", alert_type: "מה?",
    };
    return [{ text: `${emoji} ${typeLabels[m.type] ?? "המר"}`, callback_data: `bet:market:${m.id}` }];
  });

  const keyboard = buttons.length > 0 ? { inline_keyboard: buttons } : undefined;

  await broadcastToAllUsers(env, text, keyboard);
}

/**
 * Send daily reminder to users who haven't claimed their bonus today.
 * Called by cron at noon IST (09:00 UTC).
 * Uses daily_streak (login streak) instead of current_streak (prediction streak).
 */
export async function sendDailyReminders(
  db: Database,
  env: Env,
): Promise<void> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
  const users = await getUsersWithoutDailyClaim(db, today);

  console.log(`[DAILY] Sending reminders to ${users.length} users`);

  // Batch reminders in parallel too
  for (let i = 0; i < users.length; i += BROADCAST_BATCH_SIZE) {
    const batch = users.slice(i, i + BROADCAST_BATCH_SIZE);
    await Promise.allSettled(
      batch.map((user) => {
        const streakWarning = user.daily_streak > 0
          ? `\n🔥 יש לך רצף של ${user.daily_streak} ימים! אל תפספס!`
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

        return sendTelegramMessageWithKeyboard(env.TELEGRAM_BOT_TOKEN, user.telegram_id, text, keyboard);
      }),
    );
  }
}

// ====== Telegram API helpers ======

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
    // Only log non-403 errors (403 = user blocked bot, expected)
    if (response.status !== 403) {
      console.error(`Telegram API error: ${response.status} - ${errorText}`);
    }
  }
}