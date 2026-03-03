import type { Market, MarketOption } from "@kazam/shared/types";

export function formatNewMarketMessage(
  market: Market,
  options: MarketOption[],
): string {
  const emojiMap: Record<string, string> = {
    where: "📍", when: "⏰", how_many: "🔢",
    war_duration: "⚔️", alert_type: "🎯", intensity: "📊",
  };
  const emoji = emojiMap[market.type] ?? "🎲";

  const optionList = options
    .map((o) => `  • ${o.label}`)
    .join("\n");

  return (
    `🎯 *הימור חדש נפתח!*\n\n` +
    `${emoji} ${market.question}\n\n` +
    `אפשרויות:\n${optionList}\n\n` +
    `השתמש ב /bet כדי להמר!`
  );
}
