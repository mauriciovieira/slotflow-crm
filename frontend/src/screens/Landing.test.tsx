import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { Landing } from "./Landing";
import type { Me } from "../lib/authHooks";

const logoutMutate = vi.fn();

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return {
    ...actual,
    useMe: vi.fn(),
    useLogout: () => ({
      mutate: logoutMutate,
      isPending: false,
    }),
  };
});

import { useMe } from "../lib/authHooks";

const useMeMock = vi.mocked(useMe);

beforeEach(() => {
  logoutMutate.mockReset();
  useMeMock.mockReset();
});

function setMe(me: Me | undefined) {
  useMeMock.mockReturnValue({
    data: me,
    isLoading: false,
    error: null,
  } as unknown as ReturnType<typeof useMe>);
}

describe("Landing (anonymous)", () => {
  it("renders the Slotflow lockup and hero tagline", () => {
    setMe(undefined);
    renderWithProviders(<Landing />);
    expect(screen.getByRole("img", { name: /slotflow/i })).toBeInTheDocument();
    expect(
      screen.getByText(/a crm for the job hunt that doesn't forget the follow-up/i),
    ).toBeInTheDocument();
  });

  it("has a 'Get started' call to action", () => {
    setMe(undefined);
    renderWithProviders(<Landing />);
    expect(screen.getByRole("link", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });
});

describe("Landing (signed in)", () => {
  it("shows the username and a Sign out button instead of the CTAs", () => {
    setMe({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    renderWithProviders(<Landing />);
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /get started/i })).not.toBeInTheDocument();
  });

  it("calls useLogout when Sign out is clicked", async () => {
    setMe({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<Landing />);
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    await waitFor(() => expect(logoutMutate).toHaveBeenCalled());
  });

  it("keeps the anonymous CTAs when authenticated but not verified", () => {
    setMe({
      authenticated: true,
      username: "admin",
      has_totp_device: false,
      is_verified: false,
    });
    renderWithProviders(<Landing />);
    expect(screen.getByRole("link", { name: /get started/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });
});
