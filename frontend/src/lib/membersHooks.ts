import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface MemberRow {
  id: string;
  user_id: string;
  username: string;
  email: string;
  role: "owner" | "member" | "viewer";
  created_at: string;
}

export interface InvitationRow {
  id: string;
  email: string;
  role: "owner" | "member" | "viewer";
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  is_active: boolean;
  /** Only present on the response from `POST /invitations/` (issue moment). */
  token?: string;
}

export const membersKey = (workspaceId: string) =>
  ["workspace-members", workspaceId] as const;

export const invitationsKey = (workspaceId: string) =>
  ["workspace-invitations", workspaceId] as const;

export function useMembers(workspaceId: string | null) {
  return useQuery({
    queryKey: workspaceId ? membersKey(workspaceId) : ["workspace-members", "_"],
    queryFn: () =>
      apiFetch<MemberRow[]>(`/api/workspaces/${workspaceId}/members/`),
    enabled: !!workspaceId,
  });
}

export function useInvitations(workspaceId: string | null) {
  return useQuery({
    queryKey: workspaceId
      ? invitationsKey(workspaceId)
      : ["workspace-invitations", "_"],
    queryFn: () =>
      apiFetch<InvitationRow[]>(`/api/workspaces/${workspaceId}/invitations/`),
    enabled: !!workspaceId,
  });
}

export function useChangeMemberRole(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      role,
    }: {
      membershipId: string;
      role: MemberRow["role"];
    }) =>
      apiFetch<MemberRow>(
        `/api/workspaces/${workspaceId}/members/${membershipId}/`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: membersKey(workspaceId) }),
      ]),
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) =>
      apiFetch<null>(
        `/api/workspaces/${workspaceId}/members/${membershipId}/`,
        { method: "DELETE" },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: membersKey(workspaceId) }),
  });
}

export function useTransferOwnership(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      toMembershipId,
      demoteSelf,
    }: {
      toMembershipId: string;
      demoteSelf: boolean;
    }) =>
      apiFetch<{ ok: boolean }>(
        `/api/workspaces/${workspaceId}/transfer-ownership/`,
        {
          method: "POST",
          body: JSON.stringify({
            to_membership_id: toMembershipId,
            demote_self: demoteSelf,
          }),
        },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: membersKey(workspaceId) }),
  });
}

export function useInviteMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      role,
    }: {
      email: string;
      role: InvitationRow["role"];
    }) =>
      apiFetch<InvitationRow>(`/api/workspaces/${workspaceId}/invitations/`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: invitationsKey(workspaceId) }),
  });
}

export function useRevokeInvitation(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<null>(
        `/api/workspaces/${workspaceId}/invitations/${invitationId}/`,
        { method: "DELETE" },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: invitationsKey(workspaceId) }),
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<{
        membership_id: string;
        workspace_id: string;
        role: MemberRow["role"];
      }>(`/api/invitations/${token}/accept/`, { method: "POST" }),
  });
}
