/**
 * Alert proxy that forwards real Pikud HaOref alerts.
 * Cloudflare Workers edge in TLV can reach oref.org.il directly.
 * Falls back to empty response on error.
 */
const OREF_URL = "https://www.oref.org.il/WarningMessages/alert/alerts.json";

export default {
  async fetch(request: Request): Promise<Response> {
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

    // GET /alerts — proxy real Pikud HaOref API
    if (url.pathname === "/alerts") {
      try {
        const response = await fetch(OREF_URL, {
          headers: {
            "Referer": "https://www.oref.org.il/",
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json",
          },
          cf: { cacheTtl: 0 },
        });

        if (!response.ok) {
          // API returns non-200 or is geo-blocked
          return new Response("", {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const text = await response.text();
        // oref.org.il returns empty string when no alerts, or BOM + JSON
        const cleaned = text.replace(/^\uFEFF/, "").trim();

        return new Response(cleaned || "", {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (err) {
        console.error("Failed to fetch from oref.org.il:", err);
        return new Response("", {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // Health
    if (url.pathname === "/health") {
      // Also check if we can reach oref.org.il
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

      return new Response(
        JSON.stringify({
          status: "ok",
          mode: "live",
          oref_reachable: orefReachable,
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    return new Response("Kazam Alert Proxy (live mode)", { status: 200 });
  },
};
