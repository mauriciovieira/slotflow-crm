import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { OpportunitiesList } from "./OpportunitiesList";
import type { Opportunity } from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/opportunitiesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/opportunitiesHooks")>(
    "../lib/opportunitiesHooks",
  );
  return { ...actual, useOpportunities: vi.fn() };
});

import { useOpportunities } from "../lib/opportunitiesHooks";

type QueryReturn = ReturnType<typeof useOpportunities>;

function setQuery(state: Partial<QueryReturn>) {
  vi.mocked(useOpportunities).mockReturnValue({
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
  } as unknown as QueryReturn);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function makeOpportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workspace: "ws-1",
    title: "Staff Engineer",
    company: "Acme",
    stage: "applied",
    notes: "",
    created_by: { id: 1, username: "alice" },
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("OpportunitiesList", () => {
  it("shows the loading placeholder while the query resolves", () => {
    setQuery({ isLoading: true, status: "pending" });
    render(
      <Providers>
        <OpportunitiesList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.OPPORTUNITIES_LOADING)).toBeVisible();
  });

  it("renders an error state with a retry button when the query fails", () => {
    const refetch = vi.fn();
    setQuery({ error: new Error("network down"), isError: true, refetch, status: "error" });
    render(
      <Providers>
        <OpportunitiesList />
      </Providers>,
    );
    const errorBox = screen.getByTestId(TestIds.OPPORTUNITIES_ERROR);
    expect(errorBox).toBeVisible();
    expect(errorBox).toHaveTextContent(/could not load opportunities/i);
  });

  it("renders the empty state when the API returns zero rows", () => {
    setQuery({ data: [], isSuccess: true, status: "success" });
    render(
      <Providers>
        <OpportunitiesList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.OPPORTUNITIES_EMPTY)).toBeVisible();
  });

  it("renders one row per opportunity with title + company visible", () => {
    setQuery({
      data: [
        makeOpportunity({
          id: "11111111-1111-1111-1111-111111111111",
          title: "Staff Engineer",
          company: "Acme",
        }),
        makeOpportunity({
          id: "22222222-2222-2222-2222-222222222222",
          title: "Senior Designer",
          company: "Globex",
          stage: "interview",
        }),
      ],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <OpportunitiesList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.OPPORTUNITIES_LIST)).toBeVisible();
    expect(
      screen.getByTestId("opportunities-row-11111111-1111-1111-1111-111111111111"),
    ).toHaveTextContent(/Staff Engineer/);
    expect(
      screen.getByTestId("opportunities-row-22222222-2222-2222-2222-222222222222"),
    ).toHaveTextContent(/Senior Designer/);
  });

  it("applies the interview-stage pill class for an interview row", () => {
    setQuery({
      data: [makeOpportunity({ stage: "interview" })],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <OpportunitiesList />
      </Providers>,
    );
    const row = screen.getByTestId("opportunities-row-11111111-1111-1111-1111-111111111111");
    const pill = row.querySelector("span");
    expect(pill?.className).toMatch(/bg-brand\b/);
  });

  it("renders a New opportunity button in the empty state pointing at /dashboard/opportunities/new", () => {
    setQuery({ data: [], isSuccess: true, status: "success" });
    render(
      <Providers>
        <OpportunitiesList />
      </Providers>,
    );
    const link = screen.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON);
    expect(link).toBeVisible();
    expect(link.getAttribute("href")).toBe("/dashboard/opportunities/new");
  });

  it("renders a New opportunity button in the populated state pointing at /dashboard/opportunities/new", () => {
    setQuery({
      data: [makeOpportunity()],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <OpportunitiesList />
      </Providers>,
    );
    const link = screen.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON);
    expect(link.getAttribute("href")).toBe("/dashboard/opportunities/new");
  });
});
