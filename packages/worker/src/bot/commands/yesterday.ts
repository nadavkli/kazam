import type { CommandContext } from "grammy";
import type { BotContext } from "../context.js";
import { getGhostComparison, generateShareCard } from "../../services/daily-summary.js";
import { getUserByTelegramId } from "@kazam/db/queries";

export async function yesterdayCommand(ctx: CommandContext<BotContext>) {
  if (!ctx.from) {
    await ctx.reply("Please /start first!");
    return;
  }

  const user = await getUserByTelegramId(ctx.db, ctx.from.id);
  if (!user) {
    await ctx.reply("Please /start first!");
    return;
  }

  const ghost = await getGhostComparison(ctx.db, user.id);

  if (!ghost.yesterday_summary) {
    await ctx.reply(
      "אין לך הימורים מאתמול 🤷\n\nהתחל לשחק עכשיו!",
      { parse_mode: "HTML" },
    );
    return;
  }

  const yday = ghost.yesterday_summary;
  const emoji = yday.net_change > 0 ? "🔥" : yday.net_change < 0 ? "💀" : "😐";
  const change = yday.net_change > 0 ? `+${yday.net_change}` : `${yday.net_change}`;
  const winRatePct = Math.round(yday.win_rate * 100);

  let message = `${emoji} <b>אתמול בקזאם</b>\n\n`;
  message += `💰 רווח/הפסד: ${change} מטבעות\n`;
  message += `🎯 אחוז הצלחה: ${winRatePct}% (${yday.bets_won}/${yday.bets_placed})\n`;
  message += `📈 הזכייה הגדולה: +${yday.biggest_win}\n`;
  if (yday.biggest_loss < 0) {
    message += `📉 ההפסד הגדול: ${yday.biggest_loss}\n`;
  }

  message += `\n`;

  // Ghost challenge
  if (ghost.suggestion === "copy") {
    message += `💡 <b>יום טוב אתמול!</b>\n`;
    message += `אם תשחק אותו דבר היום, תוכל להרוויח בערך ${ghost.if_repeated_result > 0 ? "+" : ""}${ghost.if_repeated_result} מטבעות!\n\n`;
    message += `👻 <b>אתגר הרוח:</b> שחק את אותן השוקות שוב!`;
  } else if (ghost.suggestion === "revenge") {
    message += `💡 <b>יום קשה אתמול...</b>\n`;
    message += `זמן לנקמה! שנה אסטרטגיה ותנצח את אתמול-אתה!\n\n`;
    message += `👻 <b>אתגר הרוח:</b> הפוך את התחזיות שלך!`;
  } else {
    message += `👻 <b>אתגר הרוח:</b> נסה משהו חדש היום!`;
  }

  // Add share button
  await ctx.reply(message, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🔥 שתף את הסטטיסטיקות",
            switch_inline_query: generateShareCard(user, yday),
          },
        ],
        [{ text: "📊 פתח משחק", web_app: { url: ctx.env.MINI_APP_URL } }],
      ],
    },
  });
}
