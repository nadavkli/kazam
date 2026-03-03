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
import { calculatePayout } from "@kazam/shared/odds";
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

  // Mark winning option
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

  // Get all bets for this market
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
        );
        // Credit winner
        await updateUserCoins(db, bet.user_id, payout, "earned");

        // Update user stats
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

        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, bet.user_id))
          .get();

        if (user) {
          winners.push({
            user_id: bet.user_id,
            telegram_id: user.telegram_id,
            payout,
          });
        }
      } else {
        // Update loser stats
        await db
          .update(users)
          .set({
            total_predictions: sql`${users.total_predictions} + 1`,
            current_streak: 0,
          })
          .where(eq(users.id, bet.user_id))
          .run();

        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, bet.user_id))
          .get();

        if (user) {
          losers.push({
            user_id: bet.user_id,
            telegram_id: user.telegram_id,
          });
        }
      }

      await updateBetResult(db, bet.id, isWin, payout);
    }
  }

  // Resolve market
  await resolveMarket(db, marketId, winningOptionId, alertId);

  // Build notifications
  const mkt = await getMarketById(db, marketId);
  const winOpt = options.find((o) => o.id === winningOptionId);

  for (const w of winners) {
    notifications.push({
      type: "bet_result",
      user_id: w.user_id,
      telegram_id: w.telegram_id,
      market_question: mkt?.question ?? "",
      option_label: winOpt?.label ?? "",
      is_win: true,
      payout: w.payout,
    });
  }

  for (const l of losers) {
    notifications.push({
      type: "bet_result",
      user_id: l.user_id,
      telegram_id: l.telegram_id,
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
