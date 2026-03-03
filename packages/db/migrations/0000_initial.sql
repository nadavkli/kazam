-- Initial Kazam schema
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  username TEXT,
  first_name TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 100,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_wagered INTEGER NOT NULL DEFAULT 0,
  correct_predictions INTEGER NOT NULL DEFAULT 0,
  total_predictions INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_daily_claim_at TEXT,
  referral_code TEXT NOT NULL,
  referred_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_idx ON users(telegram_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code);

CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('where', 'when', 'how_many')),
  question TEXT NOT NULL,
  question_en TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'locked', 'settling', 'resolved', 'cancelled')),
  total_pool INTEGER NOT NULL DEFAULT 0,
  winning_option_id INTEGER,
  resolution_alert_id INTEGER,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS markets_status_idx ON markets(status);
CREATE INDEX IF NOT EXISTS markets_type_idx ON markets(type);

CREATE TABLE IF NOT EXISTS market_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id INTEGER NOT NULL REFERENCES markets(id),
  label TEXT NOT NULL,
  label_en TEXT NOT NULL,
  total_bets INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  is_winner INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS market_options_market_idx ON market_options(market_id);

CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  market_id INTEGER NOT NULL REFERENCES markets(id),
  option_id INTEGER NOT NULL REFERENCES market_options(id),
  amount INTEGER NOT NULL,
  payout INTEGER,
  is_win INTEGER,
  placed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bets_user_idx ON bets(user_id);
CREATE INDEX IF NOT EXISTS bets_market_idx ON bets(market_id);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT NOT NULL,
  type TEXT NOT NULL,
  cities TEXT NOT NULL DEFAULT '[]',
  regions TEXT NOT NULL DEFAULT '[]',
  instructions TEXT,
  dedupe_hash TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_dedupe_hash_idx ON alerts(dedupe_hash);

CREATE TABLE IF NOT EXISTS daily_alert_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  missile_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  regions TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS daily_alert_counts_date_idx ON daily_alert_counts(date);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS achievements_user_type_idx ON achievements(user_id, type);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL REFERENCES users(id),
  referred_id INTEGER NOT NULL REFERENCES users(id),
  bonus_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_idx ON referrals(referred_id);
