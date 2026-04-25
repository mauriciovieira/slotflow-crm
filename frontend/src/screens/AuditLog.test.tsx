import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuditLog } from "./AuditLog";
import type { AuditEvent } from "../lib/auditEventsHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/activeWorkspaceHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/activeWorkspaceHooks")>(
    "../lib/activeWorkspaceHooks",
  );
  return { ...actual, useActiveWorkspace: vi.fn() };
});

vi.mock("../lib/auditEventsHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/auditEventsHooks")>(
    "../lib/auditEventsHooks",
  );
  return { ...actual, useAuditEvents: vi.fn() };
});

import { useActiveWorkspace } from "../lib/activeWorkspaceHooks";
import { useAuditEvents } from "../lib/auditEventsHooks";

const useActiveMock = vi.mocked(useActiveWorkspace);
const useAuditMock = vi.mocked(useAuditEvents);

const WS_ID = "ws-1";

function eventFixture(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "evt-1",
    actor_repr: "alice",
    action: "mcp_token.issued",
    entity_type: "mcp.McpToken",
    entity_id: "tok-abc",
    workspace: WS_ID,
    correlation_id: "abc123",
    metadata: { name: "demo" },
    created_at: "2026-04-25T10:00:00Z",
    ...overrides,
  };
}

function setActive() {
  useActiveMock.mockReturnValue({
    data: { active: { id: WS_ID, name: "W", slug: "w" }, available: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: "success",
  } as unknown as ReturnType<typeof useActiveWorkspace>);
}

function setEvents(state: Partial<ReturnType<typeof useAuditEvents>>) {
  useAuditMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetching: false,
    isError: false,
    isSuccess: false,
    isPending: false,
    status: "success",
    ...state,
  } as unknown as ReturnType<typeof useAuditEvents>);
}

function pages(rows: AuditEvent[][]) {
  return {
    pages: rows.map((results) => ({
      count: results.length,
      next: null,
      previous: null,
      results,
    })),
    pageParams: [null],
  };
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderScreen() {
  return render(
    <Providers>
      <AuditLog />
    </Providers>,
  );
}

describe("AuditLog", () => {
  it("renders the loading state", () => {
    setActive();
    setEvents({ isLoading: true, status: "pending" });
    renderScreen();
    expect(screen.getByTestId(TestIds.AUDIT_LOADING)).toBeVisible();
  });

  it("renders the error state with a refetch button", async () => {
    const refetch = vi.fn();
    setActive();
    setEvents({
      error: new Error("nope"),
      isError: true,
      status: "error",
      refetch,
    });
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByTestId(TestIds.AUDIT_ERROR)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state when no events match", () => {
    setActive();
    setEvents({
      data: pages([[]]),
      isSuccess: true,
      status: "success",
    });
    renderScreen();
    expect(screen.getByTestId(TestIds.AUDIT_EMPTY)).toBeVisible();
  });

  it("renders rows with action, actor, entity, correlation", () => {
    setActive();
    setEvents({
      data: pages([
        [
          eventFixture(),
          eventFixture({
            id: "evt-2",
            action: "opportunity.archived",
            entity_type: "opportunities.Opportunity",
            entity_id: "42",
            metadata: {},
          }),
        ],
      ]),
      isSuccess: true,
      status: "success",
    });
    renderScreen();
    const table = screen.getByTestId(TestIds.AUDIT_TABLE);
    expect(table).toBeVisible();
    const row1 = screen.getByTestId(`${TestIds.AUDIT_ROW}-evt-1`);
    expect(row1).toHaveTextContent("alice");
    expect(row1).toHaveTextContent("mcp_token.issued");
    expect(row1).toHaveTextContent("abc123");
    const row2 = screen.getByTestId(`${TestIds.AUDIT_ROW}-evt-2`);
    expect(row2).toHaveTextContent("opportunity.archived");
    expect(row2).toHaveTextContent("#42");
  });

  it("metadata cell expands to show pretty-printed JSON", async () => {
    setActive();
    setEvents({
      data: pages([[eventFixture()]]),
      isSuccess: true,
      status: "success",
    });
    const user = userEvent.setup();
    renderScreen();
    const summary = screen.getByTestId(`${TestIds.AUDIT_METADATA_EXPAND}-evt-1`);
    expect(summary).toHaveTextContent("1 keys");
    await user.click(summary);
    const body = screen.getByTestId(`${TestIds.AUDIT_METADATA_BODY}-evt-1`);
    expect(body).toHaveTextContent('"name": "demo"');
  });

  it("Load more is hidden when hasNextPage is false", () => {
    setActive();
    setEvents({
      data: pages([[eventFixture()]]),
      hasNextPage: false,
      isSuccess: true,
      status: "success",
    });
    renderScreen();
    expect(screen.queryByTestId(TestIds.AUDIT_LOAD_MORE)).toBeNull();
  });

  it("Load more triggers fetchNextPage when hasNextPage is true", async () => {
    const fetchNextPage = vi.fn();
    setActive();
    setEvents({
      data: pages([[eventFixture()]]),
      hasNextPage: true,
      fetchNextPage,
      isSuccess: true,
      status: "success",
    });
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByTestId(TestIds.AUDIT_LOAD_MORE));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("clear filters resets all three inputs", async () => {
    setActive();
    setEvents({
      data: pages([[eventFixture()]]),
      isSuccess: true,
      status: "success",
    });
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByTestId(TestIds.AUDIT_FILTER_ACTION), "x");
    await user.type(screen.getByTestId(TestIds.AUDIT_FILTER_ENTITY_TYPE), "y");
    await user.type(screen.getByTestId(TestIds.AUDIT_FILTER_ENTITY_ID), "z");
    await user.click(screen.getByTestId(TestIds.AUDIT_FILTER_CLEAR));
    expect(screen.getByTestId(TestIds.AUDIT_FILTER_ACTION)).toHaveValue("");
    expect(screen.getByTestId(TestIds.AUDIT_FILTER_ENTITY_TYPE)).toHaveValue("");
    expect(screen.getByTestId(TestIds.AUDIT_FILTER_ENTITY_ID)).toHaveValue("");
  });
});
