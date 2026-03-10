import { Hono } from "hono";
import type { Env } from "../index.js";
import { telegramAuth } from "./auth.js";
import { marketsRouter } from "./markets.js";
import { userRouter } from "./user.js";
import { leaderboardRouter } from "./leaderboard.js";
import { alertsRouter } from "./alerts.js";
import ghostRouter from "./ghost.js";

export const apiRouter = new Hono<{ Bindings: Env }>();

// All API routes require Telegram initData auth
apiRouter.use("/*", telegramAuth);

apiRouter.route("/markets", marketsRouter);
apiRouter.route("/user", userRouter);
apiRouter.route("/leaderboard", leaderboardRouter);
apiRouter.route("/alerts", alertsRouter);
apiRouter.route("/ghost", ghostRouter);
