import type { Database } from "@kazam/db";
import {
  getMarketById,
  getMarketOptions,
  lockMarket,
  resolveMarket,
  cancelMarket,
  getWinningBets,
  updateBetResult,
  updateUserCoins,
  getBetsForMarketOption,
} from "@kazam/db/queries";
import { calculatePayout, calculateWhenPayout } from "@kazam/shared/odds";
import { WHEN_BUCKETS } from "@kazam/shared/constants";
import { bets, users, markets, marketOptions } from "@kazam/shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { NotificationMessage } from "@kazam/shared/types";

export interface SettlementResult {
  market_id: number;
  winning_option_id: number;
  winners: Array<{ user_id: number; telegram_id: number; payout: number }>;
  losers: Array<{ user_id: number; telegram_id: number }>;
  notifications: NotificationMessage[];
}

/**
 * Settle a market: mark winner, calculate payouts, credit winners.
 * For WHEN markets, each bet is evaluated individually based on its placed_at time.
 */
export async function settleMarket(
  db: Database,
  marketId: number,
  winningOptionId: number,
  alertId: number | null,
): Promise<SettlementResult | { error: string }> {
  const market = await getMarketById(db, marketId);
  if (!market) return { error: "Market not found" };
  if (market.status !== "open" && market.status !== "locked") {
    return { error: `Cannot settle market in ${market.status} status` };
  }

  // Lock market first
  if (market.status === "open") {
    await lockMarket(db, marketId);
  }

  // Set market status to settling
  await db
    .update(markets)
    .set({ status: "settling" })
    .where(eq(markets.id, marketId))
    .run();

  const options = await getMarketOptions(db, marketId);
  const winningOption = options.find((o) => o.id === winningOptionId);
  if (!winningOption) return { error: "Winning option not found" };

  // Mark winning option (for display)
  for (const opt of options) {
    await db
      .update(marketOptions)
      .set({ is_winner: opt.id === winningOptionId })
      .where(eq(marketOptions.id, opt.id))
      .run();
  }

  const notifications: NotificationMessage[] = [];
  const winners: SettlementResult["winners"] = [];
  const losers: SettlementResult["losers"] = [];

  const alertTime = Date.now();
  const isWhenMarket = market.type === "when";

  // Pre-compute seed totals for payout calculations
  const totalSeeds = options.reduce((sum, o) => sum + (o.seed_amount ?? 100), 0);

  if (isWhenMarket) {
    // === WHEN MARKET: per-bet evaluation ===
    // Pass 1: collect all bets and determine winners
    const allBets: Array<{
      bet: { id: number; user_id: number; amount: number; placed_at: string };
      optSortOrder: number;
      isWin: boolean;
    }> = [];

    for (const opt of options) {
      const optBets = await getBetsForMarketOption(db, marketId, opt.id);
      for (const bet of optBets) {
        const betPlacedAt = new Date(bet.placed_at).getTime();
        const elapsed = alertTime - betPlacedAt;
        const bucketIndex = opt.sort_order;
        let isWin = false;
        if (bucketIndex < WHEN_BUCKETS.length) {
          const bucket = WHEN_BUCKETS[bucketIndex];
          isWin = elapsed >= bucket.min_ms && elapsed < bucket.max_ms;
        }
        allBets.push({ bet, optSortOrder: opt.sort_order, isWin });
      }
    }

    // Calculate total winning amount for payout split
    const totalWinningAmount = allBets
      .filter((b) => b.isWin)
      .reduce((sum, b) => sum + b.bet.amount, 0);

    // Pass 2: calculate payouts and update
    for (const { bet, isWin } of allBets) {
      let payout = 0;

      if (isWin && totalWinningAmount > 0) {
        payout = calculateWhenPayout(
          bet.amount,
          market.total_pool,
          totalWinningAmount,
          options.length,
          totalSeeds,
        );
        await updateUserCoins(db, bet.user_id, payout, "earned");

        await db
          .update(users)
          .set({
            correct_predictions: sql`${users.correct_predictions} + 1`,
            total_predictions: sql`${users.total_predictions} + 1`,
            current_streak: sql`${users.current_streak} + 1`,
            longest_streak: sql`CASE WHEN ${users.current_streak} + 1 > ${users.longest_streak} THEN ${users.current_streak} + 1 ELSE ${users.longest_streak} END`,
          })
          .where(eq(users.id, bet.user_id))
          .run();

        const user = await db.select().from(users).where(eq(users.id, bet.user_id)).get();
        if (user) {
          winners.push({ user_id: bet.user_id, telegram_id: user.telegram_id, payout });
        }
      } else {
        await db
          .update(users)
          .set({
            total_predictions: sql`${users.total_predictions} + 1`,
            current_streak: 0,
          })
          .where(eq(users.id, bet.user_id))
          .run();

        const user = await db.select().from(users).where(eq(users.id, bet.user_id)).get();
        if (user) {
          losers.push({ user_id: bet.user_id, telegram_id: user.telegram_id });
        }
      }

      await updateBetResult(db, bet.id, isWin, payout);
    }
  } else {
    // === WHERE / HOW_MANY: standard parimutuel ===
    for (const opt of options) {
      const optBets = await getBetsForMarketOption(db, marketId, opt.id);

      for (const bet of optBets) {
        const isWin = opt.id === winningOptionId;
        let payout = 0;

        if (isWin) {
          payout = calculatePayout(
            bet.amount,
            market.total_pool,
            winningOption.total_amount,
            options.length,
            winningOption.seed_amount ?? 100,
            totalSeeds,
          );
          await updateUserCoins(db, bet.user_id, payout, "earned");

          await db
            .update(users)
            .set({
              correct_predictions: sql`${users.correct_predictions} + 1`,
              total_predictions: sql`${users.total_predictions} + 1`,
              current_streak: sql`${users.current_streak} + 1`,
              longest_streak: sql`CASE WHEN ${users.current_streak} + 1 > ${users.longest_streak} THEN ${users.current_streak} + 1 ELSE ${users.longest_streak} END`,
            })
            .where(eq(users.id, bet.user_id))
            .run();

          const user = await db.select().from(users).where(eq(users.id, bet.user_id)).get();
          if (user) {
            winners.push({ user_id: bet.user_id, telegram_id: user.telegram_id, payout });
          }
        } else {
          await db
            .update(users)
            .set({
              total_predictions: sql`${users.total_predictions} + 1`,
              current_streak: 0,
            })
            .where(eq(users.id, bet.user_id))
            .run();

          const user = await db.select().from(users).where(eq(users.id, bet.user_id)).get();
          if (user) {
            losers.push({ user_id: bet.user_id, telegram_id: user.telegram_id });
          }
        }

        await updateBetResult(db, bet.id, isWin, payout);
      }
    }
  }

  // Resolve market
  await resolveMarket(db, marketId, winningOptionId, alertId);

  // Build consolidated notifications: ONE per user per market
  const mkt = await getMarketById(db, marketId);
  const winOpt = options.find((o) => o.id === winningOptionId);

  // Aggregate per user: sum payouts from winning bets
  const userPayouts = new Map<number, { telegram_id: number; totalPayout: number }>();
  for (const w of winners) {
    const existing = userPayouts.get(w.user_id);
    if (existing) {
      existing.totalPayout += w.payout;
    } else {
      userPayouts.set(w.user_id, { telegram_id: w.telegram_id, totalPayout: w.payout });
    }
  }

  // Collect loser user_ids (only users with NO winning bets)
  const loserUsers = new Map<number, number>(); // user_id -> telegram_id
  for (const l of losers) {
    if (!userPayouts.has(l.user_id)) {
      loserUsers.set(l.user_id, l.telegram_id);
    }
  }

  // One win notification per winning user (consolidated payout)
  for (const [userId, { telegram_id, totalPayout }] of userPayouts) {
    notifications.push({
      type: "bet_result",
      user_id: userId,
      telegram_id,
      market_question: mkt?.question ?? "",
      option_label: winOpt?.label ?? "",
      is_win: true,
      payout: totalPayout,
    });
  }

  // One loss notification per losing user
  for (const [userId, telegram_id] of loserUsers) {
    notifications.push({
      type: "bet_result",
      user_id: userId,
      telegram_id,
      market_question: mkt?.question ?? "",
      option_label: winOpt?.label ?? "",
      is_win: false,
      payout: 0,
    });
  }

  return { market_id: marketId, winning_option_id: winningOptionId, winners, losers, notifications };
}

/**
 * Cancel a market and refund all bets.
 */
export async function cancelAndRefundMarket(
  db: Database,
  marketId: number,
): Promise<void> {
  const options = await getMarketOptions(db, marketId);

  for (const opt of options) {
    const optBets = await getBetsForMarketOption(db, marketId, opt.id);
    for (const bet of optBets) {
      await updateUserCoins(db, bet.user_id, bet.amount, "earned");
      await updateBetResult(db, bet.id, false, bet.amount);
    }
  }

  await cancelMarket(db, marketId);
}
