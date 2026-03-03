import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ====== Users ======
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    telegram_id: integer("telegram_id").notNull(),
    username: text("username"),
    first_name: text("first_name").notNull(),
    coins: integer("coins").notNull().default(100),
    total_earned: integer("total_earned").notNull().default(0),
    total_wagered: integer("total_wagered").notNull().default(0),
    correct_predictions: integer("correct_predictions").notNull().default(0),
    total_predictions: integer("total_predictions").notNull().default(0),
    current_streak: integer("current_streak").notNull().default(0),
    longest_streak: integer("longest_streak").notNull().default(0),
    last_daily_claim_at: text("last_daily_claim_at"),
    referral_code: text("referral_code").notNull(),
    referred_by: integer("referred_by"),
    created_at: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("users_telegram_id_idx").on(table.telegram_id),
    uniqueIndex("users_referral_code_idx").on(table.referral_code),
  ],
);

// ====== Markets ======
export const markets = sqliteTable(
  "markets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["where", "when", "how_many", "war_duration", "alert_type", "intensity"] }).notNull(),
    question: text("question").notNull(),
    question_en: text("question_en").notNull(),
    status: text("status", {
      enum: ["open", "locked", "settling", "resolved", "cancelled"],
    })
      .notNull()
      .default("open"),
    total_pool: integer("total_pool").notNull().default(0),
    winning_option_id: integer("winning_option_id"),
    resolution_alert_id: integer("resolution_alert_id"),
    opens_at: text("opens_at").notNull(),
    closes_at: text("closes_at").notNull(),
    resolved_at: text("resolved_at"),
    created_at: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("markets_status_idx").on(table.status),
    index("markets_type_idx").on(table.type),
  ],
);

// ====== Market Options ======
export const marketOptions = sqliteTable(
  "market_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    market_id: integer("market_id")
      .notNull()
      .references(() => markets.id),
    label: text("label").notNull(),
    label_en: text("label_en").notNull(),
    total_bets: integer("total_bets").notNull().default(0),
    total_amount: integer("total_amount").notNull().default(0),
    is_winner: integer("is_winner", { mode: "boolean" }),
    sort_order: integer("sort_order").notNull().default(0),
    seed_amount: integer("seed_amount").notNull().default(100),
  },
  (table) => [index("market_options_market_idx").on(table.market_id)],
);

// ====== Bets ======
export const bets = sqliteTable(
  "bets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id),
    market_id: integer("market_id")
      .notNull()
      .references(() => markets.id),
    option_id: integer("option_id")
      .notNull()
      .references(() => marketOptions.id),
    amount: integer("amount").notNull(),
    payout: integer("payout"),
    is_win: integer("is_win", { mode: "boolean" }),
    placed_at: text("placed_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("bets_user_idx").on(table.user_id),
    index("bets_market_idx").on(table.market_id),
  ],
);

// ====== Alerts ======
export const alerts = sqliteTable(
  "alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    external_id: text("external_id").notNull(),
    type: text("type").notNull(),
    cities: text("cities", { mode: "json" }).notNull().$type<string[]>(),
    regions: text("regions", { mode: "json" }).notNull().$type<string[]>(),
    instructions: text("instructions"),
    dedupe_hash: text("dedupe_hash").notNull(),
    received_at: text("received_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [uniqueIndex("alerts_dedupe_hash_idx").on(table.dedupe_hash)],
);

// ====== Daily Alert Counts ======
export const dailyAlertCounts = sqliteTable(
  "daily_alert_counts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    missile_count: integer("missile_count").notNull().default(0),
    total_count: integer("total_count").notNull().default(0),
    regions: text("regions", { mode: "json" }).notNull().$type<Record<string, number>>(),
  },
  (table) => [uniqueIndex("daily_alert_counts_date_idx").on(table.date)],
);

// ====== Achievements ======
export const achievements = sqliteTable(
  "achievements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    user_id: integer("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type").notNull(),
    unlocked_at: text("unlocked_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("achievements_user_type_idx").on(table.user_id, table.type),
  ],
);

// ====== Referrals ======
export const referrals = sqliteTable(
  "referrals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referrer_id: integer("referrer_id")
      .notNull()
      .references(() => users.id),
    referred_id: integer("referred_id")
      .notNull()
      .references(() => users.id),
    bonus_paid: integer("bonus_paid", { mode: "boolean" })
      .notNull()
      .default(false),
    created_at: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("referrals_referred_idx").on(table.referred_id),
  ],
);
