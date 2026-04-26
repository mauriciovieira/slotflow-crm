import { describe, expect, it, vi } from "vitest";
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
  return {
    ...actual,
    useOpportunities: vi.fn(),
    useUpdateOpportunity: vi.fn(),
  };
});

import {
  useOpportunities,
  useUpdateOpportunity,
} from "../lib/opportunitiesHooks";

const useOpportunitiesMock = vi.mocked(useOpportunities);
const useUpdateMock = vi.mocked(useUpdateOpportunity);

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

function setUpdate(mutateAsync: ReturnType<typeof vi.fn>) {
  useUpdateMock.mockReturnValue({
    mutateAsync,
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: "idle",
  } as unknown as ReturnType<typeof useUpdateOpportunity>);
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
  it("renders the loading branch", () => {
    setOpps({ isLoading: true, status: "pending" });
    setUpdate(vi.fn());
    renderBoard();
    expect(screen.getByTestId(TestIds.OPPORTUNITIES_BOARD_LOADING)).toBeVisible();
  });

  it("renders the error branch with a refetch button", async () => {
    const refetch = vi.fn();
    setOpps({ error: new Error("nope"), isError: true, status: "error", refetch });
    setUpdate(vi.fn());
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
    setUpdate(vi.fn());
    renderBoard();
    const applied = screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_COLUMN}-applied`);
    expect(within(applied).getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-1`)).toBeVisible();
    const interview = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-interview`,
    );
    expect(within(interview).getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-2`)).toBeVisible();
  });

  it("dropping a card on a different column triggers an update with the new stage", async () => {
    setOpps({
      data: [fixture()],
      isSuccess: true,
      status: "success",
    });
    const mutateAsync = vi.fn().mockResolvedValueOnce(fixture({ stage: "interview" }));
    setUpdate(mutateAsync);
    renderBoard();

    const card = screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-1`);
    const target = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-interview`,
    );

    // jsdom DataTransfer doesn't ship with `setData`/`getData`; provide a
    // tiny shim that round-trips a single key so the handlers can read
    // the dragged opportunity id.
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => {
        data.set(k, v);
      },
      getData: (k: string) => data.get(k) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ stage: "interview" });
  });

  it("dropping a card on its own column does not fire mutateAsync", () => {
    setOpps({ data: [fixture()], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn();
    setUpdate(mutateAsync);
    renderBoard();

    const card = screen.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_CARD}-opp-1`);
    const sameTarget = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-applied`,
    );
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(sameTarget, { dataTransfer });
    fireEvent.drop(sameTarget, { dataTransfer });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("dropping with an empty payload is a no-op", () => {
    setOpps({ data: [fixture()], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn();
    setUpdate(mutateAsync);
    renderBoard();
    const target = screen.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-interview`,
    );
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
