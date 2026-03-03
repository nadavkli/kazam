interface OddsBarProps {
  label: string;
  odds: number;
  probability: number;
  selected?: boolean;
  compact?: boolean;
  onClick?: () => void;
}

const GRADIENT_COLORS = [
  "from-accent-purple to-accent-pink",
  "from-accent-cyan to-accent-green",
  "from-accent-orange to-accent-red",
  "from-accent-pink to-accent-purple",
  "from-accent-green to-accent-cyan",
  "from-accent-red to-accent-orange",
  "from-accent-purple to-accent-cyan",
];

export function OddsBar({
  label,
  odds,
  probability,
  selected,
  compact,
  onClick,
}: OddsBarProps) {
  const pct = Math.max(5, Math.round(probability * 100));
  const colorIdx =
    label.charCodeAt(0) % GRADIENT_COLORS.length;
  const gradient = GRADIENT_COLORS[colorIdx];

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative w-full overflow-hidden rounded-lg text-right transition-all ${
        compact ? "h-7" : "h-10"
      } ${
        selected
          ? "ring-2 ring-accent-purple ring-offset-1 ring-offset-bg-primary"
          : ""
      } ${onClick ? "cursor-pointer active:scale-[0.98]" : "cursor-default"}`}
    >
      {/* Background bar */}
      <div className="absolute inset-0 rounded-lg bg-white/5" />

      {/* Filled portion */}
      <div
        className={`absolute inset-y-0 right-0 rounded-lg bg-gradient-to-l ${gradient} opacity-30 transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />

      {/* Content */}
      <div
        className={`relative flex items-center justify-between px-3 ${
          compact ? "h-7 text-xs" : "h-10 text-sm"
        }`}
      >
        <span className="font-mono font-bold text-white/90">
          x{odds.toFixed(1)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-text-secondary">{pct}%</span>
          <span className="font-medium">{label}</span>
        </div>
      </div>
    </button>
  );
}
