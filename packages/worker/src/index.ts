import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRouter } from "./api/router.js";
import { handleBotWebhook } from "./bot/index.js";
import { createDb } from "@kazam/db";
import { AlertPoller as AlertPollerDO } from "./durable-objects/alert-poller.js";
import { handleNotificationBatch } from "./queues/notifications.js";
import {
  maybeCreateWhereMarket,
  maybeCreateWhenMarket,
  maybeCreateHowManyMarket,
} from "./services/market.js";
import { settleMarket } from "./services/settlement.js";

export { AlertPollerDO as AlertPoller };

export interface Env {
  DB: D1Database;
  ALERT_POLLER: DurableObjectNamespace;
  NOTIFICATION_QUEUE: Queue;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_SECRET: string;
  MINI_APP_URL: string;
  ALERT_PROXY_URL: string;
  ENVIRONMENT: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS for mini app
app.use(
  "/api/*",
  cors({
    origin: (origin) => origin, // Allow mini app origin
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Telegram-Init-Data"],
    maxAge: 86400,
  }),
);

// API routes
app.route("/api", apiRouter);

// Telegram bot webhook
app.post("/bot/webhook", async (c) => {
  const secret = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== c.env.TELEGRAM_BOT_SECRET) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json();
  await handleBotWebhook(body, c.env);
  return c.json({ ok: true });
});

// Health check
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

// Alert poller management endpoint (called once to initialize)
app.post("/internal/start-poller", async (c) => {
  const id = c.env.ALERT_POLLER.idFromName("singleton");
  const stub = c.env.ALERT_POLLER.get(id);
  await stub.fetch(new Request("https://internal/start"));
  return c.json({ ok: true, message: "Alert poller started" });
});

// Seed initial markets
app.post("/internal/seed-markets", async (c) => {
  const db = createDb(c.env.DB);
  const results: string[] = [];

  const where = await maybeCreateWhereMarket(db);
  if (where) results.push(`WHERE market #${where.id} created`);
  else results.push("WHERE market already exists or cooldown active");

  const when = await maybeCreateWhenMarket(db);
  if (when) results.push(`WHEN market #${when.id} created`);
  else results.push("WHEN market already exists");

  const howMany = await maybeCreateHowManyMarket(db);
  if (howMany) results.push(`HOW_MANY market #${howMany.id} created`);
  else results.push("HOW_MANY market already exists");

  return c.json({ ok: true, results });
});

// Settle a market (for testing + manual resolution)
app.post("/internal/settle", async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json() as { market_id: number; winning_option_id: number; alert_id?: number };
  const result = await settleMarket(db, body.market_id, body.winning_option_id, body.alert_id ?? null);
  if ("error" in result) {
    return c.json({ ok: false, error: result.error }, 400);
  }
  // Enqueue notifications
  for (const n of result.notifications) {
    await c.env.NOTIFICATION_QUEUE.send(n);
  }
  return c.json({
    ok: true,
    winners: result.winners.length,
    losers: result.losers.length,
    notifications_queued: result.notifications.length,
    details: result,
  });
});

// Trigger a simulated alert (for demo/testing)
app.post("/internal/simulate-alert", async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json() as { cities: string[] };

  // Forward to alert proxy's trigger endpoint
  const id = c.env.ALERT_POLLER.idFromName("singleton");
  const stub = c.env.ALERT_POLLER.get(id);
  // Just process directly: insert alert, settle markets, create new ones
  const { citiesToRegions, primaryRegion } = await import("@kazam/shared/regions");
  const { insertAlert, getAlertByHash, getOpenMarketByType, getMarketOptions } = await import("@kazam/db/queries");

  const cities = body.cities;
  const regions = citiesToRegions(cities);
  const sortedCities = [...cities].sort();
  const hashInput = `1:${sortedCities.join(",")}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput));
  const hash = [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");

  const alert = await insertAlert(db, {
    external_id: `sim_${Date.now()}`,
    type: "1",
    cities,
    regions,
    instructions: "סימולציה - היכנסו למרחב המוגן",
    dedupe_hash: hash,
  });

  const results: string[] = [`Alert #${alert.id} created (regions: ${regions.join(", ")})`];

  // Settle WHERE market
  const whereMarket = await getOpenMarketByType(db, "where");
  if (whereMarket) {
    const primary = primaryRegion(cities);
    if (primary) {
      const options = await getMarketOptions(db, whereMarket.id);
      const winOpt = options.find(o => o.label_en.toLowerCase() === primary.replace("_", " "));
      if (winOpt) {
        const settlement = await settleMarket(db, whereMarket.id, winOpt.id, alert.id);
        if (!("error" in settlement)) {
          results.push(`WHERE market #${whereMarket.id} settled -> ${winOpt.label_en} (${settlement.winners.length} winners, ${settlement.losers.length} losers)`);
          for (const n of settlement.notifications) {
            await c.env.NOTIFICATION_QUEUE.send(n);
          }
        } else {
          results.push(`WHERE settlement error: ${settlement.error}`);
        }
      }
    }
  }

  // Create new markets
  const newWhere = await maybeCreateWhereMarket(db);
  if (newWhere) results.push(`New WHERE market #${newWhere.id} created`);
  const newWhen = await maybeCreateWhenMarket(db);
  if (newWhen) results.push(`New WHEN market #${newWhen.id} created`);

  return c.json({ ok: true, results });
});

export default {
  fetch: app.fetch,

  // Queue consumer
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleNotificationBatch(batch, env);
  },
};
