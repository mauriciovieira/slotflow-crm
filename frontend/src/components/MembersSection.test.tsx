import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MembersSection } from "./MembersSection";
import type { MemberRow, InvitationRow } from "../lib/membersHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/membersHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/membersHooks")>(
    "../lib/membersHooks",
  );
  return {
    ...actual,
    useMembers: vi.fn(),
    useInvitations: vi.fn(),
    useChangeMemberRole: vi.fn(),
    useRemoveMember: vi.fn(),
    useTransferOwnership: vi.fn(),
    useInviteMember: vi.fn(),
    useRevokeInvitation: vi.fn(),
  };
});

vi.mock("../lib/authHooks", () => ({
  useMe: vi.fn(),
}));

import {
  useChangeMemberRole,
  useInviteMember,
  useInvitations,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
} from "../lib/membersHooks";
import { useMe } from "../lib/authHooks";

const useMembersMock = vi.mocked(useMembers);
const useInvitationsMock = vi.mocked(useInvitations);
const useChangeRoleMock = vi.mocked(useChangeMemberRole);
const useRemoveMock = vi.mocked(useRemoveMember);
const useTransferMock = vi.mocked(useTransferOwnership);
const useInviteMock = vi.mocked(useInviteMember);
const useRevokeMock = vi.mocked(useRevokeInvitation);
const useMeMock = vi.mocked(useMe);

function memberRow(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id: "m-1",
    user_id: "u-1",
    username: "alice",
    email: "alice@example.com",
    role: "owner",
    created_at: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function inviteRow(overrides: Partial<InvitationRow> = {}): InvitationRow {
  return {
    id: "i-1",
    email: "x@example.com",
    role: "member",
    expires_at: "2026-05-01T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
    created_at: "2026-04-01T00:00:00Z",
    is_active: true,
    ...overrides,
  };
}

function setMembers(rows: MemberRow[], extra: Record<string, unknown> = {}) {
  useMembersMock.mockReturnValue({
    data: rows,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isSuccess: true,
    status: "success",
    ...extra,
  } as unknown as ReturnType<typeof useMembers>);
}

function setInvitations(rows: InvitationRow[]) {
  useInvitationsMock.mockReturnValue({
    data: rows,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isSuccess: true,
    status: "success",
  } as unknown as ReturnType<typeof useInvitations>);
}

function setMutation<T>(
  mockFn: ReturnType<typeof vi.mocked<T>>,
  mutate = vi.fn(),
) {
  // biome-ignore lint/suspicious/noExplicitAny: test scaffold
  (mockFn as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
    mutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: "idle",
  });
  return mutate;
}

function setMe(username: string) {
  useMeMock.mockReturnValue({
    data: {
      authenticated: true,
      username,
      has_totp_device: true,
      is_verified: true,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useMe>);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection(props: { workspaceId?: string } = {}) {
  return render(
    <Providers>
      <MembersSection workspaceId={props.workspaceId ?? "ws-1"} />
    </Providers>,
  );
}

describe("MembersSection", () => {
  beforeEach(() => {
    useMembersMock.mockReset();
    useInvitationsMock.mockReset();
    useChangeRoleMock.mockReset();
    useRemoveMock.mockReset();
    useTransferMock.mockReset();
    useInviteMock.mockReset();
    useRevokeMock.mockReset();
    useMeMock.mockReset();
    setMutation(useChangeRoleMock as never);
    setMutation(useRemoveMock as never);
    setMutation(useTransferMock as never);
    setMutation(useInviteMock as never);
    setMutation(useRevokeMock as never);
  });

  it("renders the members table", () => {
    setMe("alice");
    setMembers([
      memberRow(),
      memberRow({ id: "m-2", username: "bob", email: "bob@example.com", role: "member" }),
    ]);
    setInvitations([]);
    renderSection();
    expect(screen.getByTestId(TestIds.SETTINGS_MEMBERS_TABLE)).toBeVisible();
    expect(screen.getByTestId("settings-members-row-m-1")).toHaveTextContent("alice");
    expect(screen.getByTestId("settings-members-row-m-2")).toHaveTextContent("bob");
  });

  it("owner can change another member's role via select", async () => {
    setMe("alice");
    setMembers([
      memberRow(),
      memberRow({ id: "m-2", username: "bob", email: "bob@example.com", role: "member" }),
    ]);
    setInvitations([]);
    const mutate = setMutation(useChangeRoleMock as never);
    const user = userEvent.setup();
    renderSection();
    await user.selectOptions(
      screen.getByTestId(`${TestIds.SETTINGS_MEMBERS_ROLE_SELECT}-m-2`),
      "viewer",
    );
    expect(mutate).toHaveBeenCalledWith({ membershipId: "m-2", role: "viewer" });
  });

  it("non-owner sees no role select for other members", () => {
    setMe("bob");
    setMembers([
      memberRow(),
      memberRow({ id: "m-2", username: "bob", email: "bob@example.com", role: "member" }),
    ]);
    setInvitations([]);
    renderSection();
    expect(
      screen.queryByTestId(`${TestIds.SETTINGS_MEMBERS_ROLE_SELECT}-m-1`),
    ).toBeNull();
  });

  it("invite form fires the invite mutation with email + role", async () => {
    setMe("alice");
    setMembers([memberRow()]);
    setInvitations([]);
    const mutate = setMutation(useInviteMock as never);
    const user = userEvent.setup();
    renderSection();
    await user.type(
      screen.getByTestId(TestIds.SETTINGS_MEMBERS_INVITE_EMAIL),
      "new@example.com",
    );
    await user.selectOptions(
      screen.getByTestId(TestIds.SETTINGS_MEMBERS_INVITE_ROLE),
      "viewer",
    );
    await user.click(screen.getByTestId(TestIds.SETTINGS_MEMBERS_INVITE_SUBMIT));
    expect(mutate).toHaveBeenCalledWith(
      { email: "new@example.com", role: "viewer" },
      expect.objectContaining({}),
    );
  });

  it("renders a pending invitations row with revoke button when invites exist", async () => {
    setMe("alice");
    setMembers([memberRow()]);
    setInvitations([inviteRow()]);
    const mutate = setMutation(useRevokeMock as never);
    const user = userEvent.setup();
    renderSection();
    expect(screen.getByTestId(TestIds.SETTINGS_MEMBERS_PENDING_TABLE)).toBeVisible();
    await user.click(
      screen.getByTestId(`${TestIds.SETTINGS_MEMBERS_PENDING_REVOKE}-i-1`),
    );
    expect(mutate).toHaveBeenCalledWith("i-1");
  });

  it("hides invite form for non-owners", () => {
    setMe("bob");
    setMembers([
      memberRow(),
      memberRow({ id: "m-2", username: "bob", email: "bob@example.com", role: "member" }),
    ]);
    setInvitations([]);
    renderSection();
    expect(screen.queryByTestId(TestIds.SETTINGS_MEMBERS_INVITE_FORM)).toBeNull();
  });

  it("transfer-ownership dialog submits with target + demote flag", async () => {
    setMe("alice");
    setMembers([
      memberRow(),
      memberRow({ id: "m-2", username: "bob", email: "bob@example.com", role: "member" }),
    ]);
    setInvitations([]);
    const mutate = setMutation(useTransferMock as never);
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByTestId(TestIds.SETTINGS_MEMBERS_TRANSFER_TOGGLE));
    await user.click(screen.getByTestId(TestIds.SETTINGS_MEMBERS_TRANSFER_SUBMIT));
    expect(mutate).toHaveBeenCalledWith(
      { toMembershipId: "m-2", demoteSelf: true },
      expect.objectContaining({}),
    );
  });

  it("self-leave click + confirm fires remove mutation with own membership id", async () => {
    setMe("alice");
    setMembers([memberRow()]);
    setInvitations([]);
    const mutate = setMutation(useRemoveMock as never);
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByTestId(TestIds.SETTINGS_MEMBERS_LEAVE));
    await user.click(screen.getByTestId(TestIds.SETTINGS_MEMBERS_LEAVE_CONFIRM));
    expect(mutate).toHaveBeenCalledWith("m-1");
  });
});
