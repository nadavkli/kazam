import { Context, type Api, type RawApi } from "grammy";
import type { Database } from "@kazam/db";

export interface BotContext extends Context {
  db: Database;
  env: {
    TELEGRAM_BOT_TOKEN: string;
    MINI_APP_URL: string;
    NOTIFICATION_QUEUE: Queue;
    DB: D1Database;
  };
}
