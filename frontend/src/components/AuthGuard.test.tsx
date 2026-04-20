import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { AuthGuard } from "./AuthGuard";
import type { Me } from "../lib/authHooks";

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return { ...actual, useMe: vi.fn() };
});

import { useMe } from "../lib/authHooks";

const useMeMock = vi.mocked(useMe);

function setMe(me: Me | undefined, { isLoading = false } = {}) {
  useMeMock.mockReturnValue({
    data: me,
    isLoading,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: !!me,
    isPending: !me && !isLoading ? false : isLoading,
    status: me ? "success" : "pending",
  } as unknown as ReturnType<typeof useMe>);
}

const Protected = () => <p>protected content</p>;
const LoginPage = () => <p>login page</p>;
const SetupPage = () => <p>setup page</p>;
const VerifyPage = () => <p>verify page</p>;

const extraRoutes: { path: string; element: ReactElement }[] = [
  { path: "/login", element: <LoginPage /> },
  { path: "/2fa/setup", element: <SetupPage /> },
  { path: "/2fa/verify", element: <VerifyPage /> },
];

describe("AuthGuard", () => {
  it("shows a loading placeholder until useMe resolves", () => {
    setMe(undefined, { isLoading: true });
    renderWithProviders(
      <AuthGuard>
        <Protected />
      </AuthGuard>,
      { extraRoutes },
    );
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("redirects anonymous users to /login", async () => {
    setMe({ authenticated: false, username: null, has_totp_device: false, is_verified: false });
    renderWithProviders(
      <AuthGuard>
        <Protected />
      </AuthGuard>,
      { extraRoutes },
    );
    await waitFor(() => expect(screen.getByText("login page")).toBeInTheDocument());
  });

  it("redirects authed users without a TOTP device to /2fa/setup", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: false, is_verified: false });
    renderWithProviders(
      <AuthGuard>
        <Protected />
      </AuthGuard>,
      { extraRoutes },
    );
    await waitFor(() => expect(screen.getByText("setup page")).toBeInTheDocument());
  });

  it("redirects authed users with a device but no verification to /2fa/verify", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: true, is_verified: false });
    renderWithProviders(
      <AuthGuard>
        <Protected />
      </AuthGuard>,
      { extraRoutes },
    );
    await waitFor(() => expect(screen.getByText("verify page")).toBeInTheDocument());
  });

  it("renders children when verified", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: true, is_verified: true });
    renderWithProviders(
      <AuthGuard>
        <Protected />
      </AuthGuard>,
      { extraRoutes },
    );
    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
  });

  it("renders children without verification when requireVerified=false", async () => {
    setMe({ authenticated: true, username: "admin", has_totp_device: false, is_verified: false });
    renderWithProviders(
      <AuthGuard requireVerified={false}>
        <Protected />
      </AuthGuard>,
      { extraRoutes },
    );
    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
  });
});
