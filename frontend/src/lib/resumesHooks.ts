import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

export interface ResumeVersion {
  id: string;
  base_resume: string;
  version_number: number;
  document: unknown;
  document_hash: string;
  notes: string;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
}

export interface BaseResume {
  id: string;
  workspace: string;
  name: string;
  created_by: { id: number; username: string } | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  latest_version: ResumeVersion | null;
}

export interface ResumeCreatePayload {
  name: string;
}

export interface ResumeVersionCreatePayload {
  document: unknown;
  notes?: string;
}

export const RESUMES_KEY = ["resumes", "list"] as const;
export const resumeKey = (id: string) => ["resumes", "detail", id] as const;
export const resumeVersionsKey = (baseId: string) =>
  ["resumes", "versions", baseId] as const;

export function useResumes() {
  return useQuery({
    queryKey: RESUMES_KEY,
    queryFn: () => apiFetch<BaseResume[]>("/api/resumes/"),
  });
}

export function useResume(id: string | undefined) {
  return useQuery({
    queryKey: resumeKey(id ?? ""),
    queryFn: () => apiFetch<BaseResume>(`/api/resumes/${id}/`),
    enabled: typeof id === "string" && id.length > 0,
  });
}

export function useResumeVersions(baseId: string | undefined) {
  return useQuery({
    queryKey: resumeVersionsKey(baseId ?? ""),
    queryFn: () => apiFetch<ResumeVersion[]>(`/api/resumes/${baseId}/versions/`),
    enabled: typeof baseId === "string" && baseId.length > 0,
  });
}

export function useCreateResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ResumeCreatePayload) =>
      apiFetch<BaseResume>("/api/resumes/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: RESUMES_KEY }),
  });
}

export function useArchiveResume(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>(`/api/resumes/${id}/`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: resumeKey(id) });
      qc.removeQueries({ queryKey: resumeVersionsKey(id) });
      return qc.invalidateQueries({ queryKey: RESUMES_KEY });
    },
  });
}

export function useCreateResumeVersion(baseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ResumeVersionCreatePayload) =>
      apiFetch<ResumeVersion>(`/api/resumes/${baseId}/versions/`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: resumeVersionsKey(baseId) });
      return qc.invalidateQueries({ queryKey: resumeKey(baseId) });
    },
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
