import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { Landing } from "./Landing";
import type { Me } from "../lib/authHooks";
import { TestIds } from "../testIds";

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
    expect(screen.getByTestId(TestIds.LANDING_CTA_PRIMARY)).toBeInTheDocument();
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
    expect(screen.getByTestId(TestIds.SIGNED_IN_HEADER)).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByTestId(TestIds.SIGN_OUT_BUTTON)).toBeInTheDocument();
    expect(screen.queryByTestId(TestIds.LANDING_CTA_PRIMARY)).not.toBeInTheDocument();
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
    await user.click(screen.getByTestId(TestIds.SIGN_OUT_BUTTON));
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
    expect(screen.getByTestId(TestIds.LANDING_CTA_PRIMARY)).toBeInTheDocument();
    expect(screen.queryByTestId(TestIds.SIGN_OUT_BUTTON)).not.toBeInTheDocument();
  });
});
