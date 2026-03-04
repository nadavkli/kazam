/** Minimum bet amount in coins */
export const MIN_BET = 10;

/** Maximum bet per market per user */
export const MAX_BET = 500;

/** Rake percentage taken from winning pool */
export const RAKE_PERCENT = 5;

/** Virtual seed per option for initial liquidity — guarantees meaningful payouts even for solo bettors */
export const OPTION_SEED_AMOUNT = 500;

/** Daily login bonus */
export const DAILY_BONUS = 100;

/** Bonus coins per streak day */
export const STREAK_BONUS = 25;

/** Max streak bonus per day */
export const MAX_STREAK_BONUS = 100;

/** Starting coins for new users */
export const STARTING_COINS = 100;

/** Referral bonus for both users */
export const REFERRAL_BONUS = 200;

/** Weekly top 10 bonus */
export const WEEKLY_TOP_BONUS = 500;

/** Cooldown after last alert before opening a new WHERE market (ms) */
export const WHERE_MARKET_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

/** Alert dedup sliding window (ms) */
export const ALERT_DEDUP_WINDOW_MS = 60 * 1000; // 60s

/** Alert poll interval (ms) */
export const ALERT_POLL_INTERVAL_MS = 10000; // 10s — balances real-time with Tzofar rate limits

/** High alert threshold per hour for sensitivity mode */
export const SENSITIVITY_THRESHOLD_PER_HOUR = 20;

/** Israel timezone */
export const IST_TIMEZONE = "Asia/Jerusalem";

/** When market time buckets */
export const WHEN_BUCKETS = [
  { label: "פחות משעה", label_en: "< 1 hour", min_ms: 0, max_ms: 3600000 },
  { label: "1-3 שעות", label_en: "1-3 hours", min_ms: 3600000, max_ms: 10800000 },
  { label: "3-6 שעות", label_en: "3-6 hours", min_ms: 10800000, max_ms: 21600000 },
  { label: "6-12 שעות", label_en: "6-12 hours", min_ms: 21600000, max_ms: 43200000 },
  { label: "12-24 שעות", label_en: "12-24 hours", min_ms: 43200000, max_ms: 86400000 },
  { label: "מעל 24 שעות", label_en: "> 24 hours", min_ms: 86400000, max_ms: Infinity },
] as const;

/** How many market daily buckets */
export const HOW_MANY_BUCKETS = [
  { label: "0", label_en: "0", min: 0, max: 0 },
  { label: "1-2", label_en: "1-2", min: 1, max: 2 },
  { label: "3-5", label_en: "3-5", min: 3, max: 5 },
  { label: "6-10", label_en: "6-10", min: 6, max: 10 },
  { label: "11-20", label_en: "11-20", min: 11, max: 20 },
  { label: "20+", label_en: "20+", min: 21, max: Infinity },
] as const;

/** War duration market buckets */
export const WAR_DURATION_BUCKETS = [
  { label: "עד שבוע", label_en: "< 1 week", min_days: 0, max_days: 7 },
  { label: "1-2 שבועות", label_en: "1-2 weeks", min_days: 7, max_days: 14 },
  { label: "2-4 שבועות", label_en: "2-4 weeks", min_days: 14, max_days: 28 },
  { label: "1-3 חודשים", label_en: "1-3 months", min_days: 28, max_days: 90 },
  { label: "3-6 חודשים", label_en: "3-6 months", min_days: 90, max_days: 180 },
  { label: "מעל 6 חודשים", label_en: "6+ months", min_days: 180, max_days: Infinity },
] as const;

/** Alert type market options */
export const ALERT_TYPE_OPTIONS = [
  { label: "רקטות וטילים", label_en: "Rockets/Missiles", cat: "1" },
  { label: "חדירת כלי טיס", label_en: "Hostile Aircraft/UAV", cat: "6" },
  { label: "חדירת מחבלים", label_en: "Terrorist Infiltration", cat: "terroristInfiltration" },
  { label: "רעידת אדמה", label_en: "Earthquake", cat: "earthquake" },
  { label: "אחר", label_en: "Other", cat: "other" },
] as const;

/** Intensity comparison market options */
export const INTENSITY_OPTIONS = [
  { label: "יותר", label_en: "More" },
  { label: "אותו דבר", label_en: "Same" },
  { label: "פחות", label_en: "Less" },
] as const;

/** Achievement types */
export const ACHIEVEMENT_TYPES = [
  "first_bet",
  "first_win",
  "streak_3",
  "streak_7",
  "streak_14",
  "streak_30",
  "total_bets_10",
  "total_bets_50",
  "total_bets_100",
  "total_wins_10",
  "total_wins_50",
  "big_win_500",
  "big_win_1000",
  "refer_1",
  "refer_5",
  "top_10_weekly",
] as const;

export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number];
