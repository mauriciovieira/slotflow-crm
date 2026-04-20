import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { TwoFactorVerify } from "./TwoFactorVerify";

const verifyMutateAsync = vi.fn();

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return {
    ...actual,
    useVerifyTotp: () => ({
      mutateAsync: verifyMutateAsync,
      isPending: false,
      error: null,
    }),
  };
});

describe("TwoFactorVerify", () => {
  it("renders the 6-digit input and submit button", () => {
    renderWithProviders(<TwoFactorVerify />);
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^verify$/i })).toBeInTheDocument();
  });

  it("submits and navigates on success", async () => {
    verifyMutateAsync.mockResolvedValueOnce({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<TwoFactorVerify />, {
      path: "/2fa/verify",
      initialEntries: ["/2fa/verify"],
      extraRoutes: [{ path: "/", element: <p>home placeholder</p> }],
    });

    await user.type(screen.getByLabelText(/6-digit code/i), "123456");
    await user.click(screen.getByRole("button", { name: /^verify$/i }));

    expect(verifyMutateAsync).toHaveBeenCalledWith("123456");
    await waitFor(() => expect(screen.getByText("home placeholder")).toBeInTheDocument());
  });
});
