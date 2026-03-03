import type { Database } from "@kazam/db";
import { getLeaderboard } from "@kazam/db/queries";
import type { LeaderboardEntry, LeaderboardPeriod } from "@kazam/shared/types";

export async function getLeaderboardEntries(
  db: Database,
  period: LeaderboardPeriod,
  limit: number,
  offset: number,
): Promise<LeaderboardEntry[]> {
  const entries = await getLeaderboard(db, { limit, offset, period });

  return entries.map((entry, i) => ({
    rank: offset + i + 1,
    user_id: entry.user_id,
    telegram_id: entry.telegram_id,
    username: entry.username,
    first_name: entry.first_name,
    score: entry.score,
    correct_predictions: entry.correct_predictions,
    total_predictions: entry.total_predictions,
    current_streak: entry.current_streak,
    accuracy:
      entry.total_predictions > 0
        ? Math.round(
            (entry.correct_predictions / entry.total_predictions) * 100,
          )
        : 0,
  }));
}
