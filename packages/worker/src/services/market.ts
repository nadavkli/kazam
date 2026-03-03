import type { Database } from "@kazam/db";
import {
  createMarket,
  createMarketOption,
  getOpenMarketByType,
  getLatestAlert,
} from "@kazam/db/queries";
import { REGIONS, REGION_LABELS } from "@kazam/shared/regions";
import {
  WHERE_MARKET_COOLDOWN_MS,
  WHEN_BUCKETS,
  HOW_MANY_BUCKETS,
  IST_TIMEZONE,
} from "@kazam/shared/constants";
import type { MarketType, Market } from "@kazam/shared/types";

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
