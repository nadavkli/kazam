import type { Region } from "./regions.js";
import type { AchievementType } from "./constants.js";

// ====== Market Types ======

export type MarketType = "where" | "when" | "how_many" | "war_duration" | "alert_type" | "intensity";

export type MarketStatus =
  | "open"
  | "locked"
  | "settling"
  | "resolved"
  | "cancelled";

export interface Market {
  id: number;
  type: MarketType;
  question: string;
  question_en: string;
  status: MarketStatus;
  total_pool: number;
  winning_option_id: number | null;
  resolution_alert_id: number | null;
  opens_at: string;
  closes_at: string;
  resolved_at: string | null;
  created_at: string;
}

export interface MarketOption {
  id: number;
  market_id: number;
  label: string;
  label_en: string;
  total_bets: number;
  total_amount: number;
  is_winner: boolean | null;
  sort_order: number;
}

export interface MarketWithOptions extends Market {
  options: MarketOptionWithOdds[];
}

export interface MarketOptionWithOdds extends MarketOption {
  odds: number;
  probability: number;
}

// ====== Bet Types ======

export interface Bet {
  id: number;
  user_id: number;
  market_id: number;
  option_id: number;
  amount: number;
  payout: number | null;
  is_win: boolean | null;
  placed_at: string;
}

export interface BetWithDetails extends Bet {
  market: Market;
  option: MarketOption;
}

// ====== User Types ======

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  coins: number;
  total_earned: number;
  total_wagered: number;
  correct_predictions: number;
  total_predictions: number;
  current_streak: number;
  longest_streak: number;
  last_daily_claim_at: string | null;
  referral_code: string;
  referred_by: number | null;
  created_at: string;
}

export interface UserProfile extends User {
  rank: number | null;
  score: number;
  active_bets: number;
  achievements: AchievementType[];
}

// ====== Alert Types ======

export interface Alert {
  id: number;
  external_id: string;
  type: string;
  cities: string[];
  regions: Region[];
  instructions: string | null;
  dedupe_hash: string;
  received_at: string;
}

export interface DailyAlertCount {
  date: string;
  missile_count: number;
  total_count: number;
  regions: Record<Region, number>;
}

// ====== Leaderboard ======

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  score: number;
  correct_predictions: number;
  total_predictions: number;
  current_streak: number;
  accuracy: number;
}

export type LeaderboardPeriod = "weekly" | "monthly" | "all_time" | "friends";

// ====== Achievement ======

export interface Achievement {
  user_id: number;
  type: AchievementType;
  unlocked_at: string;
}

// ====== API Payloads ======

export interface PlaceBetRequest {
  market_id: number;
  option_id: number;
  amount: number;
}

export interface PlaceBetResponse {
  bet: Bet;
  new_balance: number;
  market: MarketWithOptions;
}

export interface DailyClaimResponse {
  coins_awarded: number;
  streak: number;
  new_balance: number;
}

// ====== Pikud HaOref Raw ======

export interface OrefAlertRaw {
  id: string;
  cat: string;
  title: string;
  data: string[];
  desc: string;
}

// ====== Queue Messages ======

export type NotificationMessage =
  | {
      type: "alert";
      alert: Alert;
    }
  | {
      type: "bet_result";
      user_id: number;
      telegram_id: number;
      market_question: string;
      option_label: string;
      is_win: boolean;
      payout: number;
    }
  | {
      type: "market_opened";
      market: Market;
      options: MarketOption[];
    }
  | {
      type: "markets_batch_opened";
      markets: Array<{ market: Market; options: MarketOption[] }>;
    };
