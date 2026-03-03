import { Hono } from "hono";
import type { Env } from "../index.js";
import { createDb } from "@kazam/db";
import { getLeaderboard } from "@kazam/db/queries";
import { LeaderboardQuerySchema } from "@kazam/shared/validation";

export const leaderboardRouter = new Hono<{ Bindings: Env }>();

leaderboardRouter.get("/", async (c) => {
  const db = createDb(c.env.DB);
  const query = LeaderboardQuerySchema.parse(c.req.query());

  const entries = await getLeaderboard(db, {
    limit: query.limit,
    offset: query.offset,
    period: query.period,
  });

  const ranked = entries.map((entry, i) => ({
    rank: query.offset + i + 1,
    ...entry,
    accuracy:
      entry.total_predictions > 0
        ? Math.round(
            (entry.correct_predictions / entry.total_predictions) * 100,
          )
        : 0,
  }));

  return c.json({ leaderboard: ranked });
});
