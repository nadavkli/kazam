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
 * @param optionSeed - Virtual seed for this option (defaults to OPTION_SEED_AMOUNT)
 * @param totalSeeds - Sum of all option seeds (defaults to OPTION_SEED_AMOUNT * optionCount)
 */
export function calculateOdds(
  totalPool: number,
  optionAmount: number,
  betAmount: number,
  optionCount: number,
  optionSeed: number = OPTION_SEED_AMOUNT,
  totalSeeds: number = OPTION_SEED_AMOUNT * optionCount,
): OddsResult {
  // Add virtual seeds for liquidity (per-option seeds reflect historical probability)
  const seededTotal = totalPool + totalSeeds;
  const seededOption = optionAmount + optionSeed;

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
 * Uses per-option seed_amount from the database for weighted initial odds.
 */
export function calculateMarketOdds(
  options: Array<{ id: number; total_amount: number; seed_amount?: number }>,
  totalPool: number,
): Map<number, { odds: number; probability: number }> {
  const totalSeeds = options.reduce(
    (sum, o) => sum + (o.seed_amount ?? OPTION_SEED_AMOUNT),
    0,
  );
  const seededTotal = totalPool + totalSeeds;
  const netPool = seededTotal * (1 - RAKE_PERCENT / 100);

  const result = new Map<number, { odds: number; probability: number }>();

  for (const option of options) {
    const seed = option.seed_amount ?? OPTION_SEED_AMOUNT;
    const seededOption = option.total_amount + seed;
    result.set(option.id, {
      odds: netPool / seededOption,
      probability: seededOption / seededTotal,
    });
  }

  return result;
}

/**
 * Calculate the actual payout for a winning bet (WHERE / HOW_MANY).
 *
 * @param betAmount - How much the user bet
 * @param totalPool - Total pool across all options
 * @param winningOptionAmount - Total bet on the winning option
 * @param optionCount - Number of options in the market
 * @param winningSeed - Seed for the winning option (defaults to OPTION_SEED_AMOUNT)
 * @param totalSeeds - Sum of all option seeds (defaults to OPTION_SEED_AMOUNT * optionCount)
 */
export function calculatePayout(
  betAmount: number,
  totalPool: number,
  winningOptionAmount: number,
  optionCount: number,
  winningSeed: number = OPTION_SEED_AMOUNT,
  totalSeeds: number = OPTION_SEED_AMOUNT * optionCount,
): number {
  const seededTotal = totalPool + totalSeeds;
  const seededWinning = winningOptionAmount + winningSeed;
  const netPool = seededTotal * (1 - RAKE_PERCENT / 100);

  // User's share of the winning option pool
  const share = betAmount / seededWinning;
  return Math.floor(share * netPool);
}

/**
 * Calculate payout for WHEN market where winners are determined per-bet.
 * Winners from different options share the pool proportionally.
 *
 * @param betAmount - This winner's bet amount
 * @param totalPool - Total pool across all options
 * @param totalWinningAmount - Sum of ALL winning bets (across any option)
 * @param optionCount - Number of options in the market
 * @param totalSeeds - Sum of all option seeds (defaults to OPTION_SEED_AMOUNT * optionCount)
 */
export function calculateWhenPayout(
  betAmount: number,
  totalPool: number,
  totalWinningAmount: number,
  optionCount: number,
  totalSeeds: number = OPTION_SEED_AMOUNT * optionCount,
): number {
  const seededTotal = totalPool + totalSeeds;
  const netPool = seededTotal * (1 - RAKE_PERCENT / 100);

  // Winner's share = their bet / total winning bets
  const share = betAmount / totalWinningAmount;
  return Math.floor(share * netPool);
}
