import { useMarkets, useUser } from "../api/hooks";
import { AlertBanner } from "../components/AlertBanner";
import { MarketCard } from "../components/MarketCard";
import { CoinBalance } from "../components/CoinBalance";
import { StreakBadge } from "../components/StreakBadge";

export function Home() {
  const { data: userData } = useUser();
  const { data: marketsData, isLoading } = useMarkets("open");

  const user = userData?.user as {
    first_name: string;
    coins: number;
    current_streak: number;
  } | undefined;

  const markets = (marketsData?.markets ?? []) as Array<{
    id: number;
    type: string;
    question: string;
    total_pool: number;
    status: string;
    options: Array<{
      id: number;
      label: string;
      odds: number;
      probability: number;
      total_amount: number;
    }>;
  }>;

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            {user && <CoinBalance amount={user.coins} size="lg" />}
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black">
              ⚡ Kazam
            </h1>
            {user && (
              <div className="flex items-center justify-end gap-2">
                <StreakBadge streak={user.current_streak} />
                <span className="text-xs text-text-secondary">
                  {user.first_name}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live alert banner */}
      <AlertBanner />

      {/* Active markets */}
      <div className="px-4 pt-4">
        <h2 className="mb-3 text-base font-bold">🎯 הימורים פעילים</h2>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="glass-card h-32 animate-pulse"
              />
            ))}
          </div>
        ) : markets.length === 0 ? (
          <div className="glass-card py-8 text-center">
            <div className="mb-2 text-3xl">😴</div>
            <div className="text-sm text-text-secondary">
              אין הימורים פתוחים כרגע
            </div>
            <div className="text-xs text-text-muted">
              הימור חדש ייפתח אחרי האזעקה הבאה
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {markets.map((market) => (
              <MarketCard
                key={market.id}
                id={market.id}
                type={market.type}
                question={market.question}
                totalPool={market.total_pool}
                status={market.status}
                options={market.options}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
