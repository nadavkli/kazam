import { z } from "zod";
import { MIN_BET, MAX_BET } from "./constants.js";

export const PlaceBetSchema = z.object({
  market_id: z.number().int().positive(),
  option_id: z.number().int().positive(),
  amount: z
    .number()
    .int()
    .min(MIN_BET, `Minimum bet is ${MIN_BET} coins`)
    .max(MAX_BET, `Maximum bet is ${MAX_BET} coins`),
});

export const DailyClaimSchema = z.object({});

export const LeaderboardQuerySchema = z.object({
  period: z.enum(["weekly", "monthly", "all_time", "friends"]).default("weekly"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const MarketListQuerySchema = z.object({
  status: z
    .enum(["open", "locked", "settling", "resolved", "cancelled"])
    .optional(),
  type: z.enum(["where", "when", "how_many"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AlertListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const ReferralSchema = z.object({
  code: z.string().min(6).max(20),
});
