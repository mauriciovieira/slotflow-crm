import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

export type InterviewStepKind =
  | "screening"
  | "phone"
  | "technical"
  | "system_design"
  | "behavioral"
  | "panel"
  | "offer"
  | "other";

export const STEP_KINDS: readonly InterviewStepKind[] = [
  "screening",
  "phone",
  "technical",
  "system_design",
  "behavioral",
  "panel",
  "offer",
  "other",
] as const;

export const STEP_KIND_LABEL: Record<InterviewStepKind, string> = {
  screening: "Screening",
  phone: "Phone screen",
  technical: "Technical",
  system_design: "System design",
  behavioral: "Behavioral",
  panel: "Panel",
  offer: "Offer",
  other: "Other",
};

export type InterviewStepStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export const STEP_STATUSES: readonly InterviewStepStatus[] = [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
] as const;

export const STEP_STATUS_LABEL: Record<InterviewStepStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export interface InterviewStep {
  id: string;
  cycle: string;
  sequence: number;
  kind: InterviewStepKind;
  status: InterviewStepStatus;
  scheduled_for: string | null;
  duration_minutes: number | null;
  interviewer: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface InterviewCycle {
  id: string;
  opportunity: string;
  // Read-only summary fields the API embeds so list rows can render the
  // parent opportunity without a second query. Backed by a select_related
  // on the viewset queryset.
  opportunity_title: string | null;
  opportunity_company: string | null;
  name: string;
  started_at: string | null;
  closed_at: string | null;
  notes: string;
  steps_count: number;
  last_step_status: InterviewStepStatus | null;
  created_at: string;
  updated_at: string;
}

export interface InterviewCycleCreatePayload {
  opportunity: string;
  name: string;
  notes?: string;
}

export interface InterviewStepCreatePayload {
  kind: InterviewStepKind;
  scheduled_for?: string | null;
  duration_minutes?: number | null;
  interviewer?: string;
  notes?: string;
}

export interface InterviewStepStatusPayload {
  status: InterviewStepStatus;
  notes?: string;
}

export const CYCLES_KEY = ["interview-cycles", "list"] as const;
export const cycleKey = (id: string) => ["interview-cycles", "detail", id] as const;
export const stepsKey = (cycleId: string) =>
  ["interview-cycles", "steps", cycleId] as const;

export function useInterviewCycles() {
  return useQuery({
    queryKey: CYCLES_KEY,
    queryFn: () => apiFetch<InterviewCycle[]>("/api/interview-cycles/"),
  });
}

export function useInterviewCycle(id: string | undefined) {
  return useQuery({
    queryKey: cycleKey(id ?? ""),
    queryFn: () => apiFetch<InterviewCycle>(`/api/interview-cycles/${id}/`),
    enabled: typeof id === "string" && id.length > 0,
  });
}

export function useInterviewSteps(cycleId: string | undefined) {
  return useQuery({
    queryKey: stepsKey(cycleId ?? ""),
    queryFn: () => apiFetch<InterviewStep[]>(`/api/interview-cycles/${cycleId}/steps/`),
    enabled: typeof cycleId === "string" && cycleId.length > 0,
  });
}

export function useStartInterviewCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InterviewCycleCreatePayload) =>
      apiFetch<InterviewCycle>("/api/interview-cycles/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CYCLES_KEY }),
  });
}

export function useAddInterviewStep(cycleId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InterviewStepCreatePayload) =>
      apiFetch<InterviewStep>(`/api/interview-cycles/${cycleId}/steps/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stepsKey(cycleId) });
      qc.invalidateQueries({ queryKey: cycleKey(cycleId) });
      // The list embeds steps_count + last_step_status, so a new step
      // anywhere must invalidate the list cache too.
      return qc.invalidateQueries({ queryKey: CYCLES_KEY });
    },
  });
}

export function useUpdateStepStatus(cycleId: string, stepId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InterviewStepStatusPayload) =>
      apiFetch<InterviewStep>(
        `/api/interview-cycles/${cycleId}/steps/${stepId}/status/`,
        { method: "PATCH", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: stepsKey(cycleId) });
      qc.invalidateQueries({ queryKey: cycleKey(cycleId) });
      return qc.invalidateQueries({ queryKey: CYCLES_KEY });
    },
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
