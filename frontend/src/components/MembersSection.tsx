import { type FormEvent, useState } from "react";
import { useMe } from "../lib/authHooks";
import {
  type InvitationRow,
  type MemberRow,
  useChangeMemberRole,
  useInviteMember,
  useInvitations,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
} from "../lib/membersHooks";
import { TestIds } from "../testIds";

const ROLES: MemberRow["role"][] = ["owner", "member", "viewer"];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildAcceptUrl(token: string): string {
  if (typeof window === "undefined") return `/join-workspace/${token}`;
  return `${window.location.origin}/join-workspace/${token}`;
}

interface MembersSectionProps {
  workspaceId: string;
}

export function MembersSection({ workspaceId }: MembersSectionProps) {
  const me = useMe();
  const membersQuery = useMembers(workspaceId);
  const myUsername = me.data?.username ?? null;
  const members = membersQuery.data ?? [];
  const myMembership = members.find((row) => row.username === myUsername) ?? null;
  const isOwner = myMembership?.role === "owner";

  // Owner-only endpoints (`/invitations/...`) return 403 for
  // members/viewers. Gate the queries on `isOwner` so the FE doesn't
  // generate a guaranteed-failing request on every Settings load for
  // non-owners.
  const ownerWorkspaceId = isOwner ? workspaceId : null;
  const invitationsQuery = useInvitations(ownerWorkspaceId);
  const changeRole = useChangeMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const transferOwnership = useTransferOwnership(workspaceId);
  const inviteMember = useInviteMember(workspaceId);
  const revokeInvitation = useRevokeInvitation(workspaceId);

  const [transferOpen, setTransferOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [lastIssuedToken, setLastIssuedToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // Single banner string covers leave / remove / role-change / transfer
  // failures so a 409 from the last-owner guard surfaces somewhere
  // instead of silently dropping. Cleared whenever the user starts a
  // new mutation; auto-clears once a follow-up succeeds.
  const [actionError, setActionError] = useState<string | null>(null);

  function describeError(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message;
    return fallback;
  }

  return (
    <section
      data-testid={TestIds.SETTINGS_MEMBERS_SECTION}
      className="rounded-md border border-border-subtle bg-surface p-4"
    >
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">Members</h2>
        {isOwner && members.length > 1 && (
          <button
            type="button"
            onClick={() => setTransferOpen(true)}
            data-testid={TestIds.SETTINGS_MEMBERS_TRANSFER_TOGGLE}
            className="text-xs rounded-md border border-border-subtle px-2 py-1 text-ink hover:bg-surface-card"
          >
            Transfer ownership
          </button>
        )}
      </header>

      {actionError && (
        <p
          role="alert"
          data-testid={TestIds.SETTINGS_MEMBERS_ACTION_ERROR}
          className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </p>
      )}

      {membersQuery.isLoading ? (
        <p
          data-testid={TestIds.SETTINGS_MEMBERS_LOADING}
          className="text-sm text-ink-secondary"
        >
          Loading members…
        </p>
      ) : membersQuery.error ? (
        <p
          data-testid={TestIds.SETTINGS_MEMBERS_ERROR}
          className="text-sm text-danger"
        >
          Could not load members.
        </p>
      ) : (
        <table
          data-testid={TestIds.SETTINGS_MEMBERS_TABLE}
          className="w-full text-sm"
        >
          <thead className="text-left text-ink-secondary">
            <tr>
              <th className="font-medium pb-2">User</th>
              <th className="font-medium pb-2">Email</th>
              <th className="font-medium pb-2">Role</th>
              <th className="font-medium pb-2 w-px" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {members.map((row) => {
              const isSelf = row.username === myUsername;
              return (
                <tr
                  key={row.id}
                  data-testid={`${TestIds.SETTINGS_MEMBERS_ROW}-${row.id}`}
                >
                  <td className="py-2 text-ink">{row.username}</td>
                  <td className="py-2 text-ink-secondary">{row.email}</td>
                  <td className="py-2">
                    {isOwner && !isSelf ? (
                      <select
                        value={row.role}
                        onChange={(e) => {
                          setActionError(null);
                          changeRole.mutate(
                            {
                              membershipId: row.id,
                              role: e.target.value as MemberRow["role"],
                            },
                            {
                              onSuccess: () => setActionError(null),
                              onError: (err) =>
                                setActionError(
                                  describeError(err, "Could not change role."),
                                ),
                            },
                          );
                        }}
                        disabled={changeRole.isPending}
                        data-testid={`${TestIds.SETTINGS_MEMBERS_ROLE_SELECT}-${row.id}`}
                        className="text-xs rounded-md border border-border-subtle bg-surface px-1.5 py-1 text-ink"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-ink">{row.role}</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {isSelf ? (
                      <button
                        type="button"
                        onClick={() => setLeaveOpen(true)}
                        data-testid={TestIds.SETTINGS_MEMBERS_LEAVE}
                        className="text-xs text-danger hover:underline"
                      >
                        Leave
                      </button>
                    ) : (
                      isOwner && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            removeMember.mutate(row.id, {
                              onSuccess: () => setActionError(null),
                              onError: (err) =>
                                setActionError(
                                  describeError(err, "Could not remove member."),
                                ),
                            });
                          }}
                          disabled={removeMember.isPending}
                          data-testid={`${TestIds.SETTINGS_MEMBERS_REMOVE}-${row.id}`}
                          className="text-xs text-danger hover:underline disabled:opacity-60"
                        >
                          Remove
                        </button>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {leaveOpen && myMembership && (
        <div className="mt-3 rounded-md border border-border-subtle bg-surface-card p-3 text-sm text-ink">
          <p className="mb-2">Leave this workspace?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                removeMember.mutate(myMembership.id, {
                  onSuccess: () => {
                    setActionError(null);
                    setLeaveOpen(false);
                  },
                  onError: (err) =>
                    setActionError(
                      describeError(
                        err,
                        "Could not leave this workspace.",
                      ),
                    ),
                });
              }}
              data-testid={TestIds.SETTINGS_MEMBERS_LEAVE_CONFIRM}
              className="rounded-md bg-danger px-2 py-1 text-xs font-medium text-white"
            >
              Leave
            </button>
            <button
              type="button"
              onClick={() => setLeaveOpen(false)}
              data-testid={TestIds.SETTINGS_MEMBERS_LEAVE_CANCEL}
              className="rounded-md border border-border-subtle px-2 py-1 text-xs text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {transferOpen && myMembership && isOwner && (
        <TransferOwnershipDialog
          members={members}
          myMembershipId={myMembership.id}
          onClose={() => setTransferOpen(false)}
          onSubmit={(payload) => {
            setActionError(null);
            transferOwnership.mutate(payload, {
              onSuccess: () => {
                setActionError(null);
                setTransferOpen(false);
              },
              onError: (err) =>
                setActionError(
                  describeError(err, "Could not transfer ownership."),
                ),
            });
          }}
          isPending={transferOwnership.isPending}
        />
      )}

      {isOwner && (
        <>
          <InviteMemberForm
            onSubmit={(email, role) => {
              setInviteError(null);
              inviteMember.mutate(
                { email, role },
                {
                  onSuccess: (inv) => setLastIssuedToken(inv.token ?? null),
                  onError: (err) =>
                    setInviteError(
                      err instanceof Error ? err.message : "Could not invite",
                    ),
                },
              );
            }}
            isPending={inviteMember.isPending}
            error={inviteError}
          />

          {lastIssuedToken && (
            <p
              data-testid={TestIds.SETTINGS_MEMBERS_PENDING_LINK}
              className="mt-2 text-xs text-ink-secondary break-all"
            >
              Share this link to accept: {buildAcceptUrl(lastIssuedToken)}
            </p>
          )}

          <PendingInvitationsTable
            rows={invitationsQuery.data ?? []}
            onRevoke={(id) => revokeInvitation.mutate(id)}
            isPending={revokeInvitation.isPending}
          />
        </>
      )}
    </section>
  );
}

function InviteMemberForm({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (email: string, role: MemberRow["role"]) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRow["role"]>("member");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    onSubmit(email.trim(), role);
    setEmail("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={TestIds.SETTINGS_MEMBERS_INVITE_FORM}
      className="mt-4 flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col text-xs text-ink-secondary">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          data-testid={TestIds.SETTINGS_MEMBERS_INVITE_EMAIL}
          className="mt-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-sm text-ink"
        />
      </label>
      <label className="flex flex-col text-xs text-ink-secondary">
        Role
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRow["role"])}
          data-testid={TestIds.SETTINGS_MEMBERS_INVITE_ROLE}
          className="mt-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-sm text-ink"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={isPending || !email.trim()}
        data-testid={TestIds.SETTINGS_MEMBERS_INVITE_SUBMIT}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
      >
        Invite
      </button>
      {error && (
        <span
          data-testid={TestIds.SETTINGS_MEMBERS_INVITE_ERROR}
          className="text-xs text-danger"
        >
          {error}
        </span>
      )}
    </form>
  );
}

function PendingInvitationsTable({
  rows,
  onRevoke,
  isPending,
}: {
  rows: InvitationRow[];
  onRevoke: (id: string) => void;
  isPending: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <table
      data-testid={TestIds.SETTINGS_MEMBERS_PENDING_TABLE}
      className="mt-4 w-full text-sm"
    >
      <thead className="text-left text-ink-secondary">
        <tr>
          <th className="font-medium pb-2">Pending invite</th>
          <th className="font-medium pb-2">Role</th>
          <th className="font-medium pb-2">Expires</th>
          <th className="font-medium pb-2 w-px" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <tr
            key={row.id}
            data-testid={`${TestIds.SETTINGS_MEMBERS_PENDING_ROW}-${row.id}`}
          >
            <td className="py-2 text-ink">{row.email}</td>
            <td className="py-2 text-ink-secondary">{row.role}</td>
            <td className="py-2 text-ink-secondary">{formatDate(row.expires_at)}</td>
            <td className="py-2 text-right">
              <button
                type="button"
                onClick={() => onRevoke(row.id)}
                disabled={isPending}
                data-testid={`${TestIds.SETTINGS_MEMBERS_PENDING_REVOKE}-${row.id}`}
                className="text-xs text-danger hover:underline disabled:opacity-60"
              >
                Revoke
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TransferOwnershipDialog({
  members,
  myMembershipId,
  onClose,
  onSubmit,
  isPending,
}: {
  members: MemberRow[];
  myMembershipId: string;
  onClose: () => void;
  onSubmit: (payload: { toMembershipId: string; demoteSelf: boolean }) => void;
  isPending: boolean;
}) {
  const candidates = members.filter((row) => row.id !== myMembershipId);
  const [target, setTarget] = useState<string>(candidates[0]?.id ?? "");
  const [demoteSelf, setDemoteSelf] = useState(true);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!target) return;
    onSubmit({ toMembershipId: target, demoteSelf });
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={TestIds.SETTINGS_MEMBERS_TRANSFER_DIALOG}
      className="mt-3 rounded-md border border-border-subtle bg-surface-card p-3 text-sm text-ink"
    >
      <p className="mb-2 font-medium">Transfer workspace ownership</p>
      <label className="flex flex-col text-xs text-ink-secondary mb-2">
        New owner
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          data-testid={TestIds.SETTINGS_MEMBERS_TRANSFER_TARGET}
          className="mt-1 rounded-md border border-border-subtle bg-surface px-2 py-1 text-sm text-ink"
        >
          {candidates.map((row) => (
            <option key={row.id} value={row.id}>
              {row.username} ({row.email})
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-secondary mb-2">
        <input
          type="checkbox"
          checked={demoteSelf}
          onChange={(e) => setDemoteSelf(e.target.checked)}
          data-testid={TestIds.SETTINGS_MEMBERS_TRANSFER_DEMOTE}
        />
        Demote me to member
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending || !target}
          data-testid={TestIds.SETTINGS_MEMBERS_TRANSFER_SUBMIT}
          className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          Transfer
        </button>
        <button
          type="button"
          onClick={onClose}
          data-testid={TestIds.SETTINGS_MEMBERS_TRANSFER_CANCEL}
          className="rounded-md border border-border-subtle px-2 py-1 text-xs text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
