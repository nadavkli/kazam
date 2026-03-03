const ACHIEVEMENT_CONFIG: Record<
  string,
  { emoji: string; label: string; description: string }
> = {
  first_bet: { emoji: "🎯", label: "הימור ראשון", description: "הצבת הימור ראשון" },
  first_win: { emoji: "⭐", label: "נצחון ראשון", description: "ניצחת בפעם הראשונה" },
  streak_3: { emoji: "🔥", label: "רצף 3", description: "3 ניחושים נכונים ברצף" },
  streak_7: { emoji: "🔥", label: "רצף 7", description: "7 ניחושים נכונים ברצף" },
  streak_14: { emoji: "💎", label: "רצף 14", description: "14 ניחושים נכונים ברצף" },
  streak_30: { emoji: "👑", label: "רצף 30", description: "30 ניחושים נכונים ברצף" },
  total_bets_10: { emoji: "🎰", label: "10 הימורים", description: "הצבת 10 הימורים" },
  total_bets_50: { emoji: "🎰", label: "50 הימורים", description: "הצבת 50 הימורים" },
  total_bets_100: { emoji: "💯", label: "100 הימורים", description: "הצבת 100 הימורים" },
  total_wins_10: { emoji: "🏅", label: "10 נצחונות", description: "ניצחת 10 פעמים" },
  total_wins_50: { emoji: "🏆", label: "50 נצחונות", description: "ניצחת 50 פעמים" },
  big_win_500: { emoji: "💰", label: "רווח גדול", description: "הרווחת 500+ מטבעות" },
  big_win_1000: { emoji: "🤑", label: "ג'קפוט", description: "הרווחת 1000+ מטבעות" },
  refer_1: { emoji: "🤝", label: "חבר ראשון", description: "הזמנת חבר אחד" },
  refer_5: { emoji: "🌟", label: "משפיע", description: "הזמנת 5 חברים" },
  top_10_weekly: { emoji: "🏅", label: "טופ 10", description: "נכנסת ל-10 הראשונים" },
};

interface AchievementProps {
  type: string;
  unlocked?: boolean;
}

export function Achievement({ type, unlocked = true }: AchievementProps) {
  const config = ACHIEVEMENT_CONFIG[type] ?? {
    emoji: "❓",
    label: type,
    description: "",
  };

  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl p-3 text-center transition-all ${
        unlocked
          ? "bg-accent-purple/10 border border-accent-purple/20"
          : "bg-white/5 opacity-40"
      }`}
    >
      <span className="text-2xl">{config.emoji}</span>
      <span className="text-[10px] font-bold leading-tight">{config.label}</span>
    </div>
  );
}
