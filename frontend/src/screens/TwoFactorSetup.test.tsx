import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { TwoFactorSetup } from "./TwoFactorSetup";

const confirmMutateAsync = vi.fn();

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return {
    ...actual,
    useTotpSetup: () => ({
      data: {
        otpauth_uri: "otpauth://totp/Slotflow%20CRM:admin?secret=XXX&issuer=Slotflow%20CRM",
        qr_svg: '<svg data-testid="qr" width="10" height="10"></svg>',
        confirmed: false,
      },
      isLoading: false,
      error: null,
    }),
    useConfirmTotp: () => ({
      mutateAsync: confirmMutateAsync,
      isPending: false,
      error: null,
    }),
  };
});

describe("TwoFactorSetup", () => {
  it("renders the QR svg inline and a 6-digit input", () => {
    renderWithProviders(<TwoFactorSetup />);
    expect(screen.getByTestId("qr")).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
  });

  it("submits the token and navigates on success", async () => {
    confirmMutateAsync.mockResolvedValueOnce({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<TwoFactorSetup />, {
      path: "/2fa/setup",
      initialEntries: ["/2fa/setup"],
      extraRoutes: [{ path: "/", element: <p>home placeholder</p> }],
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(confirmMutateAsync).toHaveBeenCalledWith("123456");
    await waitFor(() => expect(screen.getByText("home placeholder")).toBeInTheDocument());
  });

  it("routes to /2fa/verify when confirm succeeds but session is not OTP-verified", async () => {
    confirmMutateAsync.mockResolvedValueOnce({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: false,
    });
    const user = userEvent.setup();
    renderWithProviders(<TwoFactorSetup />, {
      path: "/2fa/setup",
      initialEntries: ["/2fa/setup"],
      extraRoutes: [
        { path: "/", element: <p>home placeholder</p> },
        { path: "/2fa/verify", element: <p>verify placeholder</p> },
      ],
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    await waitFor(() => expect(screen.getByText("verify placeholder")).toBeInTheDocument());
    expect(screen.queryByText("home placeholder")).not.toBeInTheDocument();
  });
});
