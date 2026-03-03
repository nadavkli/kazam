import { Hono } from "hono";
import type { Env } from "../index.js";
import { getTelegramUser } from "./auth.js";
import { createDb } from "@kazam/db";
import {
  getUserByTelegramId,
  getUserActiveBets,
  getUserAchievements,
} from "@kazam/db/queries";
import { claimDailyBonus } from "../services/user.js";
import { getLeaderboard } from "@kazam/db/queries";

export const userRouter = new Hono<{ Bindings: Env }>();

// Get current user profile
userRouter.get("/me", async (c) => {
  const db = createDb(c.env.DB);
  const tgUser = getTelegramUser(c);
  const user = await getUserByTelegramId(db, tgUser.id);
  if (!user) return c.json({ error: "User not found" }, 404);

  const activeBets = await getUserActiveBets(db, user.id);
  const achvs = await getUserAchievements(db, user.id);

  // Calculate score
  const score =
    user.correct_predictions * 10 +
    Math.floor(user.total_earned / 100) +
    user.current_streak * 5;

  // Get rank
  const leaderboard = await getLeaderboard(db, { limit: 100, offset: 0 });
  const rank = leaderboard.findIndex((e) => e.user_id === user.id) + 1;

  return c.json({
    user: {
      ...user,
      score,
      rank: rank > 0 ? rank : null,
      active_bets: activeBets.length,
      achievements: achvs.map((a) => a.type),
    },
  });
});

// Claim daily bonus
userRouter.post("/daily", async (c) => {
  const db = createDb(c.env.DB);
  const tgUser = getTelegramUser(c);
  const user = await getUserByTelegramId(db, tgUser.id);
  if (!user) return c.json({ error: "User not found" }, 404);

  const result = await claimDailyBonus(db, user);
  if ("error" in result) {
    return c.json({ error: result.error }, 400);
  }

  return c.json(result);
});
