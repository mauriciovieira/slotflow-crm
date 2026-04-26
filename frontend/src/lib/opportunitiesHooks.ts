import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

export type OpportunityStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export const STAGES: readonly OpportunityStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;

export const STAGE_LABEL: Record<OpportunityStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export interface Opportunity {
  id: string;
  workspace: string;
  title: string;
  company: string;
  stage: OpportunityStage;
  notes: string;
  // Optional comp fields powering Insights / FX. `null` for the
  // amount and "" for the currency mean "not tracked"; the snapshot
  // service skips rows missing either.
  expected_total_compensation: string | null;
  compensation_currency: string;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface OpportunityCreatePayload {
  title: string;
  company: string;
  notes?: string;
  expected_total_compensation?: string | null;
  compensation_currency?: string;
}

export interface OpportunityUpdatePayload {
  title?: string;
  company?: string;
  stage?: OpportunityStage;
  notes?: string;
  expected_total_compensation?: string | null;
  compensation_currency?: string;
}

export const OPPORTUNITIES_KEY = ["opportunities", "list"] as const;
export const opportunityKey = (id: string) => ["opportunities", "detail", id] as const;

export function useOpportunities() {
  return useQuery({
    queryKey: OPPORTUNITIES_KEY,
    queryFn: () => apiFetch<Opportunity[]>("/api/opportunities/"),
  });
}

export function useOpportunity(id: string | undefined) {
  return useQuery({
    queryKey: opportunityKey(id ?? ""),
    queryFn: () => apiFetch<Opportunity>(`/api/opportunities/${id}/`),
    enabled: typeof id === "string" && id.length > 0,
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OpportunityCreatePayload) =>
      apiFetch<Opportunity>("/api/opportunities/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY }),
  });
}

export function useUpdateOpportunity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OpportunityUpdatePayload) =>
      apiFetch<Opportunity>(`/api/opportunities/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.setQueryData(opportunityKey(id), data);
      // Bust the stage-history cache after every update so a stage
      // change is reflected on the detail screen without a manual reload.
      // No-op stage updates still bust it; cheap, and beats threading the
      // before/after stage through the mutation.
      qc.invalidateQueries({ queryKey: stageHistoryKey(id) });
      return qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY });
    },
  });
}

/**
 * Imperative variant of `useUpdateOpportunity` for callers that don't
 * have a fixed opportunity id at hook-creation time — e.g. the kanban
 * board, where the dragged row is whatever the user grabs. Same cache
 * semantics as `useUpdateOpportunity.onSuccess` so kanban moves and
 * detail-screen edits stay consistent (per-row cache write +
 * stage-history invalidation + list invalidation). On error we
 * invalidate the list so any optimistic write the caller did is
 * reconciled back to the server's truth.
 */
export function useMoveOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: OpportunityUpdatePayload;
    }) =>
      apiFetch<Opportunity>(`/api/opportunities/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: async (data, { id }) => {
      qc.setQueryData(opportunityKey(id), data);
      // Await both invalidations so a caller using `mutateAsync` (the
      // kanban does today, follow-on flows might) doesn't observe a
      // resolved promise before the caches have actually been
      // invalidated. Matches `useUpdateOpportunity`'s contract.
      await Promise.all([
        qc.invalidateQueries({ queryKey: stageHistoryKey(id) }),
        qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY }),
      ]);
    },
    onError: () => qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY }),
  });
}

export function useArchiveOpportunity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>(`/api/opportunities/${id}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: opportunityKey(id) });
      return qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY });
    },
  });
}

export interface OpportunityStageTransition {
  id: string;
  opportunity: string;
  from_stage: string;
  to_stage: string;
  actor_repr: string;
  created_at: string;
}

export const stageHistoryKey = (id: string) =>
  ["opportunities", "stage-history", id] as const;

export function useStageHistory(id: string) {
  return useQuery({
    queryKey: stageHistoryKey(id),
    queryFn: () =>
      apiFetch<OpportunityStageTransition[]>(
        `/api/opportunities/${id}/stage-history/`,
      ),
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
