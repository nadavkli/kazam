/**
 * Alert proxy that forwards real Pikud HaOref alerts.
 * Primary source: Tzofar API (api.tzevaadom.co.il) — works globally, no geo-blocking.
 * Fallback: OREF direct API (geo-blocked outside Israel).
 * Cron trigger every minute caches alerts to KV for the DO to read.
 */
const TZOFAR_URL = "https://api.tzevaadom.co.il/notifications";
const OREF_URL = "https://www.oref.org.il/WarningMessages/alert/alerts.json";
const KV_KEY = "latest_alert";
const KV_TTL = 300; // seconds

interface Env {
  ALERTS_CACHE: KVNamespace;
}

interface TzofarAlert {
  notificationId: string;
  time: number;
  threat: number;
  isDrill: boolean;
  cities: string[];
}

interface OrefAlert {
  id: string;
  cat: string;
  title: string;
  data: string[];
  desc: string;
}

/** Map Tzofar threat codes to OREF cat codes */
const THREAT_TO_CAT: Record<number, { cat: string; title: string }> = {
  0: { cat: "1", title: "ירי רקטות וטילים" },
  1: { cat: "6", title: "חדירת כלי טיס עוין" },
  2: { cat: "earthquake", title: "רעידת אדמה" },
  3: { cat: "tsunami", title: "צונאמי" },
  4: { cat: "radiological", title: "אירוע רדיולוגי" },
  5: { cat: "other", title: "לוחמה לא קונבנציונלית" },
  6: { cat: "terroristInfiltration", title: "חדירת מחבלים" },
  7: { cat: "1", title: "טיל לא קונבנציונלי" },
};

/** Fetch alerts from Tzofar API (no geo-blocking) */
async function fetchTzofar(): Promise<string> {
  try {
    const response = await fetch(TZOFAR_URL, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 0 },
    });

    if (!response.ok) return "";

    const alerts: TzofarAlert[] = await response.json();
    if (!Array.isArray(alerts) || alerts.length === 0) return "";

    // Filter out drills
    const realAlerts = alerts.filter((a) => !a.isDrill && a.cities?.length > 0);
    if (realAlerts.length === 0) return "";

    // Convert to OREF format for compatibility with existing DO code
    const orefFormat: OrefAlert[] = realAlerts.map((a) => {
      const mapping = THREAT_TO_CAT[a.threat] ?? { cat: "other", title: "התרעה" };
      return {
        id: a.notificationId,
        cat: mapping.cat,
        title: mapping.title,
        data: a.cities,
        desc: "היכנסו למרחב המוגן",
      };
    });

    return JSON.stringify(orefFormat);
  } catch (err) {
    console.error("[TZOFAR] Fetch error:", err);
    return "";
  }
}

/** Fetch alerts from OREF directly (geo-blocked outside Israel) */
async function fetchOref(): Promise<string> {
  try {
    const response = await fetch(OREF_URL, {
      headers: {
        Referer: "https://www.oref.org.il/",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json",
      },
      cf: { cacheTtl: 0 },
    });

    if (!response.ok) return "";

    const text = await response.text();
    return text.replace(/^\uFEFF/, "").trim();
  } catch {
    return "";
  }
}

/** Fetch from Tzofar first, fallback to OREF */
async function fetchAlerts(): Promise<string> {
  // Primary: Tzofar (works globally)
  const tzofar = await fetchTzofar();
  if (tzofar) return tzofar;

  // Fallback: OREF direct (only works from Israeli IPs)
  return fetchOref();
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
      const body = (await request.json()) as { cities?: string[]; cat?: string };
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

    // GET /alerts — fetch from Tzofar/OREF with KV cache fallback
    if (url.pathname === "/alerts") {
      try {
        const data = await fetchAlerts();

        if (data) {
          await env.ALERTS_CACHE.put(KV_KEY, data, { expirationTtl: KV_TTL });
          return new Response(data, {
            headers: { "Content-Type": "application/json", "X-Source": "live", ...corsHeaders },
          });
        }

        const cached = await env.ALERTS_CACHE.get(KV_KEY);
        if (cached) {
          return new Response(cached, {
            headers: { "Content-Type": "application/json", "X-Source": "cache", ...corsHeaders },
          });
        }

        return new Response("", {
          headers: { "Content-Type": "application/json", "X-Source": "empty", ...corsHeaders },
        });
      } catch (err) {
        console.error("Failed to fetch alerts:", err);
        const cached = await env.ALERTS_CACHE.get(KV_KEY);
        return new Response(cached || "", {
          headers: {
            "Content-Type": "application/json",
            "X-Source": cached ? "cache" : "error",
            ...corsHeaders,
          },
        });
      }
    }

    // Health
    if (url.pathname === "/health") {
      const cached = await env.ALERTS_CACHE.get(KV_KEY);
      return new Response(
        JSON.stringify({
          status: "ok",
          sources: ["tzofar", "oref"],
          cache_has_data: !!cached,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response("Kazam Alert Proxy (live mode)", { status: 200 });
  },

  // Cron trigger: fetch from Tzofar/OREF and cache to KV every minute
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      const data = await fetchAlerts();
      if (data) {
        await env.ALERTS_CACHE.put(KV_KEY, data, { expirationTtl: KV_TTL });
        console.log(`[CRON] Cached ${data.length} chars (source: tzofar/oref)`);
      } else {
        console.log("[CRON] No active alerts");
      }
    } catch (err) {
      console.error("[CRON] Failed:", err);
    }
  },
};
