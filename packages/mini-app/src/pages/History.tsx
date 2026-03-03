import { useState } from "react";
import { useAlerts } from "../api/hooks";
import { REGION_LABELS, type Region } from "@kazam/shared/regions";

export function History() {
  const [dateFilter, setDateFilter] = useState<string | undefined>();
  const { data, isLoading } = useAlerts(dateFilter);

  const alerts = (data?.alerts ?? []) as Array<{
    id: number;
    type: string;
    cities: string[];
    regions: string[];
    received_at: string;
  }>;

  return (
    <div className="flex-1 px-4 pt-4">
      <h1 className="mb-4 text-xl font-black">📋 היסטוריית אזעקות</h1>

      {/* Date filter */}
      <div className="mb-4">
        <input
          type="date"
          value={dateFilter ?? ""}
          onChange={(e) =>
            setDateFilter(e.target.value || undefined)
          }
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
        />
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mb-2 text-3xl">🕊️</div>
          <div className="text-sm text-text-secondary">
            {dateFilter ? "אין אזעקות בתאריך זה" : "אין אזעקות"}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const time = new Date(alert.received_at);
            const timeStr = time.toLocaleTimeString("he-IL", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const dateStr = time.toLocaleDateString("he-IL", {
              day: "numeric",
              month: "short",
            });
            const regionNames = alert.regions
              .map((r) => REGION_LABELS[r as Region]?.he ?? r)
              .join(", ");
            const cityList = alert.cities.slice(0, 4).join(", ");
            const moreCount = Math.max(0, alert.cities.length - 4);

            return (
              <div
                key={alert.id}
                className="rounded-xl bg-white/5 p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs text-text-muted">
                    {dateStr} {timeStr}
                  </span>
                  <span className="text-xs font-bold text-accent-red">
                    🚨 {regionNames}
                  </span>
                </div>
                <div className="text-xs text-text-secondary">
                  {cityList}
                  {moreCount > 0 && ` +${moreCount} נוספים`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
