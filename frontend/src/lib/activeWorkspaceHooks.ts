import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { OPPORTUNITIES_KEY } from "./opportunitiesHooks";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
}

export interface ActiveWorkspacePayload {
  active: WorkspaceSummary | null;
  available: WorkspaceSummary[];
}

export const ACTIVE_WORKSPACE_KEY = ["auth", "active-workspace"] as const;

export function useActiveWorkspace() {
  return useQuery({
    queryKey: ACTIVE_WORKSPACE_KEY,
    queryFn: () => apiFetch<ActiveWorkspacePayload>("/api/auth/active-workspace/"),
  });
}

export function useSetActiveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) =>
      apiFetch<ActiveWorkspacePayload>("/api/auth/active-workspace/", {
        method: "POST",
        body: JSON.stringify({ workspace: workspaceId }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(ACTIVE_WORKSPACE_KEY, data);
      // Visible opportunities depend on the active workspace.
      qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY });
    },
  });
}

export function useClearActiveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>("/api/auth/active-workspace/", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_WORKSPACE_KEY });
      qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY });
    },
  });
}
