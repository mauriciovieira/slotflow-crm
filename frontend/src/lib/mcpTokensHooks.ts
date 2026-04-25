import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

export interface McpToken {
  id: string;
  name: string;
  last_four: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface McpTokenIssued extends McpToken {
  /**
   * Plaintext token value. Returned **only** on issue and never again.
   * Intentionally not cached in React Query — the issue form holds it
   * in component state, shows it once, and lets the user copy it.
   */
  plaintext: string;
}

export interface McpTokenIssuePayload {
  name: string;
  ttl_days?: number;
}

export const MCP_TOKENS_KEY = ["mcp-tokens", "list"] as const;

export function useMcpTokens() {
  return useQuery({
    queryKey: MCP_TOKENS_KEY,
    queryFn: () => apiFetch<McpToken[]>("/api/mcp/tokens/"),
  });
}

export function useIssueMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: McpTokenIssuePayload) =>
      apiFetch<McpTokenIssued>("/api/mcp/tokens/", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MCP_TOKENS_KEY }),
  });
}

export function useRevokeMcpToken(tokenId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>(`/api/mcp/tokens/${tokenId}/`, { method: "DELETE" }),
    onSuccess: () => {
      // Optimistically stamp `revoked_at` on the cached row so the UI
      // flips to the dimmed / no-revoke-button state immediately. Without
      // this, the row briefly stays "active" until the GET refetch lands
      // and a second revoke click would race the refetch.
      qc.setQueryData<McpToken[]>(MCP_TOKENS_KEY, (prev) => {
        if (!prev) return prev;
        const now = new Date().toISOString();
        return prev.map((row) =>
          row.id === tokenId && row.revoked_at === null
            ? { ...row, revoked_at: now }
            : row,
        );
      });
      qc.invalidateQueries({ queryKey: MCP_TOKENS_KEY });
    },
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
