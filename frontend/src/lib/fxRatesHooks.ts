import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

export type FxRateSource = "manual" | "task" | "seed";

export interface FxRate {
  id: string;
  workspace: string;
  currency: string;
  base_currency: string;
  rate: string;
  date: string;
  source: FxRateSource;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
}

export interface FxRateUpsertPayload {
  workspace: string;
  currency: string;
  base_currency: string;
  rate: string;
  date: string;
}

export const fxRatesKey = (workspaceId: string) =>
  ["fx-rates", "list", workspaceId] as const;

export function useFxRates(workspaceId: string | undefined) {
  return useQuery({
    queryKey: fxRatesKey(workspaceId ?? ""),
    queryFn: () => {
      const path = workspaceId
        ? `/api/fx-rates/?workspace=${workspaceId}`
        : "/api/fx-rates/";
      return apiFetch<FxRate[]>(path);
    },
  });
}

export function useUpsertFxRate(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: FxRateUpsertPayload) =>
      apiFetch<FxRate>("/api/fx-rates/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: fxRatesKey(workspaceId) }),
  });
}

export function useDeleteFxRate(workspaceId: string, rateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>(`/api/fx-rates/${rateId}/`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: fxRatesKey(workspaceId) }),
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
