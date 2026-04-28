import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { DashboardHeader } from "./DashboardHeader";
import type { Me } from "../lib/authHooks";
import { TestIds } from "../testIds";

vi.mock("./NotificationsBell", () => ({
  // The bell has its own dedicated test file. Stub it out so the
  // header-focused tests don't need to mock the notifications hooks.
  NotificationsBell: () => null,
}));

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return { ...actual, useMe: vi.fn(), useLogout: vi.fn() };
});

import { useLogout, useMe } from "../lib/authHooks";

const useMeMock = vi.mocked(useMe);
const useLogoutMock = vi.mocked(useLogout);

function setMe(me: Me | undefined) {
  useMeMock.mockReturnValue({
    data: me,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: !!me,
    isPending: false,
    status: me ? "success" : "pending",
  } as unknown as ReturnType<typeof useMe>);
}

function setLogout(mutate: () => void, isPending = false) {
  useLogoutMock.mockReturnValue({
    mutate,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useLogout>);
}

describe("DashboardHeader", () => {
  it("renders the title prop", () => {
    setMe({ authenticated: true, username: "e2e", has_totp_device: true, is_verified: true });
    setLogout(vi.fn());
    renderWithProviders(<DashboardHeader title="Opportunities" />);
    expect(screen.getByText("Opportunities")).toBeVisible();
  });

  it("shows the signed-in username from useMe", () => {
    setMe({ authenticated: true, username: "alice", has_totp_device: true, is_verified: true });
    setLogout(vi.fn());
    renderWithProviders(<DashboardHeader title="Resumes" />);
    const banner = screen.getByTestId(TestIds.SIGNED_IN_HEADER);
    expect(banner).toHaveTextContent("alice");
  });

  it("invokes useLogout().mutate when Sign out is clicked", () => {
    setMe({ authenticated: true, username: "alice", has_totp_device: true, is_verified: true });
    const mutate = vi.fn();
    setLogout(mutate);
    renderWithProviders(<DashboardHeader title="Interviews" />);
    fireEvent.click(screen.getByTestId(TestIds.SIGN_OUT_BUTTON));
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
