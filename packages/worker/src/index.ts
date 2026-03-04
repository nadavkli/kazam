import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRouter } from "./api/router.js";
import { handleBotWebhook } from "./bot/index.js";
import { createDb } from "@kazam/db";
import type { Database } from "@kazam/db";
import { AlertPoller as AlertPollerDO } from "./durable-objects/alert-poller.js";
import { handleNotificationBatch, sendDailyReminders } from "./queues/notifications.js";
import {
  maybeCreateWhereMarket,
  maybeCreateWhenMarket,
  maybeCreateHowManyMarket,
  maybeCreateWarDurationMarket,
  maybeCreateAlertTypeMarket,
  maybeCreateIntensityMarket,
  settleExpiredHowManyMarkets,
} from "./services/market.js";
import { settleMarket } from "./services/settlement.js";

export { AlertPollerDO as AlertPoller };

export interface Env {
  DB: D1Database;
  ALERT_POLLER: DurableObjectNamespace;
  NOTIFICATION_QUEUE: Queue;
  ALERTS_CACHE: KVNamespace;
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
// Uses locationHint "eeur" to pin the DO to Israel/TLV — required for oref.org.il geo-restriction
const POLLER_DO_NAME = "poller-il";
app.post("/internal/start-poller", async (c) => {
  const id = c.env.ALERT_POLLER.idFromName(POLLER_DO_NAME);
  const stub = c.env.ALERT_POLLER.get(id, { locationHint: "eeur" });
  await stub.fetch(new Request("https://internal/start"));
  return c.json({ ok: true, message: "Alert poller started (location: eeur)" });
});

// Stop a DO poller by name
app.post("/internal/stop-poller/:name", async (c) => {
  const name = c.req.param("name");
  const id = c.env.ALERT_POLLER.idFromName(name);
  const stub = c.env.ALERT_POLLER.get(id);
  await stub.fetch(new Request("https://internal/stop"));
  return c.json({ ok: true, message: `Poller '${name}' stopped` });
});

// Seed initial markets
app.post("/internal/seed-markets", async (c) => {
  const db = createDb(c.env.DB);
  const results: string[] = [];

  const creators: Array<{ name: string; fn: (db: Database) => Promise<unknown> }> = [
    { name: "WHERE", fn: maybeCreateWhereMarket },
    { name: "WHEN", fn: maybeCreateWhenMarket },
    { name: "HOW_MANY", fn: maybeCreateHowManyMarket },
    { name: "WAR_DURATION", fn: maybeCreateWarDurationMarket },
    { name: "ALERT_TYPE", fn: maybeCreateAlertTypeMarket },
    { name: "INTENSITY", fn: maybeCreateIntensityMarket },
  ];

  for (const { name, fn } of creators) {
    try {
      const m = await fn(db);
      if (m && typeof m === "object" && "id" in m) {
        results.push(`${name} market #${(m as { id: number }).id} created`);
      } else {
        results.push(`${name}: already exists or cooldown active`);
      }
    } catch (err) {
      results.push(`${name}: ERROR - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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
// Mirrors the full alert-poller logic: settle WHERE + WHEN, update daily counts, create new markets
app.post("/internal/simulate-alert", async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json() as { cities: string[] };

  const { citiesToRegions, primaryRegion } = await import("@kazam/shared/regions");
  const { insertAlert, getOpenMarketByType, getMarketOptions, upsertDailyCount } = await import("@kazam/db/queries");
  const { IST_TIMEZONE, WHEN_BUCKETS } = await import("@kazam/shared/constants");

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

  // Update daily alert count
  const today = new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
  const regionCounts: Record<string, number> = {};
  for (const r of regions) {
    regionCounts[r] = (regionCounts[r] ?? 0) + 1;
  }
  await upsertDailyCount(db, today, {
    missile_count: 1,
    total_count: 1,
    regions: regionCounts,
  });
  results.push(`Daily count updated for ${today}`);

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
      } else {
        results.push(`WHERE: no matching option for region "${primary}"`);
      }
    } else {
      results.push("WHERE: no primary region found for given cities");
    }
  } else {
    results.push("WHERE: no open market to settle");
  }

  // Settle WHEN market
  const whenMarket = await getOpenMarketByType(db, "when");
  if (whenMarket) {
    const now = Date.now();
    const elapsed = now - new Date(whenMarket.opens_at).getTime();
    const options = await getMarketOptions(db, whenMarket.id);

    // Find representative bucket for display (actual per-bet evaluation happens in settlement)
    const bucketIdx = WHEN_BUCKETS.findIndex(b => elapsed < b.max_ms);
    const winOpt = options[bucketIdx >= 0 ? bucketIdx : options.length - 1];

    if (winOpt) {
      const settlement = await settleMarket(db, whenMarket.id, winOpt.id, alert.id);
      if (!("error" in settlement)) {
        results.push(`WHEN market #${whenMarket.id} settled -> ${winOpt.label_en} (${settlement.winners.length} winners, ${settlement.losers.length} losers)`);
        for (const n of settlement.notifications) {
          await c.env.NOTIFICATION_QUEUE.send(n);
        }
      } else {
        results.push(`WHEN settlement error: ${settlement.error}`);
      }
    }
  } else {
    results.push("WHEN: no open market to settle");
  }

  // Queue alert notification
  await c.env.NOTIFICATION_QUEUE.send({
    type: "alert",
    alert: {
      id: alert.id,
      external_id: alert.external_id,
      type: alert.type,
      cities: alert.cities as string[],
      regions: alert.regions as string[],
      instructions: alert.instructions,
      dedupe_hash: alert.dedupe_hash,
      received_at: alert.received_at,
    },
  });
  results.push("Alert notification queued");

  // Create new markets after settlement
  const newWhere = await maybeCreateWhereMarket(db);
  if (newWhere) results.push(`New WHERE market #${newWhere.id} created`);
  const newWhen = await maybeCreateWhenMarket(db);
  if (newWhen) results.push(`New WHEN market #${newWhen.id} created`);
  const newHowMany = await maybeCreateHowManyMarket(db);
  if (newHowMany) results.push(`New HOW_MANY market #${newHowMany.id} created`);

  return c.json({ ok: true, results });
});

export default {
  fetch: app.fetch,

  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.DB);

    if (event.cron === "0 9 * * *") {
      // Noon IST (09:00 UTC) — daily reminder to claim bonus + refer friends
      await sendDailyReminders(db, env);
    } else {
      // End of day IST (20:59 UTC) — settle daily markets
      const result = await settleExpiredHowManyMarkets(db);
      console.log(`[CRON] Settled ${result.settled} HOW_MANY markets`);
      for (const n of result.notifications) {
        await env.NOTIFICATION_QUEUE.send(n);
      }
    }
  },

  // Queue consumer
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleNotificationBatch(batch, env);
  },
};
