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
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface OpportunityCreatePayload {
  title: string;
  company: string;
  notes?: string;
}

export interface OpportunityUpdatePayload {
  title?: string;
  company?: string;
  stage?: OpportunityStage;
  notes?: string;
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
      return qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY });
    },
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

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
