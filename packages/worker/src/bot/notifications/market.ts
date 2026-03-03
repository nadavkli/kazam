import type { Market, MarketOption } from "@kazam/shared/types";

export function formatNewMarketMessage(
  market: Market,
  options: MarketOption[],
): string {
  const emoji =
    market.type === "where" ? "📍" : market.type === "when" ? "⏰" : "🔢";

  const optionList = options
    .map((o) => `  • ${o.label}`)
    .join("\n");

  return (
    `🎯 *שוק חדש נפתח!*\n\n` +
    `${emoji} ${market.question}\n\n` +
    `אפשרויות:\n${optionList}\n\n` +
    `השתמש ב /bet כדי להמר!`
  );
}
