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
    queryFn: () =>
      apiFetch<FxRate[]>(`/api/fx-rates/?workspace=${workspaceId}`),
    // Don't fire an unscoped fetch while the active workspace is still
    // loading or absent — the screen displays a "pick a workspace"
    // message in that branch instead, and an unscoped query would leak
    // rates from other workspaces.
    enabled: typeof workspaceId === "string" && workspaceId.length > 0,
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
