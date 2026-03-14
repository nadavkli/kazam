import type { BotContext } from "../context.js";
import { getUserByTelegramId, getUserAchievements, getLeaderboard, getReferralCount } from "@kazam/db/queries";
import { registerUser } from "../../services/user.js";
import { ACHIEVEMENT_INFO, type AchievementType } from "@kazam/shared/constants";
import { InlineKeyboard } from "grammy";

export async function handleStats(ctx: BotContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  let user = await getUserByTelegramId(ctx.db, from.id);
  if (!user) {
    user = await registerUser(ctx.db, {
      id: from.id,
      username: from.username,
      first_name: from.first_name,
    });
  }

  const accuracy =
    user.total_predictions > 0
      ? Math.round(
          (user.correct_predictions / user.total_predictions) * 100,
        )
      : 0;

  const score =
    user.correct_predictions * 10 +
    Math.floor(user.total_earned / 100) +
    user.current_streak * 5;

  // Fetch achievements and rank in parallel
  const [userAchievements, leaderboard, referralCount] = await Promise.all([
    getUserAchievements(ctx.db, user.id),
    getLeaderboard(ctx.db, { limit: 100, offset: 0 }),
    getReferralCount(ctx.db, user.id),
  ]);

  // Calculate rank
  const rankIndex = leaderboard.findIndex((e) => e.user_id === user.id);
  const rank = rankIndex >= 0 ? rankIndex + 1 : null;

  // Calculate ROI (return on investment)
  const roi = user.total_wagered > 0
    ? Math.round(((user.total_earned - user.total_wagered) / user.total_wagered) * 100)
    : 0;
  const roiStr = roi >= 0 ? `+${roi}%` : `${roi}%`;
  const roiEmoji = roi > 20 ? "📈" : roi < -20 ? "📉" : "➡️";

  // Achievement badges (show unlocked ones as emojis)
  const unlockedTypes = new Set(userAchievements.map((a) => a.type));
  const badgeEmojis = userAchievements
    .map((a) => ACHIEVEMENT_INFO[a.type as AchievementType]?.emoji)
    .filter(Boolean)
    .join("");
  const badgeLine = badgeEmojis
    ? `🏆 הישגים: ${badgeEmojis} (${userAchievements.length}/${Object.keys(ACHIEVEMENT_INFO).length})`
    : `🏆 הישגים: 0/${Object.keys(ACHIEVEMENT_INFO).length} — המר כדי לפתוח!`;

  // Favorite market type (from total bets, we don't have this in user model
  // so we'll just show the type labels as context)
  const streakDisplay = user.current_streak > 0
    ? `🔥 רצף נוכחי: *${user.current_streak}*`
    : `🔥 רצף נוכחי: 0`;

  // Performance tier based on accuracy
  let tierEmoji: string;
  let tierLabel: string;
  if (accuracy >= 70) { tierEmoji = "🏆"; tierLabel = "אגדי"; }
  else if (accuracy >= 55) { tierEmoji = "💎"; tierLabel = "מומחה"; }
  else if (accuracy >= 45) { tierEmoji = "⭐"; tierLabel = "מנוסה"; }
  else if (accuracy >= 30) { tierEmoji = "🎯"; tierLabel = "טירון"; }
  else if (user.total_predictions > 0) { tierEmoji = "🌱"; tierLabel = "מתחיל"; }
  else { tierEmoji = "👋"; tierLabel = "חדש"; }

  const rankLine = rank
    ? `🏅 דירוג: *#${rank}* מתוך ${leaderboard.length} שחקנים`
    : `🏅 דירוג: לא מדורג — המר כדי להיכנס!`;

  const referLine = referralCount > 0
    ? `🤝 חברים שהוזמנו: *${referralCount}*`
    : "";

  let text =
    `📊 *${user.first_name}'s Kazam Stats* ${tierEmoji}\n` +
    `${"─".repeat(20)}\n\n` +
    `💰 יתרה: *${user.coins}* 🪙\n` +
    `${roiEmoji} ROI: *${roiStr}*\n\n` +
    `🎯 ניחושים: *${user.correct_predictions}*/*${user.total_predictions}*\n` +
    `📈 דיוק: *${accuracy}%* (${tierLabel})\n` +
    `${streakDisplay}\n` +
    `⭐ רצף שיא: *${user.longest_streak}*\n\n` +
    `${rankLine}\n` +
    `🏆 ניקוד: *${score}*\n\n` +
    `${badgeLine}\n`;

  if (referLine) {
    text += `${referLine}\n`;
  }

  // Build shareable text for inline query
  const shareText =
    `⚡ Kazam Stats — ${user.first_name}\n` +
    `🎯 דיוק: ${accuracy}% | 🔥 רצף: ${user.current_streak}\n` +
    `🏆 ניקוד: ${score}${rank ? ` | #${rank}` : ""}\n` +
    `${badgeEmojis ? `🏅 ${badgeEmojis}` : ""}\n` +
    `חושבים שאתם יותר טובים? @KazamGameBot 🚀`;

  const keyboard = new InlineKeyboard()
    .text("🎲 המר עכשיו!", "bet:start")
    .text("📤 שתף סטטיסטיקות", "stats_share")
    .row()
    .text("🏆 דירוג", "stats_leaderboard")
    .text("🤝 הזמן חבר", "refer_friend");

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}