import { createMiddleware } from "hono/factory";
import type { Env } from "../index.js";

/**
 * Validate Telegram Mini App initData using HMAC-SHA256.
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export const telegramAuth = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const initData = c.req.header("X-Telegram-Init-Data");
    if (!initData) {
      return c.json({ error: "Missing initData" }, 401);
    }

    const isValid = await validateInitData(initData, c.env.TELEGRAM_BOT_TOKEN);
    if (!isValid) {
      return c.json({ error: "Invalid initData" }, 401);
    }

    // Parse user data from initData
    const params = new URLSearchParams(initData);
    const userStr = params.get("user");
    if (!userStr) {
      return c.json({ error: "Missing user in initData" }, 401);
    }

    const user = JSON.parse(decodeURIComponent(userStr));
    c.set("telegramUser" as never, user);

    await next();
  },
);

async function validateInitData(
  initData: string,
  botToken: string,
): Promise<boolean> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;

  params.delete("hash");

  // Sort parameters alphabetically
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  // HMAC-SHA256 with "WebAppData" as key
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretHash = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    encoder.encode(botToken),
  );

  const dataKey = await crypto.subtle.importKey(
    "raw",
    secretHash,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    dataKey,
    encoder.encode(dataCheckString),
  );

  const signatureHex = [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signatureHex === hash;
}

/**
 * Extract telegram user from validated context.
 */
export function getTelegramUser(c: { get: (key: string) => unknown }): {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code?: string;
} {
  return c.get("telegramUser" as never) as ReturnType<typeof getTelegramUser>;
}
