import { useState } from "react";
import { useLeaderboard, useUser } from "../api/hooks";
import { LeaderRow } from "../components/LeaderRow";
import { hapticSelection } from "../lib/haptics";

const PERIODS = [
  { key: "weekly", label: "שבועי" },
  { key: "monthly", label: "חודשי" },
  { key: "all_time", label: "כל הזמנים" },
] as const;

export function Leaderboard() {
  const [period, setPeriod] = useState<string>("weekly");
  const { data, isLoading } = useLeaderboard(period);
  const { data: userData } = useUser();

  const entries = (data?.leaderboard ?? []) as Array<{
    rank: number;
    user_id: number;
    telegram_id: number;
    username: string | null;
    first_name: string;
    score: number;
    accuracy: number;
    current_streak: number;
  }>;

  const currentUserId = (userData?.user as { id?: number } | undefined)?.id;

  return (
    <div className="flex-1 px-4 pt-4">
      <h1 className="mb-4 text-xl font-black">🏆 דירוג</h1>

      {/* Period tabs */}
      <div className="mb-4 flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              hapticSelection();
              setPeriod(p.key);
            }}
            className={`flex-1 rounded-xl py-2 text-center text-sm font-bold transition-all ${
              period === p.key
                ? "bg-accent-purple text-white"
                : "bg-white/5 text-text-muted"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mb-2 text-3xl">🏜️</div>
          <div className="text-sm text-text-secondary">הדירוג ריק</div>
          <div className="text-xs text-text-muted">
            היה הראשון להמר!
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <LeaderRow
              key={entry.user_id}
              rank={entry.rank}
              name={entry.first_name}
              username={entry.username}
              score={entry.score}
              accuracy={entry.accuracy}
              streak={entry.current_streak}
              isCurrentUser={entry.user_id === currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
