import type { Database } from "@kazam/db";
import {
  createUser,
  getUserByTelegramId,
  getUserByReferralCode,
  updateUserCoins,
  createReferral,
  markReferralPaid,
} from "@kazam/db/queries";
import {
  DAILY_BONUS,
  STREAK_BONUS,
  MAX_STREAK_BONUS,
  STARTING_COINS,
  REFERRAL_BONUS,
  IST_TIMEZONE,
} from "@kazam/shared/constants";
import { users } from "@kazam/shared/schema";
import { eq, sql, and, not, like } from "drizzle-orm";
import type { User, DailyClaimResponse } from "@kazam/shared/types";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getIsraelDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
}

export async function registerUser(
  db: Database,
  telegramUser: { id: number; username?: string; first_name: string },
  referralCode?: string,
): Promise<User> {
  // Check if already exists
  const existing = await getUserByTelegramId(db, telegramUser.id);
  if (existing) return existing;

  // Handle referral
  let referredBy: number | undefined;
  let referrer: User | undefined;
  if (referralCode) {
    const found = await getUserByReferralCode(db, referralCode);
    // Prevent self-referral
    if (found && found.telegram_id !== telegramUser.id) {
      referrer = found;
      referredBy = found.id;
    }
  }

  const user = await createUser(db, {
    telegram_id: telegramUser.id,
    username: telegramUser.username ?? null,
    first_name: telegramUser.first_name,
    referral_code: generateReferralCode(),
    referred_by: referredBy,
  });

  // Pay referral bonuses
  if (referredBy && user) {
    const referral = await createReferral(db, referredBy, user.id);
    if (referral) {
      await updateUserCoins(db, referredBy, REFERRAL_BONUS, "earned");
      const updatedUser = await updateUserCoins(db, user.id, REFERRAL_BONUS, "earned");
      await markReferralPaid(db, referral.id);
      // Return updated user with correct coin balance
      if (updatedUser) return updatedUser;
    }
  }

  return user;
}

/**
 * Extract the IST date (YYYY-MM-DD) from a last_daily_claim_at value.
 * Handles both formats:
 * - Old: "2026-03-11T22:30:00.000Z" (UTC ISO) → convert to IST date
 * - New: "2026-03-12|2026-03-11T22:30:00.000Z" (IST-date|UTC-ISO) → extract IST date prefix
 */
function claimToIsraelDate(claimStr: string): string {
  if (claimStr.includes("|")) {
    // New format: IST date is the prefix before the pipe
    return claimStr.split("|")[0];
  }
  // Old format: convert UTC ISO to IST date
  return new Date(claimStr).toLocaleDateString("en-CA", { timeZone: IST_TIMEZONE });
}

/**
 * Claim daily login bonus.
 * Uses dedicated daily_streak field (separate from prediction current_streak).
 * Atomic: uses conditional UPDATE to prevent double-claiming via race conditions.
 *
 * TIMEZONE NOTE: last_daily_claim_at is stored as UTC ISO string, but all
 * comparisons use IST dates. We convert stored timestamps to IST before comparing.
 * The atomic WHERE clause stores and checks the IST date prefix (YYYY-MM-DD)
 * to ensure correctness across timezone boundaries.
 */
export async function claimDailyBonus(
  db: Database,
  user: User,
): Promise<DailyClaimResponse | { error: string }> {
  const today = getIsraelDate();
  // Convert stored claim timestamp to IST date for correct comparison
  const lastClaim = user.last_daily_claim_at
    ? claimToIsraelDate(user.last_daily_claim_at)
    : null;

  // Quick check (non-atomic, just to avoid unnecessary DB writes)
  if (lastClaim === today) {
    return { error: "Already claimed today's bonus" };
  }

  // Check daily login streak (uses daily_streak, NOT current_streak)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("en-CA", {
    timeZone: IST_TIMEZONE,
  });

  let newStreak: number;
  if (lastClaim === yesterdayStr) {
    newStreak = user.daily_streak + 1;
  } else {
    newStreak = 1;
  }

  const streakBonus = Math.min(newStreak * STREAK_BONUS, MAX_STREAK_BONUS);
  const totalBonus = DAILY_BONUS + streakBonus;

  // Store the IST date as prefix so the LIKE check in WHERE clause is timezone-correct.
  // Format: "YYYY-MM-DD|YYYY-MM-DDTHH:MM:SS.SSSZ" — IST date prefix + full UTC timestamp.
  // The LIKE check uses the IST date prefix; the UTC timestamp is preserved for auditing.
  const nowISO = new Date().toISOString();
  const claimValue = `${today}|${nowISO}`;
  const result = await db
    .update(users)
    .set({
      coins: sql`${users.coins} + ${totalBonus}`,
      total_earned: sql`${users.total_earned} + ${totalBonus}`,
      daily_streak: newStreak,
      last_daily_claim_at: claimValue,
    })
    .where(
      and(
        eq(users.id, user.id),
        // Only claim if not already claimed today (IST)
        // last_daily_claim_at is either NULL or doesn't start with today's IST date
        // Works with both old format (UTC ISO) and new format (IST-date|UTC-ISO)
        sql`(${users.last_daily_claim_at} IS NULL OR ${users.last_daily_claim_at} NOT LIKE ${today + "%"})`,
      ),
    )
    .run();

  // Check if any row was actually updated
  if (!result.meta?.changes || result.meta.changes === 0) {
    return { error: "Already claimed today's bonus" };
  }

  return {
    coins_awarded: totalBonus,
    streak: newStreak,
    new_balance: user.coins + totalBonus,
  };
}