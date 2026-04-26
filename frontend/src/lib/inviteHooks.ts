import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface InvitePreflight {
  email: string;
  expires_at: string;
  providers: ("google" | "github")[];
  terms_version: { id: number; version: string; body_markdown: string } | null;
}

export interface AcceptPasswordPayload {
  password: string;
  workspace_name: string;
  terms_version_id: number;
}

export interface OauthStartPayload {
  provider: "google" | "github";
  workspace_name: string;
  terms_version_id: number;
}

export function useInvitePreflight(token: string) {
  return useQuery<InvitePreflight>({
    queryKey: ["invite", token],
    queryFn: () => apiFetch<InvitePreflight>(`/api/invites/${token}/`),
    retry: false,
  });
}

export function useAcceptPassword(token: string) {
  return useMutation<{ next: string }, Error, AcceptPasswordPayload>({
    mutationFn: (body) =>
      apiFetch<{ next: string }>(`/api/invites/${token}/accept-password/`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useOauthStart(token: string) {
  return useMutation<{ redirect_url: string }, Error, OauthStartPayload>({
    mutationFn: (body) =>
      apiFetch<{ redirect_url: string }>(`/api/invites/${token}/oauth-start/`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}
