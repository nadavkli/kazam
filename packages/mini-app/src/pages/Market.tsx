import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMarket, useUser } from "../api/hooks";
import { OddsBar } from "../components/OddsBar";
import { BetSlip } from "../components/BetSlip";
import { CoinBalance } from "../components/CoinBalance";
import { hapticSelection } from "../lib/haptics";

export function Market() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useMarket(Number(id));
  const { data: userData } = useUser();
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const market = data?.market as {
    id: number;
    type: string;
    question: string;
    question_en: string;
    total_pool: number;
    status: string;
    options: Array<{
      id: number;
      label: string;
      label_en: string;
      odds: number;
      probability: number;
      total_amount: number;
      total_bets: number;
    }>;
  } | undefined;

  const userBets = (data?.user_bets ?? []) as Array<{
    option_id: number;
    amount: number;
  }>;

  const user = userData?.user as { coins: number } | undefined;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-text-muted">⏳ טוען...</div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="p-4 text-center">
        <div className="text-2xl">🤷</div>
        <div className="text-text-muted">שוק לא נמצא</div>
      </div>
    );
  }

  const TYPE_EMOJI: Record<string, string> = {
    where: "📍",
    when: "⏰",
    how_many: "🔢",
  };

  const selectedOpt = market.options.find((o) => o.id === selectedOption);

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="px-4 pt-4">
        <button
          onClick={() => navigate(-1)}
          className="mb-3 text-sm text-text-muted"
        >
          ← חזרה
        </button>

        <div className="glass-card mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span
              className={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                market.status === "open"
                  ? "bg-accent-green/20 text-accent-green"
                  : market.status === "resolved"
                    ? "bg-accent-purple/20 text-accent-purple"
                    : "bg-text-muted/20 text-text-muted"
              }`}
            >
              {market.status === "open"
                ? "פתוח"
                : market.status === "resolved"
                  ? "נסגר"
                  : market.status}
            </span>
            <span className="text-lg">
              {TYPE_EMOJI[market.type] ?? "🎯"}
            </span>
          </div>

          <h1 className="mb-2 text-lg font-black leading-snug">
            {market.question}
          </h1>

          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>
              {market.options.reduce((s, o) => s + o.total_bets, 0)} הימורים
            </span>
            <span>קופה: {market.total_pool.toLocaleString()} 🪙</span>
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="px-4">
        <h2 className="mb-3 text-sm font-bold">📊 אפשרויות</h2>
        <div className="space-y-2">
          {market.options.map((opt) => {
            const userBet = userBets.find((b) => b.option_id === opt.id);
            return (
              <div key={opt.id}>
                <OddsBar
                  label={opt.label}
                  odds={opt.odds}
                  probability={opt.probability}
                  selected={selectedOption === opt.id}
                  onClick={
                    market.status === "open"
                      ? () => {
                          hapticSelection();
                          setSelectedOption(
                            selectedOption === opt.id ? null : opt.id,
                          );
                        }
                      : undefined
                  }
                />
                {userBet && (
                  <div className="mt-1 text-left text-xs text-accent-purple">
                    הימרת {userBet.amount} 🪙
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bet Slip */}
      {selectedOption && selectedOpt && user && market.status === "open" && (
        <div className="mt-4">
          <BetSlip
            marketId={market.id}
            optionId={selectedOption}
            optionLabel={selectedOpt.label}
            odds={selectedOpt.odds}
            userBalance={user.coins}
            onSuccess={() => setSelectedOption(null)}
            onCancel={() => setSelectedOption(null)}
          />
        </div>
      )}

      {/* Balance footer */}
      {user && (
        <div className="mt-4 px-4 text-center">
          <CoinBalance amount={user.coins} size="sm" />
        </div>
      )}
    </div>
  );
}
