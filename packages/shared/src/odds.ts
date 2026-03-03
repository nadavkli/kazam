import { RAKE_PERCENT, OPTION_SEED_AMOUNT } from "./constants.js";

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
 *
 * @param totalPool - Total coins bet across ALL options (excluding seeds)
 * @param optionAmount - Total coins bet on THIS option (excluding seeds)
 * @param betAmount - The hypothetical bet amount to calculate payout for
 * @param optionCount - Number of options in this market (for seed calculation)
 */
export function calculateOdds(
  totalPool: number,
  optionAmount: number,
  betAmount: number,
  optionCount: number,
): OddsResult {
  // Add virtual seeds for liquidity
  const seededTotal = totalPool + OPTION_SEED_AMOUNT * optionCount;
  const seededOption = optionAmount + OPTION_SEED_AMOUNT;

  // Net pool after rake
  const netPool = seededTotal * (1 - RAKE_PERCENT / 100);

  // Odds = net pool / option amount
  const odds = seededOption > 0 ? netPool / seededOption : optionCount;

  // Probability is the inverse
  const probability = seededOption / seededTotal;

  // Potential payout
  const potentialPayout = Math.floor(betAmount * odds);

  return { odds, probability, potentialPayout };
}

/**
 * Calculate all options' odds for a market at once.
 */
export function calculateMarketOdds(
  options: Array<{ id: number; total_amount: number }>,
  totalPool: number,
): Map<number, { odds: number; probability: number }> {
  const optionCount = options.length;
  const seededTotal = totalPool + OPTION_SEED_AMOUNT * optionCount;
  const netPool = seededTotal * (1 - RAKE_PERCENT / 100);

  const result = new Map<number, { odds: number; probability: number }>();

  for (const option of options) {
    const seededOption = option.total_amount + OPTION_SEED_AMOUNT;
    result.set(option.id, {
      odds: netPool / seededOption,
      probability: seededOption / seededTotal,
    });
  }

  return result;
}

/**
 * Calculate the actual payout for a winning bet.
 *
 * @param betAmount - How much the user bet
 * @param totalPool - Total pool across all options
 * @param winningOptionAmount - Total bet on the winning option
 * @param optionCount - Number of options in the market
 */
export function calculatePayout(
  betAmount: number,
  totalPool: number,
  winningOptionAmount: number,
  optionCount: number,
): number {
  const seededTotal = totalPool + OPTION_SEED_AMOUNT * optionCount;
  const seededWinning = winningOptionAmount + OPTION_SEED_AMOUNT;
  const netPool = seededTotal * (1 - RAKE_PERCENT / 100);

  // User's share of the winning option pool
  const share = betAmount / seededWinning;
  return Math.floor(share * netPool);
}
