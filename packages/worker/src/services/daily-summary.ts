import type { Database } from "@kazam/db";
import { bets, markets, marketOptions } from "@kazam/shared/schema";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { IST_TIMEZONE } from "@kazam/shared/constants";
import type { User } from "@kazam/shared/types";

/** Get current UTC offset string for IST (handles DST automatically) */
function getISTOffsetString(): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIMEZONE,
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(new Date());
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  if (tzPart) {
    const match = tzPart.value.match(/GMT([+-])(\d+)/);
    if (match) {
      const sign = match[1];
      const hours = match[2].padStart(2, '0');
      return sign + hours + ':00';
    }
  }
  return '+02:00'; // fallback to IST winter
}

export interface DailySummary {
  date: string;
  total_wagered: number;
  total_won: number;
  net_change: number;
  bets_placed: number;
  bets_won: number;
  win_rate: number;
  biggest_win: number;
  biggest_loss: number;
  favorite_market_type: string | null;
  favorite_option: string | null;
}

export interface GhostComparison {
  yesterday_summary: DailySummary | null;
  today_summary: DailySummary | null;
  if_repeated_result: number;
  suggestion: "revenge" | "copy" | "try_different" | null;
}

/**
 * Get a user's betting summary for a specific date (IST timezone).
 * Uses dynamic timezone offset to handle DST correctly.
 */
export async function getDailySummary(
  db: Database,
  userId: number,
  dateStr: string, // YYYY-MM-DD in IST
): Promise<DailySummary> {
  const offset = getISTOffsetString();
  const dayStart = new Date(`${dateStr}T00:00:00${offset}`);
  const dayEnd = new Date(`${dateStr}T23:59:59${offset}`);

  const userBets = await db
    .select({
      bet: bets,
      market: markets,
      option: marketOptions,
    })
    .from(bets)
    .innerJoin(markets, eq(bets.market_id, markets.id))
    .innerJoin(marketOptions, eq(bets.option_id, marketOptions.id))
    .where(
      and(
        eq(bets.user_id, userId),
        gte(bets.placed_at, dayStart.toISOString()),
        lt(bets.placed_at, dayEnd.toISOString()),
      ),
    )
    .all();

  const totalWagered = userBets.reduce((sum, b) => sum + b.bet.amount, 0);
  const totalWon = userBets.reduce((sum, b) => sum + (b.bet.payout ?? 0), 0);
  const netChange = totalWon - totalWagered;
  const betsWon = userBets.filter((b) => b.bet.is_win).length;
  const winRate = userBets.length > 0 ? betsWon / userBets.length : 0;

  const biggestWin = Math.max(
    0,
    ...userBets.map((b) => (b.bet.payout ?? 0) - b.bet.amount),
  );
  const biggestLoss = Math.min(
    0,
    ...userBets.map((b) => (b.bet.payout ?? 0) - b.bet.amount),
  );

  const marketTypeCounts = new Map<string, number>();
  for (const b of userBets) {
    const type = b.market.type;
    marketTypeCounts.set(type, (marketTypeCounts.get(type) ?? 0) + 1);
  }
  const favoriteMarketType =
    marketTypeCounts.size > 0
      ? [...marketTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

  const optionCounts = new Map<string, number>();
  for (const b of userBets) {
    const label = b.option.label;
    optionCounts.set(label, (optionCounts.get(label) ?? 0) + 1);
  }
  const favoriteOption =
    optionCounts.size > 0
      ? [...optionCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

  return {
    date: dateStr,
    total_wagered: totalWagered,
    total_won: totalWon,
    net_change: netChange,
    bets_placed: userBets.length,
    bets_won: betsWon,
    win_rate: winRate,
    biggest_win: biggestWin,
    biggest_loss: biggestLoss,
    favorite_market_type: favoriteMarketType,
    favorite_option: favoriteOption,
  };
}

/**
 * Compare today vs yesterday and generate ghost betting insights.
 */
export async function getGhostComparison(
  db: Database,
  userId: number,
): Promise<GhostComparison> {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: IST_TIMEZONE,
  });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString(
    "en-CA",
    { timeZone: IST_TIMEZONE },
  );

  const yesterdaySummary = await getDailySummary(db, userId, yesterday);
  const todaySummary = await getDailySummary(db, userId, today);

  let suggestion: GhostComparison["suggestion"] = null;
  let ifRepeatedResult = 0;

  if (yesterdaySummary.bets_placed > 0) {
    if (yesterdaySummary.net_change > 0) {
      suggestion = "copy";
      ifRepeatedResult = Math.round(
        yesterdaySummary.total_wagered * (yesterdaySummary.win_rate * 1.5 - 0.5),
      );
    } else if (yesterdaySummary.net_change < 0) {
      suggestion = "revenge";
      ifRepeatedResult = yesterdaySummary.net_change;
    } else {
      suggestion = "try_different";
      ifRepeatedResult = 0;
    }
  }

  return {
    yesterday_summary: yesterdaySummary.bets_placed > 0 ? yesterdaySummary : null,
    today_summary: todaySummary.bets_placed > 0 ? todaySummary : null,
    if_repeated_result: ifRepeatedResult,
    suggestion,
  };
}

/**
 * Generate a shareable summary card (text for Telegram).
 */
export function generateShareCard(
  user: User,
  summary: DailySummary,
): string {
  const emoji = summary.net_change > 0 ? "🔥" : summary.net_change < 0 ? "💀" : "😐";
  const change = summary.net_change > 0 ? `+${summary.net_change}` : `${summary.net_change}`;
  const winRatePct = Math.round(summary.win_rate * 100);

  return `${emoji} ${user.first_name}'s Kazam Stats (${summary.date})

💰 Net: ${change} coins
🎯 Win Rate: ${winRatePct}% (${summary.bets_won}/${summary.bets_placed})
📈 Biggest Win: +${summary.biggest_win}
${summary.biggest_loss < 0 ? `📉 Biggest Loss: ${summary.biggest_loss}` : ""}

Think you can beat that? Play @KazamGameBot 🚀`;
}