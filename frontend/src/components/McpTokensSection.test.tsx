import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { McpTokensSection } from "./McpTokensSection";
import type { McpToken } from "../lib/mcpTokensHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/mcpTokensHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/mcpTokensHooks")>(
    "../lib/mcpTokensHooks",
  );
  return {
    ...actual,
    useMcpTokens: vi.fn(),
    useIssueMcpToken: vi.fn(),
    useRevokeMcpToken: vi.fn(),
  };
});

import {
  useIssueMcpToken,
  useMcpTokens,
  useRevokeMcpToken,
} from "../lib/mcpTokensHooks";

const useTokensMock = vi.mocked(useMcpTokens);
const useIssueMock = vi.mocked(useIssueMcpToken);
const useRevokeMock = vi.mocked(useRevokeMcpToken);

function tokenFixture(overrides: Partial<McpToken> = {}): McpToken {
  return {
    id: "tok-1",
    name: "My laptop",
    last_four: "abcd",
    expires_at: null,
    created_at: "2026-04-25T10:00:00Z",
    updated_at: "2026-04-25T10:00:00Z",
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };
}

function setTokens(state: Partial<ReturnType<typeof useMcpTokens>>) {
  useTokensMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    status: "success",
    ...state,
  } as unknown as ReturnType<typeof useMcpTokens>);
}

function setIssue(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useIssueMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useIssueMcpToken>);
}

function setRevoke(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useRevokeMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useRevokeMcpToken>);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection() {
  return render(
    <Providers>
      <McpTokensSection />
    </Providers>,
  );
}

describe("McpTokensSection", () => {
  it("renders empty state with the issue toggle", () => {
    setTokens({ data: [], isSuccess: true, status: "success" });
    setIssue(vi.fn());
    setRevoke(vi.fn());
    renderSection();
    expect(screen.getByTestId(TestIds.SETTINGS_MCP_EMPTY)).toBeVisible();
    expect(screen.getByTestId(TestIds.SETTINGS_MCP_ISSUE_TOGGLE)).toBeVisible();
  });

  it("renders token rows with last_four and dims revoked rows", () => {
    setTokens({
      data: [
        tokenFixture(),
        tokenFixture({
          id: "tok-2",
          name: "Old key",
          last_four: "9999",
          revoked_at: "2026-04-20T00:00:00Z",
        }),
      ],
      isSuccess: true,
      status: "success",
    });
    setIssue(vi.fn());
    setRevoke(vi.fn());
    renderSection();
    expect(screen.getByTestId(TestIds.SETTINGS_MCP_LIST)).toBeVisible();
    expect(screen.getByTestId(`${TestIds.SETTINGS_MCP_ROW}-tok-1`)).toHaveTextContent(
      /My laptop/,
    );
    expect(screen.getByTestId(`${TestIds.SETTINGS_MCP_ROW}-tok-1`)).toHaveTextContent(
      /abcd/,
    );
    // Active row exposes the revoke button; the revoked row hides it.
    expect(
      screen.getByTestId(`${TestIds.SETTINGS_MCP_REVOKE}-tok-1`),
    ).toBeVisible();
    expect(
      screen.queryByTestId(`${TestIds.SETTINGS_MCP_REVOKE}-tok-2`),
    ).toBeNull();
  });

  it("issue happy path shows plaintext panel exactly once", async () => {
    setTokens({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn().mockResolvedValueOnce({
      ...tokenFixture(),
      plaintext: "mcp_secret_plaintext_value",
    });
    setIssue(mutateAsync);
    setRevoke(vi.fn());
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId(TestIds.SETTINGS_MCP_ISSUE_TOGGLE));
    await user.type(
      screen.getByTestId(TestIds.SETTINGS_MCP_ISSUE_NAME),
      "My laptop",
    );
    fireEvent.submit(screen.getByTestId(TestIds.SETTINGS_MCP_ISSUE_FORM));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ name: "My laptop" });

    const panel = await screen.findByTestId(TestIds.SETTINGS_MCP_PLAINTEXT_PANEL);
    expect(panel).toBeVisible();
    const value = screen.getByTestId(
      TestIds.SETTINGS_MCP_PLAINTEXT_VALUE,
    ) as HTMLInputElement;
    expect(value.value).toBe("mcp_secret_plaintext_value");

    await user.click(screen.getByTestId(TestIds.SETTINGS_MCP_PLAINTEXT_DISMISS));
    expect(screen.queryByTestId(TestIds.SETTINGS_MCP_PLAINTEXT_PANEL)).toBeNull();
  });

  it("blocks issue submit when name is empty", async () => {
    setTokens({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn();
    setIssue(mutateAsync);
    setRevoke(vi.fn());
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId(TestIds.SETTINGS_MCP_ISSUE_TOGGLE));
    // Click the submit button (rather than `fireEvent.submit`) so we go
    // through the same path a real user would. The form sets
    // `noValidate`, so the custom inline error is the empty-name guard
    // in both jsdom and a real browser.
    await user.click(screen.getByTestId(TestIds.SETTINGS_MCP_ISSUE_SUBMIT));
    expect(
      await screen.findByTestId(TestIds.SETTINGS_MCP_ISSUE_ERROR),
    ).toHaveTextContent(/name is required/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("revoke fires only after inline confirm", async () => {
    setTokens({ data: [tokenFixture()], isSuccess: true, status: "success" });
    setIssue(vi.fn());
    const mutateAsync = vi.fn().mockResolvedValueOnce(null);
    setRevoke(mutateAsync);
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId(`${TestIds.SETTINGS_MCP_REVOKE}-tok-1`));
    expect(mutateAsync).not.toHaveBeenCalled();
    await user.click(
      screen.getByTestId(`${TestIds.SETTINGS_MCP_REVOKE_CONFIRM}-tok-1`),
    );
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });
});
