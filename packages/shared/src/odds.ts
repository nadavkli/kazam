import { RAKE_PERCENT } from "./constants.js";

export interface OddsResult {
  /** Decimal odds for this option (e.g., 3.5 = 3.5x payout) */
  odds: number;
  /** Implied probability 0-1 */
  probability: number;
  /** Potential payout for a given bet amount */
  potentialPayout: number;
}

/**
 * Calculate parimutuel odds for a single option within a market.
 * Seeds are already included in totalPool and optionAmount — no virtual addition needed.
 */
export function calculateOdds(
  totalPool: number,
  optionAmount: number,
  betAmount: number,
): OddsResult {
  const netPool = totalPool * (1 - RAKE_PERCENT / 100);
  const odds = optionAmount > 0 ? netPool / optionAmount : 1;
  const probability = totalPool > 0 ? optionAmount / totalPool : 0;
  const potentialPayout = Math.floor(betAmount * odds);

  return { odds, probability, potentialPayout };
}

/**
 * Calculate all options' odds for a market at once.
 * Seeds are already included in total_amount and totalPool.
 */
export function calculateMarketOdds(
  options: Array<{ id: number; total_amount: number }>,
  totalPool: number,
): Map<number, { odds: number; probability: number }> {
  const netPool = totalPool * (1 - RAKE_PERCENT / 100);

  const result = new Map<number, { odds: number; probability: number }>();

  for (const option of options) {
    result.set(option.id, {
      odds: option.total_amount > 0 ? netPool / option.total_amount : 1,
      probability: totalPool > 0 ? option.total_amount / totalPool : 0,
    });
  }

  return result;
}

/**
 * Calculate the actual payout for a winning bet (WHERE / HOW_MANY / etc).
 * Seeds are already in totalPool and winningOptionAmount.
 */
export function calculatePayout(
  betAmount: number,
  totalPool: number,
  winningOptionAmount: number,
): number {
  const netPool = totalPool * (1 - RAKE_PERCENT / 100);
  const share = betAmount / winningOptionAmount;
  return Math.floor(share * netPool);
}

/**
 * Calculate payout for WHEN market where winners are determined per-bet.
 * Winners from different options share the pool proportionally.
 */
export function calculateWhenPayout(
  betAmount: number,
  totalPool: number,
  totalWinningAmount: number,
): number {
  const netPool = totalPool * (1 - RAKE_PERCENT / 100);
  const share = betAmount / totalWinningAmount;
  return Math.floor(share * netPool);
}
