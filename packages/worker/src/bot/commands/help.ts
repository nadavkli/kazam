import type { BotContext } from "../context.js";
import { InlineKeyboard } from "grammy";

export async function handleHelp(ctx: BotContext): Promise<void> {
  const keyboard = new InlineKeyboard().webApp(
    "🎮 פתח את Kazam",
    ctx.env.MINI_APP_URL,
  );

  await ctx.reply(
    `❓ *עזרה - Kazam*\n\n` +
      `⚡ Kazam הוא משחק ניחושים על אזעקות פיקוד העורף\n\n` +
      `*פקודות:*\n` +
      `/bet — הימור מהיר\n` +
      `/balance — בדוק יתרה\n` +
      `/daily — אסוף בונוס יומי\n` +
      `/yesterday — 👻 אתגר הרוח (אתמול vs היום)\n` +
      `/leaderboard — צפה בדירוג\n` +
      `/stats — הסטטיסטיקות שלך\n` +
      `/refer — הזמן חברים\n` +
      `/help — הודעה זו\n\n` +
      `*איך לשחק:*\n` +
      `1️⃣ בחר הימור (איפה/מתי/כמה)\n` +
      `2️⃣ הימר מטבעות על התשובה שלך\n` +
      `3️⃣ אם צדקת, תרוויח מהקופה!\n\n` +
      `🪙 100 מטבעות בונוס יומי + בונוס רצף\n` +
      `⚠️ מטבעות וירטואליים בלבד, לא כסף אמיתי`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    },
  );
}
