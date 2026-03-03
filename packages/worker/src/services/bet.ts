import type { Database } from "@kazam/db";
import {
  getMarketById,
  getMarketOptions,
  getUserBetsForMarket,
  placeBet,
  incrementOptionBets,
  incrementMarketPool,
  updateUserCoins,
} from "@kazam/db/queries";
import { MIN_BET, MAX_BET } from "@kazam/shared/constants";
import { calculateMarketOdds } from "@kazam/shared/odds";
import type { User, PlaceBetRequest, PlaceBetResponse } from "@kazam/shared/types";

export async function placeBetService(
  db: Database,
  user: User,
  req: PlaceBetRequest,
): Promise<PlaceBetResponse | { error: string }> {
  // Validate market exists and is open
  const market = await getMarketById(db, req.market_id);
  if (!market) return { error: "Market not found" };
  if (market.status !== "open") return { error: "Market is not open for betting" };

  // Validate option belongs to market
  const options = await getMarketOptions(db, market.id);
  const option = options.find((o) => o.id === req.option_id);
  if (!option) return { error: "Invalid option for this market" };

  // Validate amount
  if (req.amount < MIN_BET) return { error: `Minimum bet is ${MIN_BET} coins` };
  if (req.amount > MAX_BET) return { error: `Maximum bet is ${MAX_BET} coins` };

  // Check user balance
  if (user.coins < req.amount) return { error: "Insufficient coins" };

  // Check total user bets on this market don't exceed max
  const existingBets = await getUserBetsForMarket(db, user.id, market.id);
  const existingTotal = existingBets.reduce((sum, b) => sum + b.amount, 0);
  if (existingTotal + req.amount > MAX_BET) {
    return {
      error: `Maximum ${MAX_BET} coins per market. You've already bet ${existingTotal}`,
    };
  }

  // Place the bet (deduct coins, record bet, update option/market totals)
  await updateUserCoins(db, user.id, -req.amount, "wagered");
  const bet = await placeBet(db, {
    user_id: user.id,
    market_id: market.id,
    option_id: req.option_id,
    amount: req.amount,
  });
  await incrementOptionBets(db, req.option_id, req.amount);
  await incrementMarketPool(db, market.id, req.amount);

  // Recalculate odds
  const updatedOptions = await getMarketOptions(db, market.id);
  const updatedMarket = await getMarketById(db, market.id);
  const oddsMap = calculateMarketOdds(
    updatedOptions,
    updatedMarket?.total_pool ?? market.total_pool + req.amount,
  );

  return {
    bet,
    new_balance: user.coins - req.amount,
    market: {
      ...(updatedMarket ?? market),
      options: updatedOptions.map((opt) => ({
        ...opt,
        ...(oddsMap.get(opt.id) ?? { odds: 0, probability: 0 }),
      })),
    },
  };
}
