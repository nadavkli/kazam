import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  MarketWithOptions,
  UserProfile,
  LeaderboardEntry,
  Alert,
  PlaceBetResponse,
  DailyClaimResponse,
} from "@kazam/shared/types";

// === Markets ===

export function useMarkets(status?: string, type?: string) {
  return useQuery({
    queryKey: ["markets", status, type],
    queryFn: () => api.getMarkets({ status, type, limit: 20 }),
    refetchInterval: 10_000,
  });
}

export function useMarket(id: number) {
  return useQuery({
    queryKey: ["market", id],
    queryFn: () => api.getMarket(id),
    refetchInterval: 5_000,
  });
}

export function usePlaceBet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      marketId,
      optionId,
      amount,
    }: {
      marketId: number;
      optionId: number;
      amount: number;
    }) => api.placeBet(marketId, optionId, amount),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["market", vars.marketId] });
      queryClient.invalidateQueries({ queryKey: ["markets"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
}

// === User ===

export function useUser() {
  return useQuery({
    queryKey: ["user"],
    queryFn: () => api.getMe(),
    refetchInterval: 30_000,
  });
}

export function useClaimDaily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.claimDaily(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
}

// === Leaderboard ===

export function useLeaderboard(period = "weekly") {
  return useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => api.getLeaderboard({ period, limit: 50 }),
    refetchInterval: 30_000,
  });
}

// === Alerts ===

export function useAlerts(date?: string) {
  return useQuery({
    queryKey: ["alerts", date],
    queryFn: () => api.getAlerts({ limit: 50, date }),
  });
}

export function useLatestAlert() {
  return useQuery({
    queryKey: ["latestAlert"],
    queryFn: () => api.getLatestAlert(),
    refetchInterval: 5_000,
  });
}

// === Activity Feed ===

export function useActivity(limit = 20) {
  return useQuery({
    queryKey: ["activity", limit],
    queryFn: () => api.getActivity(limit),
    refetchInterval: 5_000,
  });
}
