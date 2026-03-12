import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRouter } from "./api/router.js";
import { handleBotWebhook } from "./bot/index.js";
import { createDb } from "@kazam/db";
import type { Database } from "@kazam/db";
import { AlertPoller as AlertPollerDO } from "./durable-objects/alert-poller.js";
import { handleNotificationBatch, sendDailyReminders, sendClosingSoonReminders } from "./queues/notifications.js";
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
  ENVIRONMENT: string;
  INTERNAL_API_KEY: string;
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

// Health check (public)
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

// Auth middleware for /internal/* routes
app.use("/internal/*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth || auth !== `Bearer ${c.env.INTERNAL_API_KEY}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Migration 0001 (daily_streak) applied 2026-03-11

// Manually trigger daily reminders
app.post("/internal/daily-reminders", async (c) => {
  const db = createDb(c.env.DB);
  await sendDailyReminders(db, c.env);
  return c.json({ ok: true, message: "Daily reminders sent" });
});

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

// Trigger daily market settlement manually
app.post("/internal/settle-daily", async (c) => {
  const db = createDb(c.env.DB);
  const result = await settleExpiredHowManyMarkets(db);
  // Send notifications
  for (const n of result.notifications) {
    await c.env.NOTIFICATION_QUEUE.send(n);
  }
  // Send daily summary
  if (result.settled > 0 || result.newMarkets.length > 0) {
    await c.env.NOTIFICATION_QUEUE.send({
      type: "daily_summary",
      settled: result.settled,
      newMarkets: result.newMarkets,
    });
  }
  return c.json({
    ok: true,
    settled: result.settled,
    newMarkets: result.newMarkets.map(m => ({ id: m.id, type: m.type, question: m.question })),
    notifications: result.notifications.length,
  });
});

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

// Comprehensive stats/analytics endpoint
app.get("/internal/stats", async (c) => {
  try {
  const d1 = c.env.DB;
  const todayIST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const yesterdayIST = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

  const [
    userStats,
    betStats,
    marketStats,
    dauStats,
    topUsers,
    alertStats,
    growthData,
    retentionData,
  ] = await Promise.all([
    d1.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN date(created_at) = ? THEN 1 ELSE 0 END) as today,
      SUM(CASE WHEN date(created_at) >= date(?, '-7 days') THEN 1 ELSE 0 END) as last_7d,
      SUM(CASE WHEN date(created_at) >= date(?, '-30 days') THEN 1 ELSE 0 END) as last_30d,
      SUM(CASE WHEN SUBSTR(last_daily_claim_at, 1, 10) = ? THEN 1 ELSE 0 END) as claimed_daily_today,
      (SELECT COUNT(DISTINCT user_id) FROM bets) as with_bets
    FROM users`).bind(todayIST, todayIST, todayIST, todayIST).first(),

    d1.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN date(placed_at) = ? THEN 1 ELSE 0 END) as today,
      SUM(CASE WHEN date(placed_at) >= date(?, '-7 days') THEN 1 ELSE 0 END) as last_7d,
      COALESCE(SUM(amount), 0) as total_volume,
      COALESCE(SUM(CASE WHEN date(placed_at) = ? THEN amount ELSE 0 END), 0) as today_volume,
      COALESCE(ROUND(AVG(amount)), 0) as avg_bet_size
    FROM bets`).bind(todayIST, todayIST, todayIST).first(),

    d1.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
      COALESCE(SUM(total_pool), 0) as total_pool
    FROM markets`).first(),

    d1.prepare(`SELECT
      (SELECT COUNT(DISTINCT user_id) FROM bets WHERE date(placed_at) = ?) as dau_today,
      (SELECT COUNT(DISTINCT user_id) FROM bets WHERE date(placed_at) = ?) as dau_yesterday,
      (SELECT COUNT(DISTINCT user_id) FROM bets WHERE date(placed_at) >= date(?, '-7 days')) as wau`)
      .bind(todayIST, yesterdayIST, todayIST).first(),

    // Anonymous user activity distribution (no PII)
    d1.prepare(`SELECT
      COUNT(CASE WHEN total_predictions >= 50 THEN 1 END) as power_users,
      COUNT(CASE WHEN total_predictions >= 10 AND total_predictions < 50 THEN 1 END) as regular_users,
      COUNT(CASE WHEN total_predictions >= 1 AND total_predictions < 10 THEN 1 END) as casual_users,
      COUNT(CASE WHEN total_predictions = 0 THEN 1 END) as lurkers,
      COALESCE(MAX(total_predictions), 0) as max_bets,
      COALESCE(MAX(current_streak), 0) as best_streak
    FROM users`).first(),

    d1.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN date(received_at) = ? THEN 1 ELSE 0 END) as today,
      SUM(CASE WHEN date(received_at) >= date(?, '-7 days') THEN 1 ELSE 0 END) as last_7d
    FROM alerts`).bind(todayIST, todayIST).first(),

    // Growth: two separate queries (new users + bets per day) for last 14 days
    // We generate date series in JS because D1 limits compound SELECT terms
    (async () => {
      const since = new Date(Date.now() - 13 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
      const [userGrowth, betGrowth] = await Promise.all([
        d1.prepare(`SELECT date(created_at) as date, COUNT(*) as new_users
          FROM users WHERE date(created_at) >= ? GROUP BY date(created_at)`).bind(since).all(),
        d1.prepare(`SELECT date(placed_at) as date, COUNT(*) as bets_placed, SUM(amount) as bet_volume
          FROM bets WHERE date(placed_at) >= ? GROUP BY date(placed_at)`).bind(since).all(),
      ]);
      const userMap = new Map((userGrowth.results ?? []).map((r: Record<string, unknown>) => [r.date, r.new_users]));
      const betMap = new Map((betGrowth.results ?? []).map((r: Record<string, unknown>) => [r.date, r]));
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
        const bRow = betMap.get(d) as Record<string, unknown> | undefined;
        days.push({
          date: d,
          new_users: Number(userMap.get(d) ?? 0),
          bets_placed: Number(bRow?.bets_placed ?? 0),
          bet_volume: Number(bRow?.bet_volume ?? 0),
        });
      }
      return { results: days };
    })(),

    d1.prepare(`SELECT
      CASE
        WHEN (SELECT COUNT(*) FROM users WHERE date(created_at) = date(?, '-1 day')) = 0 THEN NULL
        ELSE ROUND(
          100.0 * (
            SELECT COUNT(DISTINCT u.id)
            FROM users u JOIN bets b ON b.user_id = u.id
            WHERE date(u.created_at) = date(?, '-1 day') AND date(b.placed_at) = ?
          ) / (SELECT COUNT(*) FROM users WHERE date(created_at) = date(?, '-1 day')),
          1
        )
      END as d1_retention`)
      .bind(todayIST, todayIST, todayIST, todayIST).first(),
  ]);

  return c.json({
    ok: true,
    generated_at: new Date().toISOString(),
    date_ist: todayIST,
    users: {
      total: userStats?.total ?? 0,
      new_today: userStats?.today ?? 0,
      new_last_7d: userStats?.last_7d ?? 0,
      new_last_30d: userStats?.last_30d ?? 0,
      claimed_daily_today: userStats?.claimed_daily_today ?? 0,
      ever_bet: userStats?.with_bets ?? 0,
    },
    bets: {
      total: betStats?.total ?? 0,
      today: betStats?.today ?? 0,
      last_7d: betStats?.last_7d ?? 0,
      total_volume: betStats?.total_volume ?? 0,
      today_volume: betStats?.today_volume ?? 0,
      avg_bet_size: betStats?.avg_bet_size ?? 0,
    },
    markets: {
      total: marketStats?.total ?? 0,
      open: marketStats?.open_count ?? 0,
      resolved: marketStats?.resolved ?? 0,
      total_pool: marketStats?.total_pool ?? 0,
    },
    engagement: {
      dau_today: dauStats?.dau_today ?? 0,
      dau_yesterday: dauStats?.dau_yesterday ?? 0,
      wau: dauStats?.wau ?? 0,
      retention_d1_pct: retentionData?.d1_retention ?? null,
      user_segments: {
        power_50plus: topUsers?.power_users ?? 0,
        regular_10_49: topUsers?.regular_users ?? 0,
        casual_1_9: topUsers?.casual_users ?? 0,
        lurkers_0: topUsers?.lurkers ?? 0,
      },
      max_bets_by_user: topUsers?.max_bets ?? 0,
      best_active_streak: topUsers?.best_streak ?? 0,
    },
    alerts: {
      total: alertStats?.total ?? 0,
      today: alertStats?.today ?? 0,
      last_7d: alertStats?.last_7d ?? 0,
    },
    growth_14d: growthData?.results ?? [],
  });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, 500);
  }
});

export default {
  fetch: app.fetch,

  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.DB);

    if (event.cron === "0 9 * * *") {
      // ~11:00 IST — daily reminder to claim bonus + refer friends
      await sendDailyReminders(db, env);
    } else if (event.cron === "30 19 * * *") {
      // ~21:30 IST — "closing soon" FOMO reminders for daily markets
      await sendClosingSoonReminders(db, env);
    } else {
      // 0 22 * * * = ~00:00 IST next day — settle expired daily markets
      const result = await settleExpiredHowManyMarkets(db);
      console.log(`[CRON] Settled ${result.settled} daily markets, created ${result.newMarkets.length} new`);
      // Send individual win/loss notifications
      for (const n of result.notifications) {
        await env.NOTIFICATION_QUEUE.send(n);
      }
      // Send combined daily summary to all users
      if (result.settled > 0 || result.newMarkets.length > 0) {
        await env.NOTIFICATION_QUEUE.send({
          type: "daily_summary",
          settled: result.settled,
          newMarkets: result.newMarkets,
        });
      }
    }
  },

  // Queue consumer
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    await handleNotificationBatch(batch, env);
  },
};