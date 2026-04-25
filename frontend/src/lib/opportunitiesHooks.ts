import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export type OpportunityStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

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

export const OPPORTUNITIES_KEY = ["opportunities", "list"] as const;

export function useOpportunities() {
  return useQuery({
    queryKey: OPPORTUNITIES_KEY,
    queryFn: () => apiFetch<Opportunity[]>("/api/opportunities/"),
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
