import { Hono } from "hono";
import type { Env } from "../index.js";
import { getTelegramUser } from "./auth.js";
import { createDb } from "@kazam/db";
import {
  getMarketById,
  getMarketOptions,
  listMarkets,
  getUserBetsForMarket,
  getUserByTelegramId,
} from "@kazam/db/queries";
import { MarketListQuerySchema, PlaceBetSchema } from "@kazam/shared/validation";
import { calculateMarketOdds } from "@kazam/shared/odds";
import { placeBetService } from "../services/bet.js";

export const marketsRouter = new Hono<{ Bindings: Env }>();

// List markets
marketsRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const query = MarketListQuerySchema.parse(c.req.query());
  const result = await listMarkets(db, query);

  // Enrich with options and odds
  const enriched = await Promise.all(
    result.map(async (market) => {
      const options = await getMarketOptions(db, market.id);
      const oddsMap = calculateMarketOdds(options, market.total_pool);
      return {
        ...market,
        options: options.map((opt) => ({
          ...opt,
          ...(oddsMap.get(opt.id) ?? { odds: 0, probability: 0 }),
        })),
      };
    }),
  );

  return c.json({ markets: enriched });
});

// Get single market
marketsRouter.get("/:id", async (c) => {
  const db = createDb(c.env.DB);
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return c.json({ error: "Invalid market ID" }, 400);

  const market = await getMarketById(db, id);
  if (!market) return c.json({ error: "Market not found" }, 404);

  const options = await getMarketOptions(db, market.id);
  const oddsMap = calculateMarketOdds(options, market.total_pool);

  // Get user's bets on this market
  const tgUser = getTelegramUser(c);
  const user = await getUserByTelegramId(db, tgUser.id);
  const userBets = user ? await getUserBetsForMarket(db, user.id, market.id) : [];

  return c.json({
    market: {
      ...market,
      options: options.map((opt) => ({
        ...opt,
        ...(oddsMap.get(opt.id) ?? { odds: 0, probability: 0 }),
      })),
    },
    user_bets: userBets,
  });
});

// Place a bet
marketsRouter.post("/:id/bet", async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json();
  const parsed = PlaceBetSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const tgUser = getTelegramUser(c);
  const user = await getUserByTelegramId(db, tgUser.id);
  if (!user) return c.json({ error: "User not found" }, 404);

  const result = await placeBetService(db, user, parsed.data);
  if ("error" in result) {
    return c.json({ error: result.error }, 400);
  }

  return c.json(result);
});
