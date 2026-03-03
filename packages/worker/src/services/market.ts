import type { Database } from "@kazam/db";
import {
  createMarket,
  createMarketOption,
  getOpenMarketByType,
  getLatestAlert,
  getRecentAlerts,
  getDailyAlertCount,
  getMarketOptions,
  listMarkets,
} from "@kazam/db/queries";
import { REGIONS, REGION_LABELS } from "@kazam/shared/regions";
import {
  WHERE_MARKET_COOLDOWN_MS,
  WHEN_BUCKETS,
  HOW_MANY_BUCKETS,
  WAR_DURATION_BUCKETS,
  ALERT_TYPE_OPTIONS,
  INTENSITY_OPTIONS,
  IST_TIMEZONE,
} from "@kazam/shared/constants";
import type { MarketType, Market, NotificationMessage } from "@kazam/shared/types";
import { settleMarket } from "./settlement.js";

/**
 * Auto-create a WHERE market if cooldown has passed since last alert.
 */
export async function maybeCreateWhereMarket(
  db: Database,
): Promise<Market | null> {
  // Don't create if one is already open
  const existing = await getOpenMarketByType(db, "where");
  if (existing) return null;

  // Check cooldown
  const lastAlert = await getLatestAlert(db);
  if (lastAlert) {
    const alertTime = new Date(lastAlert.received_at).getTime();
    if (Date.now() - alertTime < WHERE_MARKET_COOLDOWN_MS) {
      return null;
    }
  }

  const now = new Date().toISOString();
  // WHERE markets stay open until an alert fires (closes_at is far future)
  const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Compute historical region weights from last 50 alerts
  const recentAlerts = await getRecentAlerts(db, 50);
  const regionHits: Record<string, number> = {};
  for (const a of recentAlerts) {
    const regions = (typeof a.regions === "string" ? JSON.parse(a.regions) : a.regions) as string[];
    for (const r of regions) {
      regionHits[r] = (regionHits[r] ?? 0) + 1;
    }
  }
  const totalHits = Object.values(regionHits).reduce((s, v) => s + v, 0) || 1;

  const market = await createMarket(db, {
    type: "where",
    question: "איפה תהיה האזעקה הבאה?",
    question_en: "Where will the next alert hit?",
    opens_at: now,
    closes_at: farFuture,
  });

  // Create region options with weighted seeds based on historical frequency
  // More hits = higher virtual seed = lower starting odds (reflects real probability)
  const BASE_SEED = 100;
  for (let i = 0; i < REGIONS.length; i++) {
    const region = REGIONS[i];
    const labels = REGION_LABELS[region];
    const hits = regionHits[region] ?? 0;
    // Weight: regions with more history get proportionally higher seeds
    // Min seed = BASE_SEED * 0.3 (never zero), scales up to BASE_SEED * 3 for dominant regions
    const weight = totalHits > 0 ? Math.max(0.3, (hits / totalHits) * REGIONS.length) : 1;
    const seed = Math.round(BASE_SEED * weight);

    await createMarketOption(db, {
      market_id: market.id,
      label: labels.he,
      label_en: labels.en,
      sort_order: i,
      seed_amount: seed,
    });
  }

  return market;
}

/**
 * Auto-create a WHEN market after an alert resolves.
 */
export async function maybeCreateWhenMarket(
  db: Database,
): Promise<Market | null> {
  const existing = await getOpenMarketByType(db, "when");
  if (existing) return null;

  const now = new Date().toISOString();
  const farFuture = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const market = await createMarket(db, {
    type: "when",
    question: "מתי תהיה האזעקה הבאה?",
    question_en: "When will the next alert happen?",
    opens_at: now,
    closes_at: farFuture,
  });

  for (let i = 0; i < WHEN_BUCKETS.length; i++) {
    const bucket = WHEN_BUCKETS[i];
    await createMarketOption(db, {
      market_id: market.id,
      label: bucket.label,
      label_en: bucket.label_en,
      sort_order: i,
    });
  }

  return market;
}

/**
 * Create a daily HOW_MANY market.
 */
export async function maybeCreateHowManyMarket(
  db: Database,
): Promise<Market | null> {
  const existing = await getOpenMarketByType(db, "how_many");
  if (existing) return null;

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: IST_TIMEZONE,
  });

  const now = new Date().toISOString();
  // Closes at end of day IST
  const endOfDay = new Date(`${today}T23:59:59+03:00`).toISOString();

  const market = await createMarket(db, {
    type: "how_many",
    question: `כמה אזעקות היום? (${today})`,
    question_en: `How many alerts today? (${today})`,
    opens_at: now,
    closes_at: endOfDay,
  });

  for (let i = 0; i < HOW_MANY_BUCKETS.length; i++) {
    const bucket = HOW_MANY_BUCKETS[i];
    await createMarketOption(db, {
      market_id: market.id,
      label: bucket.label,
      label_en: bucket.label_en,
      sort_order: i,
    });
  }

  return market;
}

/**
 * Create a WAR_DURATION market (long-term prediction).
 * Only one can exist at a time. Admin-triggered.
 */
export async function maybeCreateWarDurationMarket(
  db: Database,
): Promise<Market | null> {
  const existing = await getOpenMarketByType(db, "war_duration");
  if (existing) return null;

  const now = new Date().toISOString();
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const market = await createMarket(db, {
    type: "war_duration",
    question: "כמה ימים עוד למלחמה?",
    question_en: "How many more days will the war last?",
    opens_at: now,
    closes_at: farFuture,
  });

  for (let i = 0; i < WAR_DURATION_BUCKETS.length; i++) {
    const bucket = WAR_DURATION_BUCKETS[i];
    await createMarketOption(db, {
      market_id: market.id,
      label: bucket.label,
      label_en: bucket.label_en,
      sort_order: i,
    });
  }

  return market;
}

/**
 * Create an ALERT_TYPE market - "What type will the next alert be?"
 * Auto-created after each alert resolves.
 */
export async function maybeCreateAlertTypeMarket(
  db: Database,
): Promise<Market | null> {
  const existing = await getOpenMarketByType(db, "alert_type");
  if (existing) return null;

  const lastAlert = await getLatestAlert(db);
  if (lastAlert) {
    const alertTime = new Date(lastAlert.received_at).getTime();
    if (Date.now() - alertTime < WHERE_MARKET_COOLDOWN_MS) {
      return null;
    }
  }

  const now = new Date().toISOString();
  const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const market = await createMarket(db, {
    type: "alert_type",
    question: "מה תהיה האזעקה הבאה?",
    question_en: "What type will the next alert be?",
    opens_at: now,
    closes_at: farFuture,
  });

  for (let i = 0; i < ALERT_TYPE_OPTIONS.length; i++) {
    const opt = ALERT_TYPE_OPTIONS[i];
    await createMarketOption(db, {
      market_id: market.id,
      label: opt.label,
      label_en: opt.label_en,
      sort_order: i,
    });
  }

  return market;
}

/**
 * Create a daily INTENSITY market - "More or fewer alerts than yesterday?"
 * Compares today's alert count vs yesterday's. Settles at end of day.
 */
export async function maybeCreateIntensityMarket(
  db: Database,
): Promise<Market | null> {
  const existing = await getOpenMarketByType(db, "intensity");
  if (existing) return null;

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: IST_TIMEZONE,
  });

  // Get yesterday's date
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: IST_TIMEZONE,
  });

  const yesterdayCount = await getDailyAlertCount(db, yesterday);
  const yCount = yesterdayCount?.total_count ?? 0;

  const now = new Date().toISOString();
  const endOfDay = new Date(`${today}T23:59:59+03:00`).toISOString();

  const market = await createMarket(db, {
    type: "intensity",
    question: `יותר או פחות אזעקות מאתמול? (אתמול: ${yCount})`,
    question_en: `More or fewer alerts than yesterday? (Yesterday: ${yCount})`,
    opens_at: now,
    closes_at: endOfDay,
  });

  for (let i = 0; i < INTENSITY_OPTIONS.length; i++) {
    const opt = INTENSITY_OPTIONS[i];
    await createMarketOption(db, {
      market_id: market.id,
      label: opt.label,
      label_en: opt.label_en,
      sort_order: i,
    });
  }

  return market;
}

/**
 * Settle expired HOW_MANY markets at end of day.
 * Called by Cloudflare Scheduled Event (cron trigger).
 */
export async function settleExpiredHowManyMarkets(
  db: Database,
): Promise<{ settled: number; notifications: NotificationMessage[] }> {
  const openMarkets = await listMarkets(db, {
    status: "open",
    type: "how_many",
    limit: 10,
    offset: 0,
  });

  const now = Date.now();
  const allNotifications: NotificationMessage[] = [];
  let settledCount = 0;

  for (const market of openMarkets) {
    const closesAt = new Date(market.closes_at).getTime();
    if (now < closesAt) continue; // Not yet expired

    // Extract date from question_en (format: "... (YYYY-MM-DD)")
    const dateMatch = market.question_en.match(/\((\d{4}-\d{2}-\d{2})\)/);
    if (!dateMatch) continue;
    const marketDate = dateMatch[1];

    // Get the actual alert count for that day
    const dailyCount = await getDailyAlertCount(db, marketDate);
    const totalAlerts = dailyCount?.total_count ?? 0;

    // Find the winning bucket option
    const options = await getMarketOptions(db, market.id);
    let winningOption = options[options.length - 1]; // Default to last (20+)

    for (let i = 0; i < HOW_MANY_BUCKETS.length; i++) {
      const bucket = HOW_MANY_BUCKETS[i];
      if (totalAlerts >= bucket.min && totalAlerts <= bucket.max) {
        winningOption = options[i];
        break;
      }
    }

    if (!winningOption) continue;

    const result = await settleMarket(db, market.id, winningOption.id, null);
    if (!("error" in result)) {
      settledCount++;
      allNotifications.push(...result.notifications);
    }
  }

  // Also settle expired WHEN markets (> 24 hours without alert = last bucket wins)
  const openWhenMarkets = await listMarkets(db, {
    status: "open",
    type: "when",
    limit: 10,
    offset: 0,
  });

  for (const market of openWhenMarkets) {
    const closesAt = new Date(market.closes_at).getTime();
    if (now < closesAt) continue;

    const options = await getMarketOptions(db, market.id);
    const lastOption = options[options.length - 1]; // "> 24 hours" bucket
    if (!lastOption) continue;

    const result = await settleMarket(db, market.id, lastOption.id, null);
    if (!("error" in result)) {
      settledCount++;
      allNotifications.push(...result.notifications);
    }
  }

  // Settle expired INTENSITY markets
  const openIntensityMarkets = await listMarkets(db, {
    status: "open",
    type: "intensity",
    limit: 10,
    offset: 0,
  });

  for (const market of openIntensityMarkets) {
    const closesAt = new Date(market.closes_at).getTime();
    if (now < closesAt) continue;

    // Extract yesterday's count from question_en
    const countMatch = market.question_en.match(/Yesterday: (\d+)/);
    const yesterdayCount = countMatch ? parseInt(countMatch[1], 10) : 0;

    // Get today's count
    const dateMatch = market.opens_at.slice(0, 10);
    const todayDate = new Date(market.opens_at).toLocaleDateString("en-CA", {
      timeZone: IST_TIMEZONE,
    });
    const todayCount = await getDailyAlertCount(db, todayDate);
    const todayTotal = todayCount?.total_count ?? 0;

    const options = await getMarketOptions(db, market.id);
    let winIdx: number;
    if (todayTotal > yesterdayCount) winIdx = 0; // More
    else if (todayTotal === yesterdayCount) winIdx = 1; // Same
    else winIdx = 2; // Less

    const winOpt = options[winIdx];
    if (!winOpt) continue;

    const result = await settleMarket(db, market.id, winOpt.id, null);
    if (!("error" in result)) {
      settledCount++;
      allNotifications.push(...result.notifications);
    }
  }

  // Create tomorrow's markets
  await maybeCreateHowManyMarket(db);
  await maybeCreateIntensityMarket(db);

  return { settled: settledCount, notifications: allNotifications };
}
