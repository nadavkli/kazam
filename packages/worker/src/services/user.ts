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
import { eq, sql } from "drizzle-orm";
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

export async function claimDailyBonus(
  db: Database,
  user: User,
): Promise<DailyClaimResponse | { error: string }> {
  const today = getIsraelDate();
  const lastClaim = user.last_daily_claim_at
    ? user.last_daily_claim_at.split("T")[0]
    : null;

  if (lastClaim === today) {
    return { error: "Already claimed today's bonus" };
  }

  // Check streak
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("en-CA", {
    timeZone: IST_TIMEZONE,
  });

  let newStreak: number;
  if (lastClaim === yesterdayStr) {
    newStreak = user.current_streak + 1;
  } else {
    newStreak = 1;
  }

  const streakBonus = Math.min(newStreak * STREAK_BONUS, MAX_STREAK_BONUS);
  const totalBonus = DAILY_BONUS + streakBonus;

  // Update user
  const longestStreak = Math.max(user.longest_streak, newStreak);
  await db
    .update(users)
    .set({
      coins: sql`${users.coins} + ${totalBonus}`,
      total_earned: sql`${users.total_earned} + ${totalBonus}`,
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_daily_claim_at: new Date().toISOString(),
    })
    .where(eq(users.id, user.id))
    .run();

  return {
    coins_awarded: totalBonus,
    streak: newStreak,
    new_balance: user.coins + totalBonus,
  };
}
