import type { Alert } from "@kazam/shared/types";
import { REGION_LABELS, type Region } from "@kazam/shared/regions";

export function formatAlertMessage(alert: Alert): string {
  const regionNames = alert.regions
    .map((r) => REGION_LABELS[r as Region]?.he ?? r)
    .join(", ");

  const cityList = alert.cities.slice(0, 8).join(", ");
  const moreCount = Math.max(0, alert.cities.length - 8);
  const cityStr = moreCount > 0 ? `${cityList} +${moreCount} נוספים` : cityList;

  return (
    `🚨 *אזעקה חדשה!*\n\n` +
    `📍 אזור: *${regionNames}*\n` +
    `🏙️ ערים: ${cityStr}\n\n` +
    `מי ניחש נכון? 🎯`
  );
}
