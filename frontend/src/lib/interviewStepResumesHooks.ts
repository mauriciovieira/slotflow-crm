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

export const stepResumesKey = (stepId: string) =>
  ["interview-step-resumes", "list", stepId] as const;

export function useInterviewStepResumes(stepId: string | undefined) {
  return useQuery({
    queryKey: stepResumesKey(stepId ?? ""),
    queryFn: () =>
      apiFetch<InterviewStepResume[]>(
        `/api/interview-step-resumes/?step=${stepId}`,
      ),
    enabled: typeof stepId === "string" && stepId.length > 0,
  });
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
      qc.invalidateQueries({ queryKey: stepResumesKey(stepId) });
      // Steps list / cycle detail may grow link-count surfaces later; bust
      // them now so the UI stays consistent regardless.
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
      qc.invalidateQueries({ queryKey: stepResumesKey(stepId) });
      qc.invalidateQueries({ queryKey: stepsKey(cycleId) });
      return qc.invalidateQueries({ queryKey: cycleKey(cycleId) });
    },
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
