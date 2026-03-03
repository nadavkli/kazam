import type { Database } from "@kazam/db";
import {
  createMarket,
  createMarketOption,
  getOpenMarketByType,
  getLatestAlert,
  getDailyAlertCount,
  getMarketOptions,
  listMarkets,
} from "@kazam/db/queries";
import { REGIONS, REGION_LABELS } from "@kazam/shared/regions";
import {
  WHERE_MARKET_COOLDOWN_MS,
  WHEN_BUCKETS,
  HOW_MANY_BUCKETS,
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

  const market = await createMarket(db, {
    type: "where",
    question: "איפה תהיה האזעקה הבאה?",
    question_en: "Where will the next alert hit?",
    opens_at: now,
    closes_at: farFuture,
  });

  // Create region options
  for (let i = 0; i < REGIONS.length; i++) {
    const region = REGIONS[i];
    const labels = REGION_LABELS[region];
    await createMarketOption(db, {
      market_id: market.id,
      label: labels.he,
      label_en: labels.en,
      sort_order: i,
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

  // Create tomorrow's HOW_MANY market
  await maybeCreateHowManyMarket(db);

  return { settled: settledCount, notifications: allNotifications };
}
