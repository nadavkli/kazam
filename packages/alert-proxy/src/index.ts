/**
 * Alert proxy that forwards real Pikud HaOref alerts.
 * Uses KV cache so alerts are available globally even when OREF is geo-blocked.
 * - On successful OREF fetch (from Israeli colo): returns data + writes to KV
 * - On empty/blocked OREF fetch (from non-Israeli colo): returns KV cached data
 * - Cron trigger (every minute) with Smart Placement keeps cache warm
 */
const OREF_URL = "https://www.oref.org.il/WarningMessages/alert/alerts.json";
const KV_KEY = "latest_alert";
const KV_TTL = 300; // seconds — long enough for global KV propagation + DO polling

interface Env {
  ALERTS_CACHE: KVNamespace;
}

async function fetchOref(): Promise<string> {
  const response = await fetch(OREF_URL, {
    headers: {
      "Referer": "https://www.oref.org.il/",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json",
    },
    cf: { cacheTtl: 0 },
  });

  if (!response.ok) return "";

  const text = await response.text();
  return text.replace(/^\uFEFF/, "").trim();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Manual trigger for testing: POST /trigger
    if (request.method === "POST" && url.pathname === "/trigger") {
      const body = await request.json() as { cities?: string[]; cat?: string };
      const cities = body.cities ?? ["תל אביב - יפו", "רמת גן"];
      const alert = [
        {
          id: String(Date.now()),
          cat: body.cat ?? "1",
          title: "ירי רקטות וטילים",
          data: cities,
          desc: "היכנסו למרחב המוגן ושהו בו 10 דקות",
        },
      ];
      return new Response(JSON.stringify(alert), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // GET /alerts — proxy real Pikud HaOref API with KV cache fallback
    if (url.pathname === "/alerts") {
      try {
        const data = await fetchOref();

        if (data) {
          // Got live data from OREF — cache it in KV and return
          await env.ALERTS_CACHE.put(KV_KEY, data, { expirationTtl: KV_TTL });
          return new Response(data, {
            headers: { "Content-Type": "application/json", "X-Source": "live", ...corsHeaders },
          });
        }

        // OREF returned empty (geo-blocked or no active alerts)
        // Check KV cache for recent alert data
        const cached = await env.ALERTS_CACHE.get(KV_KEY);
        if (cached) {
          return new Response(cached, {
            headers: { "Content-Type": "application/json", "X-Source": "cache", ...corsHeaders },
          });
        }

        // No live data and no cache — genuinely no alerts
        return new Response("", {
          headers: { "Content-Type": "application/json", "X-Source": "empty", ...corsHeaders },
        });
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
        // Try cache on error
        const cached = await env.ALERTS_CACHE.get(KV_KEY);
        return new Response(cached || "", {
          headers: { "Content-Type": "application/json", "X-Source": cached ? "cache" : "error", ...corsHeaders },
        });
      }
    }

    // Health
    if (url.pathname === "/health") {
      let orefReachable = false;
      try {
        const check = await fetch(OREF_URL, {
          headers: {
            "Referer": "https://www.oref.org.il/",
            "X-Requested-With": "XMLHttpRequest",
          },
          cf: { cacheTtl: 0 },
        });
        orefReachable = check.ok || check.status === 200;
      } catch {
        orefReachable = false;
      }

      const cached = await env.ALERTS_CACHE.get(KV_KEY);

      return new Response(
        JSON.stringify({
          status: "ok",
          mode: "live",
          oref_reachable: orefReachable,
          cache_has_data: !!cached,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response("Kazam Alert Proxy (live mode)", { status: 200 });
  },

  // Cron trigger: fetch OREF and cache to KV every minute
  // With Smart Placement enabled, this runs near oref.org.il (Israel)
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      const data = await fetchOref();
      if (data) {
        await env.ALERTS_CACHE.put(KV_KEY, data, { expirationTtl: KV_TTL });
        console.log(`[CRON] Cached ${data.length} chars from OREF`);
      } else {
        // Empty could mean no alerts OR geo-blocked — let TTL expire naturally
        // Do NOT delete the key since we can't distinguish the two cases
        console.log("[CRON] No data from OREF (empty or geo-blocked)");
      }
    } catch (err) {
      console.error("[CRON] Failed to fetch OREF:", err);
    }
  },
};
