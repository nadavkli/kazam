import { Hono } from "hono";
import type { Env } from "../index.js";
import { createDb } from "@kazam/db";
import { getUserByTelegramId } from "@kazam/db/queries";
import { getGhostComparison, generateShareCard } from "../services/daily-summary.js";
import { getTelegramUser } from "./auth.js";

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/ghost
 * Returns yesterday vs today comparison + ghost betting suggestion
 */
app.get("/", async (c) => {
  const telegramUser = getTelegramUser(c);

  const db = createDb(c.env.DB);
  const user = await getUserByTelegramId(db, telegramUser.id);
  if (!user) {
    return c.json({ error: "User not found. /start the bot first" }, 404);
  }

  const ghost = await getGhostComparison(db, user.id);
  const shareText = ghost.yesterday_summary
    ? generateShareCard(user, ghost.yesterday_summary)
    : null;

  return c.json({
    ghost,
    share_text: shareText,
  });
});

export default app;
