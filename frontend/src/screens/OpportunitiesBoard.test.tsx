import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { OpportunitiesBoard } from "./OpportunitiesBoard";
import type { Opportunity } from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/opportunitiesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/opportunitiesHooks")>(
    "../lib/opportunitiesHooks",
  );
  return { ...actual, useOpportunities: vi.fn() };
});

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

import { useOpportunities } from "../lib/opportunitiesHooks";
import { apiFetch } from "../lib/api";

const useOpportunitiesMock = vi.mocked(useOpportunities);
const apiFetchMock = vi.mocked(apiFetch);

function fixture(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opp-1",
    workspace: "ws-1",
    title: "Senior Engineer",
    company: "Acme",
    stage: "applied",
    notes: "",
    expected_total_compensation: null,
    compensation_currency: "",
    created_by: { id: 1, username: "alice" },
    created_at: "2026-04-25T10:00:00Z",
    updated_at: "2026-04-25T10:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function setOpps(state: Partial<ReturnType<typeof useOpportunities>>) {
  useOpportunitiesMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useOpportunities>);
}

function makeDataTransfer() {
  // jsdom's DataTransfer doesn't carry setData/getData; provide a tiny
  // round-trip shim so the handlers can read the dragged opportunity id.
  const data = new Map<string, string>();
  return {
    setData: (k: string, v: string) => {
      data.set(k, v);
    },
    getData: (k: string) => data.get(k) ?? "",
    effectAllowed: "",
    dropEffect: "",
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

function renderBoard() {
  return render(
    <Providers>
      <OpportunitiesBoard />
    </Providers>,
  );
}

describe("OpportunitiesBoard", () => {
  // Vitest config doesn't enable `clearMocks`, so per-test isolation is
  // explicit here. Without this an earlier test's `apiFetch` call would
  // leak into the next test's `toHaveBeenCalledTimes(1)` assertion and
  // make ordering-dependent failures.
  beforeEach(() => {
    apiFetchMock.mockReset();
    useOpportunitiesMock.mockReset();
  });

  it("renders the loading branch", () => {
    setOpps({ isLoading: true, status: "pending" });
    renderBoard();
    expect(screen.getByTestId(TestIds.OPPORTUNITIES_BOARD_LOADING)).toBeVisible();
  });

  it("renders the error branch with a refetch button", async () => {
    const refetch = vi.fn();
    setOpps({ error: new Error("nope"), isError: true, status: "error", refetch });
    const user = userEvent.setup();
    renderBoard();
    expect(screen.getByTestId(TestIds.OPPORTUNITIES_BOARD_ERROR)).toBeVisible();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("groups opportunities into the right columns", () => {
    setOpps({
      data: [
        fixture(),
        fixture({ id: "opp-2", title: "Tech Lead", company: "Beta", stage: "interview" }),
      ],
      isSuccess: true,
      status: "success",
    });
    renderBoard();
    const applied = screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_COLUMN}-applied`);
    expect(within(applied).getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-1`)).toBeVisible();
    const interview = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-interview`,
    );
    expect(within(interview).getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-2`)).toBeVisible();
  });

  it("dropping a card on a different column PATCHes the new stage", async () => {
    setOpps({
      data: [fixture()],
      isSuccess: true,
      status: "success",
    });
    apiFetchMock.mockResolvedValueOnce(fixture({ stage: "interview" }));
    renderBoard();

    const card = screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-1`);
    const target = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-interview`,
    );

    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/opportunities/opp-1/",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ stage: "interview" }),
      }),
    );
  });

  it("dropping a card on its own column does not PATCH", () => {
    setOpps({ data: [fixture()], isSuccess: true, status: "success" });
    apiFetchMock.mockClear();
    renderBoard();

    const card = screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-1`);
    const sameTarget = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-applied`,
    );
    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(sameTarget, { dataTransfer });
    fireEvent.drop(sameTarget, { dataTransfer });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("dropping with an empty payload is a no-op", () => {
    setOpps({ data: [fixture()], isSuccess: true, status: "success" });
    apiFetchMock.mockClear();
    renderBoard();
    const target = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-interview`,
    );
    const dataTransfer = makeDataTransfer();
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("changing a card's stage via the keyboard <select> PATCHes the new stage", async () => {
    setOpps({ data: [fixture()], isSuccess: true, status: "success" });
    apiFetchMock.mockResolvedValueOnce(fixture({ stage: "interview" }));
    const user = userEvent.setup();
    renderBoard();

    await user.selectOptions(
      screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_MOVE_SELECT}-opp-1`),
      "interview",
    );

    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(1));
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/opportunities/opp-1/",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ stage: "interview" }),
      }),
    );
  });

  it("opportunities with an unexpected stage are skipped, not crashed", () => {
    // Future BE deploy could add a stage the FE doesn't know about.
    // The board should warn and skip rather than throw.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setOpps({
      data: [
        fixture(),
        // @ts-expect-error — simulating a stage value outside the FE union.
        fixture({ id: "opp-future", stage: "frozen" }),
      ],
      isSuccess: true,
      status: "success",
    });
    renderBoard();
    expect(screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-1`)).toBeVisible();
    expect(
      screen.queryByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-future`),
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unexpected stage"),
      expect.objectContaining({ id: "opp-future", stage: "frozen" }),
    );
    warn.mockRestore();
  });
});
