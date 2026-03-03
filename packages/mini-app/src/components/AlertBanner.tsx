import { useLatestAlert } from "../api/hooks";

export function AlertBanner() {
  const { data } = useLatestAlert();
  const alert = data?.alert as {
    regions: string[];
    cities: string[];
    received_at: string;
  } | null;

  if (!alert) return null;

  // Only show if alert was in last 5 minutes
  const alertTime = new Date(alert.received_at).getTime();
  const isRecent = Date.now() - alertTime < 5 * 60 * 1000;
  if (!isRecent) return null;

  const timeAgo = Math.floor((Date.now() - alertTime) / 60000);
  const timeStr = timeAgo < 1 ? "עכשיו" : `לפני ${timeAgo} דק'`;

  return (
    <div className="alert-pulse mx-4 mt-2 rounded-xl border border-accent-red/30 bg-accent-red/10 p-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🚨</span>
        <div className="flex-1">
          <div className="text-sm font-bold text-accent-red">
            אזעקה {timeStr}
          </div>
          <div className="text-xs text-text-secondary">
            {(alert.cities as string[]).slice(0, 3).join(", ")}
            {alert.cities.length > 3 && ` +${alert.cities.length - 3}`}
          </div>
        </div>
      </div>
    </div>
  );
}
