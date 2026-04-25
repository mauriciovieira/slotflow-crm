import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";
import { cycleKey, stepsKey } from "./interviewsHooks";

export interface ResumeVersionSummary {
  id: string;
  version_number: number;
  base_resume_id: string;
  base_resume_name: string;
}

export interface InterviewStepResume {
  id: string;
  step: string;
  resume_version: string;
  resume_version_summary: ResumeVersionSummary;
  note: string;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewStepResumeCreatePayload {
  step: string;
  resume_version: string;
  note?: string;
}

// Single shared cache key per cycle. The FE fetches all step links for a
// cycle once and buckets them client-side, avoiding an N+1 network pattern
// where each step row would issue its own /api/interview-step-resumes/?step=
// request.
export const cycleStepResumesKey = (cycleId: string) =>
  ["interview-step-resumes", "by-cycle", cycleId] as const;

export function useCycleStepResumes(cycleId: string | undefined) {
  return useQuery({
    queryKey: cycleStepResumesKey(cycleId ?? ""),
    queryFn: () =>
      apiFetch<InterviewStepResume[]>(
        `/api/interview-step-resumes/?cycle=${cycleId}`,
      ),
    enabled: typeof cycleId === "string" && cycleId.length > 0,
  });
}

/**
 * Returns the step-resumes for a given step out of the per-cycle cache,
 * along with the cycle query's loading / error state. This keeps the
 * InterviewStepResumesSection API ergonomic (a single hook call per step)
 * while still issuing exactly one network request per cycle.
 */
export function useInterviewStepResumes(
  stepId: string | undefined,
  cycleId: string | undefined,
) {
  const cycleQuery = useCycleStepResumes(cycleId);
  const data = useMemo(() => {
    if (!cycleQuery.data || !stepId) return undefined;
    return cycleQuery.data.filter((row) => row.step === stepId);
  }, [cycleQuery.data, stepId]);
  return {
    data,
    isLoading: cycleQuery.isLoading,
    error: cycleQuery.error,
    refetch: cycleQuery.refetch,
  };
}

export function useLinkResumeToStep(stepId: string, cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InterviewStepResumeCreatePayload) =>
      apiFetch<InterviewStepResume>("/api/interview-step-resumes/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      // Mutations bust the per-cycle cache (the single shared bucket) plus
      // the cycle / steps caches that may surface link counts later.
      qc.invalidateQueries({ queryKey: cycleStepResumesKey(cycleId) });
      qc.invalidateQueries({ queryKey: stepsKey(cycleId) });
      return qc.invalidateQueries({ queryKey: cycleKey(cycleId) });
    },
  });
}

export function useUnlinkStepResume(stepId: string, cycleId: string, linkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>(`/api/interview-step-resumes/${linkId}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cycleStepResumesKey(cycleId) });
      qc.invalidateQueries({ queryKey: stepsKey(cycleId) });
      return qc.invalidateQueries({ queryKey: cycleKey(cycleId) });
    },
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
