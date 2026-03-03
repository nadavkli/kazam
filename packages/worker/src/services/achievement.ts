import type { Database } from "@kazam/db";
import { unlockAchievement, getUserAchievements, getReferralCount } from "@kazam/db/queries";
import type { AchievementType } from "@kazam/shared/constants";
import type { User } from "@kazam/shared/types";

/**
 * Check and unlock achievements for a user based on their current stats.
 * Returns list of newly unlocked achievements.
 */
export async function checkAchievements(
  db: Database,
  user: User,
): Promise<AchievementType[]> {
  const existing = await getUserAchievements(db, user.id);
  const existingTypes = new Set(existing.map((a) => a.type));
  const newlyUnlocked: AchievementType[] = [];

  const referralCount = await getReferralCount(db, user.id);

  const checks: Array<{ type: AchievementType; condition: boolean }> = [
    { type: "first_bet", condition: user.total_predictions >= 1 },
    { type: "first_win", condition: user.correct_predictions >= 1 },
    { type: "streak_3", condition: user.current_streak >= 3 },
    { type: "streak_7", condition: user.current_streak >= 7 },
    { type: "streak_14", condition: user.current_streak >= 14 },
    { type: "streak_30", condition: user.current_streak >= 30 },
    { type: "total_bets_10", condition: user.total_predictions >= 10 },
    { type: "total_bets_50", condition: user.total_predictions >= 50 },
    { type: "total_bets_100", condition: user.total_predictions >= 100 },
    { type: "total_wins_10", condition: user.correct_predictions >= 10 },
    { type: "total_wins_50", condition: user.correct_predictions >= 50 },
    { type: "big_win_500", condition: user.total_earned >= 500 },
    { type: "big_win_1000", condition: user.total_earned >= 1000 },
    { type: "refer_1", condition: referralCount >= 1 },
    { type: "refer_5", condition: referralCount >= 5 },
  ];

  for (const check of checks) {
    if (check.condition && !existingTypes.has(check.type)) {
      await unlockAchievement(db, user.id, check.type);
      newlyUnlocked.push(check.type);
    }
  }

  return newlyUnlocked;
}
