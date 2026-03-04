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
  maybeCreateAlertTypeMarket,
  maybeCreateIntensityMarket,
  maybeCreateWarDurationMarket,
} from "../services/market.js";
import { ALERT_TYPE_OPTIONS } from "@kazam/shared/constants";
import type { Env } from "../index.js";
import type { OrefAlertRaw, NotificationMessage, Market } from "@kazam/shared/types";

interface AlertPollerState {
  recentHashes: Map<string, number>; // hash -> timestamp
  alertsThisHour: number;
  hourStart: number;
  sensitivityMode: boolean;
  lastMarketCheck: number;
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
      lastMarketCheck: 0,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/start") {
      // Schedule the first alarm
      await this.state.storage.setAlarm(Date.now() + ALERT_POLL_INTERVAL_MS);
      return new Response(JSON.stringify({ ok: true, message: "Poller started" }));
    }
    if (url.pathname === "/stop") {
      await this.state.storage.deleteAlarm();
      return new Response(JSON.stringify({ ok: true, message: "Poller stopped" }));
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
    console.log("[POLLER] alarm fired");
    try {
      await this.pollAlerts();
    } catch (err) {
      console.error("[POLLER] alarm error:", err);
    }

    // Periodically check if markets need to be created (every 5 minutes)
    const now = Date.now();
    if (!this.pollerState.lastMarketCheck || now - this.pollerState.lastMarketCheck > 300_000) {
      this.pollerState.lastMarketCheck = now;
      try {
        const db = createDb(this.env.DB);
        const newMarkets: Array<{ market: Market; options: Awaited<ReturnType<typeof getMarketOptions>> }> = [];
        for (const fn of [maybeCreateWhereMarket, maybeCreateWhenMarket, maybeCreateAlertTypeMarket]) {
          const m = await fn(db);
          if (m) newMarkets.push({ market: m, options: await getMarketOptions(db, m.id) });
        }
        await maybeCreateHowManyMarket(db);
        await maybeCreateIntensityMarket(db);
        await maybeCreateWarDurationMarket(db);
        if (newMarkets.length > 0) {
          console.log(`[POLLER] Created ${newMarkets.length} new markets`);
          await this.env.NOTIFICATION_QUEUE.send({
            type: "markets_batch_opened",
            markets: newMarkets,
          } satisfies NotificationMessage);
        }
      } catch (err) {
        console.error("Market creation check error:", err);
      }
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

    // Poll Tzofar API directly (not geo-blocked, works from any colo)
    // Fallback to KV cache if Tzofar fails
    let rawAlerts: OrefAlertRaw[];
    try {
      let text: string | null = null;

      // Primary: Tzofar API (real-time, ~2s latency)
      try {
        const res = await fetch("https://api.tzevaadom.co.il/notifications", {
          headers: { Accept: "application/json" },
          cf: { cacheTtl: 0 },
        });
        if (res.ok) {
          const alerts = await res.json() as Array<{ notificationId: string; time: number; threat: number; isDrill: boolean; cities: string[] }>;
          if (Array.isArray(alerts) && alerts.length > 0) {
            const real = alerts.filter((a) => !a.isDrill && a.cities?.length > 0);
            if (real.length > 0) {
              const threatMap: Record<number, string> = { 0: "1", 1: "6", 2: "earthquake", 6: "terroristInfiltration" };
              // Group by threat type + 5-minute time bucket
              // A barrage hitting 50 villages becomes ONE alert event
              const BUCKET_SEC = 300; // 5 minutes
              const grouped = new Map<string, { cat: string; bucket: number; cities: string[] }>();
              for (const a of real) {
                const cat = threatMap[a.threat] ?? "other";
                const tSec = a.time > 1e12 ? Math.floor(a.time / 1000) : a.time;
                const bucket = Math.floor(tSec / BUCKET_SEC);
                const key = `${cat}:${bucket}`;
                const g = grouped.get(key);
                if (g) {
                  for (const c of a.cities) {
                    if (!g.cities.includes(c)) g.cities.push(c);
                  }
                } else {
                  grouped.set(key, { cat, bucket, cities: [...a.cities] });
                }
              }
              const orefFormat = [...grouped.values()].map((g) => ({
                id: `${g.cat}_${g.bucket}`,
                cat: g.cat,
                title: "",
                data: g.cities,
                desc: "",
              }));
              text = JSON.stringify(orefFormat);
              // Also update KV cache for consistency
              await this.env.ALERTS_CACHE.put("latest_alert", text, { expirationTtl: 300 });
            }
          }
        }
      } catch (err) {
        console.error("[POLLER] Tzofar fetch error, falling back to KV:", err);
      }

      // Fallback: KV cache (populated by proxy cron)
      if (!text) {
        text = await this.env.ALERTS_CACHE.get("latest_alert");
      }

      if (!text || text.trim() === "" || text.trim() === "[]" || text.trim() === "null") {
        return; // No active alerts
      }

      const cleaned = text.replace(/^\uFEFF/, "").trim();
      const parsed = JSON.parse(cleaned);
      rawAlerts = Array.isArray(parsed) ? parsed : [parsed];
      rawAlerts = rawAlerts.filter((a) => a && a.data);
      if (rawAlerts.length === 0) return;
      console.log(`[POLLER] Got ${rawAlerts.length} alert(s), cat=${rawAlerts[0]?.cat}, cities=${rawAlerts[0]?.data?.length}`);
    } catch (err) {
      console.error("[POLLER] parse error:", err);
      return;
    }

    const db = createDb(this.env.DB);

    for (const raw of rawAlerts) {
      // Compute dedup hash
      const cities = Array.isArray(raw.data) ? raw.data : [];
      // Grouped alerts use stable bucket ID (e.g. "1_5698563"), legacy use cities
      const hashInput = raw.id?.includes("_")
        ? `group:${raw.id}`
        : `${raw.cat}:${[...cities].sort().join(",")}`;
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(hashInput),
      );
      const hash = [...new Uint8Array(hashBuffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Skip if seen recently
      if (this.pollerState.recentHashes.has(hash)) {
        console.log(`[POLLER] Skipping (recent hash): ${hash.slice(0, 8)}`);
        continue;
      }
      this.pollerState.recentHashes.set(hash, now);

      // Skip if already in DB
      const existing = await getAlertByHash(db, hash);
      if (existing) {
        console.log(`[POLLER] Skipping (already in DB): ${hash.slice(0, 8)}`);
        continue;
      }

      console.log(`[POLLER] NEW ALERT: cat=${raw.cat}, cities=${cities.join(",")}`);

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

      // Resolve ALERT_TYPE market
      const alertTypeMarket = await getOpenMarketByType(db, "alert_type");
      if (alertTypeMarket) {
        const options = await getMarketOptions(db, alertTypeMarket.id);
        // Match alert cat to option
        const matchIdx = ALERT_TYPE_OPTIONS.findIndex((o) => o.cat === raw.cat);
        // If no exact match, use "Other" (last option)
        const winOpt = matchIdx >= 0 ? options[matchIdx] : options[options.length - 1];
        if (winOpt) {
          const result = await settleMarket(db, alertTypeMarket.id, winOpt.id, alert.id);
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

      // Create new markets after settlement
      const newMarkets: Array<{ market: Market; options: Awaited<ReturnType<typeof getMarketOptions>> }> = [];
      const newWhere = await maybeCreateWhereMarket(db);
      if (newWhere) newMarkets.push({ market: newWhere, options: await getMarketOptions(db, newWhere.id) });
      const newWhen = await maybeCreateWhenMarket(db);
      if (newWhen) newMarkets.push({ market: newWhen, options: await getMarketOptions(db, newWhen.id) });
      const newAlertType = await maybeCreateAlertTypeMarket(db);
      if (newAlertType) newMarkets.push({ market: newAlertType, options: await getMarketOptions(db, newAlertType.id) });
      await maybeCreateHowManyMarket(db);
      await maybeCreateIntensityMarket(db);
      await maybeCreateWarDurationMarket(db);

      // Send one combined notification for all new markets
      if (newMarkets.length > 0) {
        console.log(`[POLLER] Created ${newMarkets.length} new markets`);
        await this.env.NOTIFICATION_QUEUE.send({
          type: "markets_batch_opened",
          markets: newMarkets,
        } satisfies NotificationMessage);
      }
    }
  }
}
