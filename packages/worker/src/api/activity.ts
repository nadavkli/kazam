import { Hono } from "hono";
import type { Env } from "../index.js";
import { getRecentBets, getActiveUsersCount } from "@kazam/db/queries";

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/activity
 * Returns recent bets for live activity feed + active users count
 */
app.get("/", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  
  const recentBets = await getRecentBets(c.env.DB, limit);
  const activeCount = await getActiveUsersCount(c.env.DB, 5);
  
  return c.json({
    active_users_count: activeCount,
    recent_bets: recentBets.map((bet) => ({
      id: bet.id,
      user_first_name: bet.user_first_name,
      market_type: bet.market_type,
      market_question: bet.market_question,
      option_label: bet.option_label,
      amount: bet.amount,
      placed_at: bet.placed_at,
    })),
  });
});

export default app;
