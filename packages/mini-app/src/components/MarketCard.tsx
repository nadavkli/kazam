import { useNavigate } from "react-router-dom";
import { OddsBar } from "./OddsBar";
import { hapticImpact } from "../lib/haptics";

interface MarketOption {
  id: number;
  label: string;
  odds: number;
  probability: number;
  total_amount: number;
}

interface MarketCardProps {
  id: number;
  type: string;
  question: string;
  totalPool: number;
  status: string;
  options: MarketOption[];
}

const TYPE_EMOJI: Record<string, string> = {
  where: "📍",
  when: "⏰",
  how_many: "🔢",
};

export function MarketCard({
  id,
  type,
  question,
  totalPool,
  status,
  options,
}: MarketCardProps) {
  const navigate = useNavigate();

  // Show top 3 options by probability
  const topOptions = [...options]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);

  return (
    <button
      onClick={() => {
        hapticImpact("light");
        navigate(`/market/${id}`);
      }}
      className="glass-card-hover w-full text-right"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
              status === "open"
                ? "bg-accent-green/20 text-accent-green"
                : "bg-text-muted/20 text-text-muted"
            }`}
          >
            {status === "open" ? "פתוח" : "סגור"}
          </span>
          <span className="text-xs text-text-muted">
            {totalPool.toLocaleString()} 🪙
          </span>
        </div>
        <span className="text-lg">{TYPE_EMOJI[type] ?? "🎯"}</span>
      </div>

      <h3 className="mb-3 text-sm font-bold leading-snug">{question}</h3>

      <div className="space-y-2">
        {topOptions.map((opt) => (
          <OddsBar
            key={opt.id}
            label={opt.label}
            odds={opt.odds}
            probability={opt.probability}
            compact
          />
        ))}
        {options.length > 3 && (
          <div className="text-center text-xs text-text-muted">
            +{options.length - 3} אפשרויות נוספות
          </div>
        )}
      </div>
    </button>
  );
}
