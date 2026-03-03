import { StreakBadge } from "./StreakBadge";

interface LeaderRowProps {
  rank: number;
  name: string;
  username?: string | null;
  score: number;
  accuracy: number;
  streak: number;
  isCurrentUser?: boolean;
}

const MEDALS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

export function LeaderRow({
  rank,
  name,
  username,
  score,
  accuracy,
  streak,
  isCurrentUser,
}: LeaderRowProps) {
  const medal = MEDALS[rank];

  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-3 transition-all ${
        isCurrentUser
          ? "border border-accent-purple/30 bg-accent-purple/10"
          : "bg-white/5"
      }`}
    >
      {/* Rank */}
      <div className="flex h-8 w-8 items-center justify-center">
        {medal ? (
          <span className="text-xl">{medal}</span>
        ) : (
          <span className="text-sm font-bold text-text-muted">{rank}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 text-right">
        <div className="flex items-center justify-end gap-2">
          <StreakBadge streak={streak} />
          <span className="text-sm font-bold">
            {name}
            {isCurrentUser && " (את/ה)"}
          </span>
        </div>
        {username && (
          <div className="text-xs text-text-muted">@{username}</div>
        )}
      </div>

      {/* Stats */}
      <div className="text-left">
        <div className="text-sm font-bold text-accent-purple">{score}</div>
        <div className="text-[10px] text-text-muted">{accuracy}% דיוק</div>
      </div>
    </div>
  );
}
