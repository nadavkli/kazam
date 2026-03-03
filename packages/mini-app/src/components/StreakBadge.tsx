interface StreakBadgeProps {
  streak: number;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  if (streak === 0) return null;

  const fires =
    streak >= 14 ? "🔥🔥🔥" : streak >= 7 ? "🔥🔥" : "🔥";

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-orange/20 px-2 py-0.5 text-xs font-bold text-accent-orange">
      {fires} {streak}
    </span>
  );
}
