import { eq, and, desc, sql, gte, lte, count, sum } from "drizzle-orm";
import {
  users,
  markets,
  marketOptions,
  bets,
  alerts,
  dailyAlertCounts,
  achievements,
  referrals,
} from "@kazam/shared/schema";
import type { Database } from "./index.js";
import type { MarketStatus, MarketType } from "@kazam/shared/types";

// ====== User Queries ======

export function getUserByTelegramId(db: Database, telegramId: number) {
  return db.select().from(users).where(eq(users.telegram_id, telegramId)).get();
}

export function getUserById(db: Database, id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function getUserByReferralCode(db: Database, code: string) {
  return db.select().from(users).where(eq(users.referral_code, code)).get();
}

export function createUser(
  db: Database,
  data: {
    telegram_id: number;
    username: string | null;
    first_name: string;
    referral_code: string;
    referred_by?: number;
  },
) {
  return db.insert(users).values(data).returning().get();
}

export function updateUserCoins(
  db: Database,
  userId: number,
  delta: number,
  type: "earned" | "wagered",
) {
  if (type === "wagered") {
    return db
      .update(users)
      .set({
        coins: sql`${users.coins} + ${delta}`,
        total_wagered: sql`${users.total_wagered} + ${Math.abs(delta)}`,
      })
      .where(eq(users.id, userId))
      .returning()
      .get();
  }
  return db
    .update(users)
    .set({
      coins: sql`${users.coins} + ${delta}`,
      total_earned: sql`${users.total_earned} + ${Math.max(0, delta)}`,
    })
    .where(eq(users.id, userId))
    .returning()
    .get();
}

// ====== Market Queries ======

export function getMarketById(db: Database, id: number) {
  return db.select().from(markets).where(eq(markets.id, id)).get();
}

export function getMarketOptions(db: Database, marketId: number) {
  return db
    .select()
    .from(marketOptions)
    .where(eq(marketOptions.market_id, marketId))
    .orderBy(marketOptions.sort_order)
    .all();
}

export function listMarkets(
  db: Database,
  opts: {
    status?: MarketStatus;
    type?: MarketType;
    limit: number;
    offset: number;
  },
) {
  let query = db.select().from(markets).$dynamic();

  const conditions = [];
  if (opts.status) conditions.push(eq(markets.status, opts.status));
  if (opts.type) conditions.push(eq(markets.type, opts.type));
  if (conditions.length > 0) query = query.where(and(...conditions)) as typeof query;

  return query.orderBy(desc(markets.created_at)).limit(opts.limit).offset(opts.offset).all();
}

export function getOpenMarketByType(db: Database, type: MarketType) {
  return db
    .select()
    .from(markets)
    .where(and(eq(markets.type, type), eq(markets.status, "open")))
    .get();
}

export function createMarket(
  db: Database,
  data: {
    type: MarketType;
    question: string;
    question_en: string;
    opens_at: string;
    closes_at: string;
  },
) {
  return db.insert(markets).values(data).returning().get();
}

export function createMarketOption(
  db: Database,
  data: {
    market_id: number;
    label: string;
    label_en: string;
    sort_order: number;
    seed_amount?: number;
    total_amount?: number;
  },
) {
  return db.insert(marketOptions).values(data).returning().get();
}

export function setMarketPool(db: Database, marketId: number, pool: number) {
  return db
    .update(markets)
    .set({ total_pool: pool })
    .where(eq(markets.id, marketId))
    .run();
}

export function lockMarket(db: Database, marketId: number) {
  return db
    .update(markets)
    .set({ status: "locked" })
    .where(and(eq(markets.id, marketId), eq(markets.status, "open")))
    .returning()
    .get();
}

export function resolveMarket(
  db: Database,
  marketId: number,
  winningOptionId: number,
  alertId: number | null,
) {
  return db
    .update(markets)
    .set({
      status: "resolved",
      winning_option_id: winningOptionId,
      resolution_alert_id: alertId,
      resolved_at: new Date().toISOString(),
    })
    .where(eq(markets.id, marketId))
    .returning()
    .get();
}

export function cancelMarket(db: Database, marketId: number) {
  return db
    .update(markets)
    .set({ status: "cancelled" })
    .where(eq(markets.id, marketId))
    .returning()
    .get();
}

// ====== Bet Queries ======

export function placeBet(
  db: Database,
  data: {
    user_id: number;
    market_id: number;
    option_id: number;
    amount: number;
  },
) {
  return db.insert(bets).values(data).returning().get();
}

export function getUserBetsForMarket(
  db: Database,
  userId: number,
  marketId: number,
) {
  return db
    .select()
    .from(bets)
    .where(and(eq(bets.user_id, userId), eq(bets.market_id, marketId)))
    .all();
}

export function getBetsForMarketOption(
  db: Database,
  marketId: number,
  optionId: number,
) {
  return db
    .select()
    .from(bets)
    .where(and(eq(bets.market_id, marketId), eq(bets.option_id, optionId)))
    .all();
}

export function getWinningBets(db: Database, marketId: number, optionId: number) {
  return db
    .select()
    .from(bets)
    .where(and(eq(bets.market_id, marketId), eq(bets.option_id, optionId)))
    .all();
}

export function updateBetResult(
  db: Database,
  betId: number,
  isWin: boolean,
  payout: number,
) {
  return db
    .update(bets)
    .set({ is_win: isWin, payout })
    .where(eq(bets.id, betId))
    .run();
}

export function incrementOptionBets(
  db: Database,
  optionId: number,
  amount: number,
) {
  return db
    .update(marketOptions)
    .set({
      total_bets: sql`${marketOptions.total_bets} + 1`,
      total_amount: sql`${marketOptions.total_amount} + ${amount}`,
    })
    .where(eq(marketOptions.id, optionId))
    .run();
}

export function incrementMarketPool(
  db: Database,
  marketId: number,
  amount: number,
) {
  return db
    .update(markets)
    .set({
      total_pool: sql`${markets.total_pool} + ${amount}`,
    })
    .where(eq(markets.id, marketId))
    .run();
}

export function getUserActiveBets(db: Database, userId: number) {
  return db
    .select()
    .from(bets)
    .innerJoin(markets, eq(bets.market_id, markets.id))
    .where(
      and(
        eq(bets.user_id, userId),
        sql`${markets.status} IN ('open', 'locked', 'settling')`,
      ),
    )
    .all();
}

// ====== Alert Queries ======

export function insertAlert(
  db: Database,
  data: {
    external_id: string;
    type: string;
    cities: string[];
    regions: string[];
    instructions: string | null;
    dedupe_hash: string;
  },
) {
  return db.insert(alerts).values(data).returning().get();
}

export function getAlertByHash(db: Database, hash: string) {
  return db.select().from(alerts).where(eq(alerts.dedupe_hash, hash)).get();
}

export function getLatestAlert(db: Database) {
  return db.select().from(alerts).orderBy(desc(alerts.received_at)).limit(1).get();
}

/** Get the last N alerts for historical frequency analysis */
export function getRecentAlerts(db: Database, limit: number) {
  return db.select({ regions: alerts.regions }).from(alerts).orderBy(desc(alerts.received_at)).limit(limit).all();
}

export function listAlerts(
  db: Database,
  opts: { limit: number; offset: number; date?: string },
) {
  let query = db.select().from(alerts).$dynamic();
  if (opts.date) {
    query = query.where(
      sql`date(${alerts.received_at}) = ${opts.date}`,
    ) as typeof query;
  }
  return query.orderBy(desc(alerts.received_at)).limit(opts.limit).offset(opts.offset).all();
}

/**
 * Upsert daily alert count.
 * Uses per-region JSON increment via json_set + json_extract to correctly
 * accumulate counts when multiple alerts hit the same region on the same day.
 * (The old json_patch approach replaced values instead of summing — that was a bug.)
 */
export function upsertDailyCount(
  db: Database,
  date: string,
  data: {
    missile_count: number;
    total_count: number;
    regions: Record<string, number>;
  },
) {
  // Build a json_set expression that increments each region count.
  // Result: json_set(regions, '$.north', coalesce(json_extract(regions, '$.north'), 0) + 1, ...)
  const regionEntries = Object.entries(data.regions);

  // Build the regions update expression
  let regionsSetExpr: string;
  if (regionEntries.length === 0) {
    regionsSetExpr = `"regions"`;
  } else {
    const setClauses = regionEntries.map(([region, count]) => {
      const safeKey = region.replace(/[^a-zA-Z0-9_]/g, "");
      const safeCount = Math.max(0, Math.floor(Number(count)));
      return `'$.${safeKey}', COALESCE(json_extract("regions", '$.${safeKey}'), 0) + ${safeCount}`;
    });
    regionsSetExpr = `json_set("regions", ${setClauses.join(", ")})`;
  }

  return db
    .insert(dailyAlertCounts)
    .values({ date, ...data })
    .onConflictDoUpdate({
      target: dailyAlertCounts.date,
      set: {
        missile_count: sql`${dailyAlertCounts.missile_count} + ${data.missile_count}`,
        total_count: sql`${dailyAlertCounts.total_count} + ${data.total_count}`,
        regions: sql.raw(regionsSetExpr),
      },
    })
    .run();
}

export function getDailyAlertCount(db: Database, date: string) {
  return db
    .select()
    .from(dailyAlertCounts)
    .where(eq(dailyAlertCounts.date, date))
    .get();
}

export function getAllUsers(db: Database) {
  return db.select({ id: users.id, telegram_id: users.telegram_id }).from(users).all();
}

/**
 * Get users who haven't claimed daily bonus today.
 * Handles both old format ("2026-03-12T...Z" UTC ISO) and
 * new format ("2026-03-12|2026-03-11T...Z" IST-date|UTC-ISO).
 * For new format: extracts IST date prefix (before '|').
 * For old format: uses date() to extract UTC date (close enough for reminder purposes).
 */
export function getUsersWithoutDailyClaim(db: Database, today: string) {
  return db
    .select({
      id: users.id,
      telegram_id: users.telegram_id,
      first_name: users.first_name,
      daily_streak: users.daily_streak,
    })
    .from(users)
    .where(
      sql`${users.last_daily_claim_at} IS NULL OR SUBSTR(${users.last_daily_claim_at}, 1, 10) < ${today}`,
    )
    .all();
}

/**
 * Get all users who have NOT placed any bet on a given market.
 * Used for "closing soon" reminders — only notify users who might still want to bet.
 */
export function getUsersWithoutBetOnMarket(db: Database, marketId: number) {
  return db
    .select({
      id: users.id,
      telegram_id: users.telegram_id,
    })
    .from(users)
    .where(
      sql`${users.id} NOT IN (SELECT DISTINCT ${bets.user_id} FROM ${bets} WHERE ${bets.market_id} = ${marketId})`,
    )
    .all();
}

// ====== Leaderboard Queries ======

export function getLeaderboard(
  db: Database,
  opts: { limit: number; offset: number; period?: string },
) {
  // Score = (correct_predictions * 10) + (total_earned / 100) + (current_streak * 5)
  return db
    .select({
      user_id: users.id,
      telegram_id: users.telegram_id,
      username: users.username,
      first_name: users.first_name,
      correct_predictions: users.correct_predictions,
      total_predictions: users.total_predictions,
      current_streak: users.current_streak,
      score: sql<number>`(${users.correct_predictions} * 10) + (${users.total_earned} / 100) + (${users.current_streak} * 5)`,
    })
    .from(users)
    .orderBy(
      desc(
        sql`(${users.correct_predictions} * 10) + (${users.total_earned} / 100) + (${users.current_streak} * 5)`,
      ),
    )
    .limit(opts.limit)
    .offset(opts.offset)
    .all();
}

// ====== Achievement Queries ======

export function getUserAchievements(db: Database, userId: number) {
  return db
    .select()
    .from(achievements)
    .where(eq(achievements.user_id, userId))
    .all();
}

export function unlockAchievement(
  db: Database,
  userId: number,
  type: string,
) {
  return db
    .insert(achievements)
    .values({ user_id: userId, type })
    .onConflictDoNothing()
    .run();
}

// ====== Referral Queries ======

export function createReferral(
  db: Database,
  referrerId: number,
  referredId: number,
) {
  return db
    .insert(referrals)
    .values({ referrer_id: referrerId, referred_id: referredId })
    .returning()
    .get();
}

export function markReferralPaid(db: Database, referralId: number) {
  return db
    .update(referrals)
    .set({ bonus_paid: true })
    .where(eq(referrals.id, referralId))
    .run();
}

export async function getReferralCount(db: Database, userId: number) {
  const result = await db
    .select({ count: count() })
    .from(referrals)
    .where(eq(referrals.referrer_id, userId))
    .get();
  return result?.count ?? 0;
}

// ====== Weekly Leaderboard Queries ======

/**
 * Get the top N users by weekly performance.
 * Ranks users by: wins * 10 + total_payout / 100 from bets placed in the last 7 days.
 * Only counts resolved bets (is_win IS NOT NULL).
 */
export function getWeeklyLeaderboard(db: Database, limit: number = 10) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return db
    .select({
      user_id: bets.user_id,
      telegram_id: users.telegram_id,
      username: users.username,
      first_name: users.first_name,
      weekly_wins: sql<number>`SUM(CASE WHEN ${bets.is_win} = 1 THEN 1 ELSE 0 END)`,
      weekly_bets: sql<number>`COUNT(*)`,
      weekly_payout: sql<number>`COALESCE(SUM(CASE WHEN ${bets.is_win} = 1 THEN ${bets.payout} ELSE 0 END), 0)`,
      weekly_score: sql<number>`SUM(CASE WHEN ${bets.is_win} = 1 THEN 1 ELSE 0 END) * 10 + COALESCE(SUM(CASE WHEN ${bets.is_win} = 1 THEN ${bets.payout} ELSE 0 END), 0) / 100`,
    })
    .from(bets)
    .innerJoin(users, eq(bets.user_id, users.id))
    .where(
      and(
        gte(bets.placed_at, weekAgo),
        sql`${bets.is_win} IS NOT NULL`,
      ),
    )
    .groupBy(bets.user_id)
    .orderBy(desc(sql`SUM(CASE WHEN ${bets.is_win} = 1 THEN 1 ELSE 0 END) * 10 + COALESCE(SUM(CASE WHEN ${bets.is_win} = 1 THEN ${bets.payout} ELSE 0 END), 0) / 100`))
    .limit(limit)
    .all();
}


// ====== Bet History Query ======

/**
 * Get a user's recent bet history with market details.
 * Returns bets ordered by most recent first.
 */
export function getUserBetHistory(db: Database, userId: number, limit: number = 10) {
  return db
    .select({
      id: bets.id,
      amount: bets.amount,
      payout: bets.payout,
      is_win: bets.is_win,
      placed_at: bets.placed_at,
      market_type: markets.type,
      market_question: markets.question,
      market_status: markets.status,
      option_label: marketOptions.label,
    })
    .from(bets)
    .innerJoin(markets, eq(bets.market_id, markets.id))
    .innerJoin(marketOptions, eq(bets.option_id, marketOptions.id))
    .where(eq(bets.user_id, userId))
    .orderBy(desc(bets.placed_at))
    .limit(limit)
    .all();
}

// ====== Weekly User Summary Query ======

/**
 * Get a user's weekly stats summary for personal recap DMs.
 * Returns bet count, wins, losses, net change, accuracy.
 */
export function getUserWeeklySummary(db: Database, userId: number) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return db
    .select({
      total_bets: sql<number>`COUNT(*)`,
      total_wins: sql<number>`SUM(CASE WHEN ${bets.is_win} = 1 THEN 1 ELSE 0 END)`,
      total_wagered: sql<number>`COALESCE(SUM(${bets.amount}), 0)`,
      total_payout: sql<number>`COALESCE(SUM(CASE WHEN ${bets.is_win} = 1 THEN ${bets.payout} ELSE 0 END), 0)`,
      biggest_win: sql<number>`COALESCE(MAX(CASE WHEN ${bets.is_win} = 1 THEN ${bets.payout} ELSE 0 END), 0)`,
    })
    .from(bets)
    .where(
      and(
        eq(bets.user_id, userId),
        gte(bets.placed_at, weekAgo),
        sql`${bets.is_win} IS NOT NULL`,
      ),
    )
    .get();
}