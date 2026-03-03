import { createDb } from "@kazam/db";
import {
  insertAlert,
  getAlertByHash,
  getOpenMarketByType,
  getMarketOptions,
  upsertDailyCount,
} from "@kazam/db/queries";
import { citiesToRegions, primaryRegion, type Region } from "@kazam/shared/regions";
import {
  ALERT_POLL_INTERVAL_MS,
  ALERT_DEDUP_WINDOW_MS,
  SENSITIVITY_THRESHOLD_PER_HOUR,
  IST_TIMEZONE,
} from "@kazam/shared/constants";
import { settleMarket } from "../services/settlement.js";
import {
  maybeCreateWhereMarket,
  maybeCreateWhenMarket,
  maybeCreateHowManyMarket,
} from "../services/market.js";
import type { Env } from "../index.js";
import type { OrefAlertRaw, NotificationMessage } from "@kazam/shared/types";

interface AlertPollerState {
  recentHashes: Map<string, number>; // hash -> timestamp
  alertsThisHour: number;
  hourStart: number;
  sensitivityMode: boolean;
}

export class AlertPoller implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private pollerState: AlertPollerState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.pollerState = {
      recentHashes: new Map(),
      alertsThisHour: 0,
      hourStart: Date.now(),
      sensitivityMode: false,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/start") {
      // Schedule the first alarm
      await this.state.storage.setAlarm(Date.now() + ALERT_POLL_INTERVAL_MS);
      return new Response(JSON.stringify({ ok: true, message: "Poller started" }));
    }
    if (url.pathname === "/status") {
      return new Response(
        JSON.stringify({
          sensitivityMode: this.pollerState.sensitivityMode,
          alertsThisHour: this.pollerState.alertsThisHour,
          recentHashCount: this.pollerState.recentHashes.size,
        }),
      );
    }
    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    try {
      await this.pollAlerts();
    } catch (err) {
      console.error("Alert poller error:", err);
    }

    // Schedule next poll
    await this.state.storage.setAlarm(Date.now() + ALERT_POLL_INTERVAL_MS);
  }

  private async pollAlerts(): Promise<void> {
    // Clean expired hashes from dedup window
    const now = Date.now();
    for (const [hash, ts] of this.pollerState.recentHashes) {
      if (now - ts > ALERT_DEDUP_WINDOW_MS) {
        this.pollerState.recentHashes.delete(hash);
      }
    }

    // Reset hourly counter
    if (now - this.pollerState.hourStart > 3600000) {
      this.pollerState.alertsThisHour = 0;
      this.pollerState.hourStart = now;
      this.pollerState.sensitivityMode = false;
    }

    // Fetch alerts from proxy
    let rawAlerts: OrefAlertRaw[];
    try {
      const response = await fetch(this.env.ALERT_PROXY_URL, {
        headers: { "Accept": "application/json" },
        cf: { cacheTtl: 0 },
      });
      if (!response.ok) {
        console.error(`Alert proxy returned ${response.status}`);
        return;
      }
      const text = await response.text();
      if (!text || text.trim() === "") return;
      rawAlerts = JSON.parse(text);
      if (!Array.isArray(rawAlerts)) return;
    } catch {
      // API may return empty when no alerts
      return;
    }

    const db = createDb(this.env.DB);

    for (const raw of rawAlerts) {
      // Compute dedup hash
      const cities = Array.isArray(raw.data) ? raw.data : [];
      const sortedCities = [...cities].sort();
      const hashInput = `${raw.cat}:${sortedCities.join(",")}`;
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(hashInput),
      );
      const hash = [...new Uint8Array(hashBuffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Skip if seen recently
      if (this.pollerState.recentHashes.has(hash)) continue;
      this.pollerState.recentHashes.set(hash, now);

      // Skip if already in DB
      const existing = await getAlertByHash(db, hash);
      if (existing) continue;

      // Process new alert
      const regions = citiesToRegions(cities);
      const alert = await insertAlert(db, {
        external_id: raw.id || String(now),
        type: raw.cat || "unknown",
        cities,
        regions,
        instructions: raw.desc || null,
        dedupe_hash: hash,
      });

      if (!alert) continue;

      // Update daily count
      const today = new Date().toLocaleDateString("en-CA", {
        timeZone: IST_TIMEZONE,
      });
      const regionCounts: Record<string, number> = {};
      for (const r of regions) {
        regionCounts[r] = (regionCounts[r] ?? 0) + 1;
      }
      const isMissile = raw.cat === "1"; // cat 1 = missiles
      await upsertDailyCount(db, today, {
        missile_count: isMissile ? 1 : 0,
        total_count: 1,
        regions: regionCounts,
      });

      // Sensitivity mode check
      this.pollerState.alertsThisHour++;
      if (
        this.pollerState.alertsThisHour >= SENSITIVITY_THRESHOLD_PER_HOUR ||
        raw.cat === "terroristInfiltration"
      ) {
        this.pollerState.sensitivityMode = true;
      }

      // Skip market actions in sensitivity mode
      if (this.pollerState.sensitivityMode) continue;

      // Resolve WHERE market
      const whereMarket = await getOpenMarketByType(db, "where");
      if (whereMarket) {
        const primary = primaryRegion(cities);
        if (primary) {
          const options = await getMarketOptions(db, whereMarket.id);
          const winningOption = options.find(
            (o) => o.label_en.toLowerCase() === primary.replace("_", " "),
          );
          if (winningOption) {
            const result = await settleMarket(
              db,
              whereMarket.id,
              winningOption.id,
              alert.id,
            );
            if (!("error" in result)) {
              // Enqueue notifications
              for (const n of result.notifications) {
                await this.env.NOTIFICATION_QUEUE.send(n);
              }
            }
          }
        }
      }

      // Resolve WHEN market
      const whenMarket = await getOpenMarketByType(db, "when");
      if (whenMarket) {
        const elapsed = now - new Date(whenMarket.opens_at).getTime();
        const options = await getMarketOptions(db, whenMarket.id);

        // Find the matching time bucket
        const buckets = [
          { max: 3600000, idx: 0 },
          { max: 10800000, idx: 1 },
          { max: 21600000, idx: 2 },
          { max: 43200000, idx: 3 },
          { max: 86400000, idx: 4 },
          { max: Infinity, idx: 5 },
        ];
        const matchIdx = buckets.find((b) => elapsed < b.max)?.idx ?? 5;
        const winOpt = options[matchIdx];

        if (winOpt) {
          const result = await settleMarket(
            db,
            whenMarket.id,
            winOpt.id,
            alert.id,
          );
          if (!("error" in result)) {
            for (const n of result.notifications) {
              await this.env.NOTIFICATION_QUEUE.send(n);
            }
          }
        }
      }

      // Enqueue alert notification
      await this.env.NOTIFICATION_QUEUE.send({
        type: "alert",
        alert: {
          id: alert.id,
          external_id: alert.external_id,
          type: alert.type,
          cities: alert.cities as string[],
          regions: alert.regions as Region[],
          instructions: alert.instructions,
          dedupe_hash: alert.dedupe_hash,
          received_at: alert.received_at,
        },
      } satisfies NotificationMessage);

      // Create new markets after settlement and notify
      const newWhere = await maybeCreateWhereMarket(db);
      if (newWhere) {
        const { getMarketOptions: getOpts } = await import("@kazam/db/queries");
        const opts = await getOpts(db, newWhere.id);
        await this.env.NOTIFICATION_QUEUE.send({
          type: "market_opened",
          market: newWhere,
          options: opts,
        } satisfies NotificationMessage);
      }
      const newWhen = await maybeCreateWhenMarket(db);
      if (newWhen) {
        const { getMarketOptions: getOpts } = await import("@kazam/db/queries");
        const opts = await getOpts(db, newWhen.id);
        await this.env.NOTIFICATION_QUEUE.send({
          type: "market_opened",
          market: newWhen,
          options: opts,
        } satisfies NotificationMessage);
      }
      await maybeCreateHowManyMarket(db);
    }
  }
}
