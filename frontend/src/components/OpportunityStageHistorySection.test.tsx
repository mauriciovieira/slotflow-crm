import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OpportunityStageHistorySection } from "./OpportunityStageHistorySection";
import type { OpportunityStageTransition } from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/opportunitiesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/opportunitiesHooks")>(
    "../lib/opportunitiesHooks",
  );
  return { ...actual, useStageHistory: vi.fn() };
});

import { useStageHistory } from "../lib/opportunitiesHooks";

const useHistoryMock = vi.mocked(useStageHistory);

const OPP_ID = "opp-1";

function rowFixture(overrides: Partial<OpportunityStageTransition> = {}): OpportunityStageTransition {
  return {
    id: "tr-1",
    opportunity: OPP_ID,
    from_stage: "applied",
    to_stage: "interview",
    actor_repr: "alice (id=1)",
    created_at: "2026-04-25T10:00:00Z",
    ...overrides,
  };
}

function setHistory(state: Partial<ReturnType<typeof useStageHistory>>) {
  useHistoryMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useStageHistory>);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderSection() {
  return render(
    <Providers>
      <OpportunityStageHistorySection opportunityId={OPP_ID} />
    </Providers>,
  );
}

describe("OpportunityStageHistorySection", () => {
  it("renders the loading state", () => {
    setHistory({ isLoading: true, status: "pending" });
    renderSection();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_STAGE_HISTORY_LOADING)).toBeVisible();
  });

  it("renders the error branch with a refetch button", async () => {
    const refetch = vi.fn();
    setHistory({ error: new Error("boom"), isError: true, status: "error", refetch });
    const user = userEvent.setup();
    renderSection();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_STAGE_HISTORY_ERROR)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state", () => {
    setHistory({ data: [], isSuccess: true, status: "success" });
    renderSection();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_STAGE_HISTORY_EMPTY)).toBeVisible();
  });

  it("renders rows newest-first with stage labels and actor repr", () => {
    setHistory({
      data: [
        rowFixture({ id: "tr-2", from_stage: "interview", to_stage: "offer" }),
        rowFixture({ id: "tr-1", from_stage: "applied", to_stage: "interview" }),
      ],
      isSuccess: true,
      status: "success",
    });
    renderSection();
    const list = screen.getByTestId(TestIds.OPPORTUNITY_STAGE_HISTORY_LIST);
    expect(list).toBeVisible();
    const row1 = screen.getByTestId(`${TestIds.OPPORTUNITY_STAGE_HISTORY_ROW}-tr-2`);
    expect(row1).toHaveTextContent("Interview");
    expect(row1).toHaveTextContent("Offer");
    expect(row1).toHaveTextContent("alice");
    const row2 = screen.getByTestId(`${TestIds.OPPORTUNITY_STAGE_HISTORY_ROW}-tr-1`);
    expect(row2).toHaveTextContent("Applied");
  });

  it("falls back to raw stage value when label map lacks a key", () => {
    setHistory({
      data: [rowFixture({ id: "tr-x", from_stage: "applied", to_stage: "frozen" })],
      isSuccess: true,
      status: "success",
    });
    renderSection();
    const row = screen.getByTestId(`${TestIds.OPPORTUNITY_STAGE_HISTORY_ROW}-tr-x`);
    // "frozen" isn't in the FE STAGE_LABEL map; render it raw rather than
    // crashing with "undefined".
    expect(row).toHaveTextContent("frozen");
  });
});
