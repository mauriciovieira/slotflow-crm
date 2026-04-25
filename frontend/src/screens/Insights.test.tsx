import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { Insights } from "./Insights";
import type { CompensationSnapshot } from "../lib/insightsHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/activeWorkspaceHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/activeWorkspaceHooks")>(
    "../lib/activeWorkspaceHooks",
  );
  return { ...actual, useActiveWorkspace: vi.fn() };
});

vi.mock("../lib/insightsHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/insightsHooks")>(
    "../lib/insightsHooks",
  );
  return { ...actual, useCompensationSnapshot: vi.fn() };
});

import { useActiveWorkspace } from "../lib/activeWorkspaceHooks";
import { useCompensationSnapshot } from "../lib/insightsHooks";

const useActiveMock = vi.mocked(useActiveWorkspace);
const useSnapshotMock = vi.mocked(useCompensationSnapshot);

function setActive() {
  useActiveMock.mockReturnValue({
    data: { active: { id: "ws-1", name: "W", slug: "w" }, available: [] },
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

function setNoWorkspace() {
  useActiveMock.mockReturnValue({
    data: { active: null, available: [] },
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

function setSnapshot(state: Partial<ReturnType<typeof useCompensationSnapshot>>) {
  useSnapshotMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useCompensationSnapshot>);
}

function snapshotFixture(
  overrides: Partial<CompensationSnapshot> = {},
): CompensationSnapshot {
  return {
    workspace_id: "ws-1",
    target_currency: "USD",
    date: "2026-04-25",
    total: "250000.00",
    line_items: [
      {
        opportunity_id: "op-1",
        title: "Staff Eng",
        company: "Acme",
        stage: "interview",
        source_amount: "200000.00",
        source_currency: "USD",
        converted_amount: "200000.00",
      },
      {
        opportunity_id: "op-2",
        title: "Senior Eng",
        company: "Globex",
        stage: "applied",
        source_amount: "50000.00",
        source_currency: "USD",
        converted_amount: "50000.00",
      },
    ],
    skipped: [],
    ...overrides,
  };
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderInsights() {
  return render(
    <Providers>
      <Insights />
    </Providers>,
  );
}

describe("Insights screen", () => {
  it("renders 'pick a workspace' when there's no active workspace", () => {
    setNoWorkspace();
    setSnapshot({});
    renderInsights();
    expect(screen.getByText(/pick an active workspace/i)).toBeVisible();
  });

  it("renders the loading state", () => {
    setActive();
    setSnapshot({ isLoading: true, status: "pending" });
    renderInsights();
    expect(screen.getByTestId(TestIds.INSIGHTS_LOADING)).toBeVisible();
  });

  it("renders the total + per-opp rows", () => {
    setActive();
    setSnapshot({
      data: snapshotFixture(),
      isSuccess: true,
      status: "success",
    });
    renderInsights();
    expect(screen.getByTestId(TestIds.INSIGHTS_TOTAL)).toHaveTextContent(/250,000\.00 USD/);
    expect(screen.getByTestId(TestIds.INSIGHTS_LINE_ITEMS)).toBeVisible();
    expect(screen.getByTestId(`${TestIds.INSIGHTS_LINE_ITEM}-op-1`)).toHaveTextContent(
      /Staff Eng/,
    );
  });

  it("renders the empty state when no opps and no skipped", () => {
    setActive();
    setSnapshot({
      data: snapshotFixture({ total: "0", line_items: [], skipped: [] }),
      isSuccess: true,
      status: "success",
    });
    renderInsights();
    expect(screen.getByTestId(TestIds.INSIGHTS_EMPTY)).toBeVisible();
  });

  it("renders the skipped collapsible when present", () => {
    setActive();
    setSnapshot({
      data: snapshotFixture({
        skipped: [
          {
            opportunity_id: "op-3",
            title: "EU job",
            company: "Foo",
            reason: "fx-rate-missing",
          },
        ],
      }),
      isSuccess: true,
      status: "success",
    });
    renderInsights();
    // `<details>` content is collapsed by default; assert presence + the
    // skipped row content (also rendered inside the closed <details>).
    expect(screen.getByTestId(TestIds.INSIGHTS_SKIPPED)).toBeInTheDocument();
    expect(
      screen.getByTestId(`${TestIds.INSIGHTS_SKIPPED_ITEM}-op-3`),
    ).toHaveTextContent(/EU job/);
  });
});
