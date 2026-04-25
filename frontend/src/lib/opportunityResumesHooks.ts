import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

export type OpportunityResumeRole = "submitted" | "used_internally";

export const OPPORTUNITY_RESUME_ROLES: readonly OpportunityResumeRole[] = [
  "submitted",
  "used_internally",
] as const;

export const OPPORTUNITY_RESUME_ROLE_LABEL: Record<OpportunityResumeRole, string> = {
  submitted: "Submitted",
  used_internally: "Used internally",
};

export interface ResumeVersionSummary {
  id: string;
  version_number: number;
  base_resume_id: string;
  base_resume_name: string;
}

export interface OpportunityResume {
  id: string;
  opportunity: string;
  resume_version: string;
  resume_version_summary: ResumeVersionSummary;
  role: OpportunityResumeRole;
  note: string;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityResumeCreatePayload {
  opportunity: string;
  resume_version: string;
  role: OpportunityResumeRole;
  note?: string;
}

export const opportunityResumesKey = (opportunityId: string) =>
  ["opportunity-resumes", "list", opportunityId] as const;

export function useOpportunityResumes(opportunityId: string | undefined) {
  return useQuery({
    queryKey: opportunityResumesKey(opportunityId ?? ""),
    queryFn: () =>
      apiFetch<OpportunityResume[]>(
        `/api/opportunity-resumes/?opportunity=${opportunityId}`,
      ),
    enabled: typeof opportunityId === "string" && opportunityId.length > 0,
  });
}

export function useLinkResumeToOpportunity(opportunityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: OpportunityResumeCreatePayload) =>
      apiFetch<OpportunityResume>("/api/opportunity-resumes/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: opportunityResumesKey(opportunityId) }),
  });
}

export function useUnlinkOpportunityResume(opportunityId: string, linkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>(`/api/opportunity-resumes/${linkId}/`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: opportunityResumesKey(opportunityId) }),
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
