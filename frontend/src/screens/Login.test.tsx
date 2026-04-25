import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { Login } from "./Login";
import { TestIds } from "../testIds";

const loginMutateAsync = vi.fn();

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return {
    ...actual,
    useLogin: () => ({
      mutateAsync: loginMutateAsync,
      isPending: false,
      error: null,
    }),
    useMe: () => ({
      data: undefined,
      isLoading: false,
      error: null,
    }),
  };
});

describe("Login", () => {
  it("renders the lockup, SSO placeholders, and credentials form", () => {
    renderWithProviders(<Login />);
    expect(screen.getByRole("img", { name: /slotflow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /continue with github/i })).toBeDisabled();
    expect(screen.getByTestId(TestIds.LOGIN_USERNAME)).toBeInTheDocument();
    expect(screen.getByTestId(TestIds.LOGIN_PASSWORD)).toBeInTheDocument();
    expect(screen.getByTestId(TestIds.LOGIN_SUBMIT)).toBeInTheDocument();
  });

  it("submits credentials and navigates on success", async () => {
    loginMutateAsync.mockResolvedValueOnce({
      authenticated: true,
      username: "admin",
      has_totp_device: true,
      is_verified: true,
    });
    const user = userEvent.setup();
    renderWithProviders(<Login />, {
      path: "/login",
      initialEntries: ["/login"],
      extraRoutes: [{ path: "/dashboard", element: <p>dashboard placeholder</p> }],
    });

    await user.type(screen.getByTestId(TestIds.LOGIN_USERNAME), "admin");
    await user.type(screen.getByTestId(TestIds.LOGIN_PASSWORD), "pw-test-123");
    await user.click(screen.getByTestId(TestIds.LOGIN_SUBMIT));

    expect(loginMutateAsync).toHaveBeenCalledWith({
      username: "admin",
      password: "pw-test-123",
    });
    await waitFor(() => expect(screen.getByText("dashboard placeholder")).toBeInTheDocument());
  });

  it("shows an error when the mutation rejects", async () => {
    loginMutateAsync.mockRejectedValueOnce(
      Object.assign(new Error("Invalid credentials."), { name: "ApiError", status: 400 }),
    );
    const user = userEvent.setup();
    renderWithProviders(<Login />);
    await user.type(screen.getByTestId(TestIds.LOGIN_USERNAME), "admin");
    await user.type(screen.getByTestId(TestIds.LOGIN_PASSWORD), "wrong");
    await user.click(screen.getByTestId(TestIds.LOGIN_SUBMIT));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid credentials/i),
    );
  });
});
