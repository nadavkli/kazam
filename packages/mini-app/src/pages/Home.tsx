import { useMarkets, useUser, useActivity } from "../api/hooks";
import { AlertBanner } from "../components/AlertBanner";
import { MarketCard } from "../components/MarketCard";
import { CoinBalance } from "../components/CoinBalance";
import { StreakBadge } from "../components/StreakBadge";

export function Home() {
  const { data: userData } = useUser();
  const { data: marketsData, isLoading } = useMarkets("open");
  const { data: activityData } = useActivity(10);

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

  const activeUsersCount = activityData?.active_users_count ?? 0;
  const recentBets = activityData?.recent_bets ?? [];

  function getMarketTypeEmoji(type: string): string {
    const map: Record<string, string> = {
      where: "📍",
      when: "⏰",
      how_many: "🔢",
      war_duration: "⚔️",
      alert_type: "🎯",
      intensity: "📊",
    };
    return map[type] ?? "🎲";
  }

  function formatTimeAgo(timestamp: string): string {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return "כרגע";
    if (seconds < 3600) return `לפני ${Math.floor(seconds / 60)} דקות`;
    return `לפני ${Math.floor(seconds / 3600)} שעות`;
  }

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

        {/* Active users counter */}
        {activeUsersCount > 0 && (
          <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-accent/10 py-2 px-3">
            <span className="text-lg">🔴</span>
            <span className="text-sm font-bold text-accent">
              {activeUsersCount} משחקים עכשיו
            </span>
          </div>
        )}
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

      {/* Recent activity feed */}
      {recentBets.length > 0 && (
        <div className="px-4 pt-6">
          <h2 className="mb-3 text-base font-bold">🔥 פעילות אחרונה</h2>
          <div className="glass-card divide-y divide-border/10">
            {recentBets.slice(0, 5).map((bet) => (
              <div
                key={bet.id}
                className="flex items-center justify-between py-3 px-3 first:pt-2 last:pb-2"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">
                      {bet.user_first_name}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatTimeAgo(bet.placed_at)}
                    </span>
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {getMarketTypeEmoji(bet.market_type)} {bet.option_label}
                  </div>
                </div>
                <div className="text-sm font-bold text-accent">
                  {bet.amount} 🪙
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
