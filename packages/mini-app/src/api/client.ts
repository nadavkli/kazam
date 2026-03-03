import { getInitData } from "../lib/telegram";

const API_BASE = import.meta.env.VITE_API_URL ?? "https://kazam-worker.ekhbdr.workers.dev";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const initData = getInitData();
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((error as { error: string }).error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Markets
  getMarkets: (params?: { status?: string; type?: string; limit?: number }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.type) search.set("type", params.type);
    if (params?.limit) search.set("limit", String(params.limit));
    const qs = search.toString();
    return request<{ markets: unknown[] }>(`/markets${qs ? `?${qs}` : ""}`);
  },

  getMarket: (id: number) =>
    request<{ market: unknown; user_bets: unknown[] }>(`/markets/${id}`),

  placeBet: (marketId: number, optionId: number, amount: number) =>
    request<unknown>(`/markets/${marketId}/bet`, {
      method: "POST",
      body: JSON.stringify({ market_id: marketId, option_id: optionId, amount }),
    }),

  // User
  getMe: () => request<{ user: unknown }>("/user/me"),

  claimDaily: () => request<unknown>("/user/daily", { method: "POST" }),

  // Leaderboard
  getLeaderboard: (params?: { period?: string; limit?: number; offset?: number }) => {
    const search = new URLSearchParams();
    if (params?.period) search.set("period", params.period);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    const qs = search.toString();
    return request<{ leaderboard: unknown[] }>(`/leaderboard${qs ? `?${qs}` : ""}`);
  },

  // Alerts
  getAlerts: (params?: { limit?: number; offset?: number; date?: string }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    if (params?.date) search.set("date", params.date);
    const qs = search.toString();
    return request<{ alerts: unknown[] }>(`/alerts${qs ? `?${qs}` : ""}`);
  },

  getLatestAlert: () => request<{ alert: unknown | null }>("/alerts/latest"),
};
