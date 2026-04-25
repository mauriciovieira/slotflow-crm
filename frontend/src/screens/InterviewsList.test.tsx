import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { InterviewsList } from "./InterviewsList";
import type { InterviewCycle } from "../lib/interviewsHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/interviewsHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/interviewsHooks")>(
    "../lib/interviewsHooks",
  );
  return { ...actual, useInterviewCycles: vi.fn() };
});

import { useInterviewCycles } from "../lib/interviewsHooks";

type QueryReturn = ReturnType<typeof useInterviewCycles>;

function setQuery(state: Partial<QueryReturn>) {
  vi.mocked(useInterviewCycles).mockReturnValue({
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

function makeCycle(overrides: Partial<InterviewCycle> = {}): InterviewCycle {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    opportunity: "op-1",
    opportunity_title: "Staff Eng",
    opportunity_company: "Acme",
    name: "Onsite loop",
    started_at: "2026-04-25T00:00:00Z",
    closed_at: null,
    notes: "",
    steps_count: 0,
    last_step_status: null,
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    ...overrides,
  };
}

describe("InterviewsList", () => {
  it("renders loading state", () => {
    setQuery({ isLoading: true, status: "pending" });
    render(
      <Providers>
        <InterviewsList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.INTERVIEWS_LOADING)).toBeVisible();
  });

  it("renders error state", () => {
    setQuery({ error: new Error("boom"), isError: true, status: "error" });
    render(
      <Providers>
        <InterviewsList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.INTERVIEWS_ERROR)).toBeVisible();
  });

  it("renders empty state with new-cycle CTA", () => {
    setQuery({ data: [], isSuccess: true, status: "success" });
    render(
      <Providers>
        <InterviewsList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.INTERVIEWS_EMPTY)).toBeVisible();
    const cta = screen.getByTestId(TestIds.INTERVIEWS_NEW_BUTTON);
    expect(cta.getAttribute("href")).toBe("/dashboard/interviews/new");
  });

  it("renders rows with name, steps_count, and last_step_status pill", () => {
    setQuery({
      data: [
        makeCycle({
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          name: "Acme onsite",
          steps_count: 3,
          last_step_status: "completed",
        }),
        makeCycle({
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          name: "No-step cycle",
        }),
      ],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <InterviewsList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.INTERVIEWS_LIST)).toBeVisible();
    expect(
      screen.getByTestId("interviews-row-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
    ).toHaveTextContent(/Acme onsite/);
    expect(
      screen.getByTestId("interviews-row-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
    ).toHaveTextContent(/Completed/);
    expect(
      screen.getByTestId("interviews-row-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ).toHaveTextContent("—");
  });

  it("renders opportunity title and company in each row", () => {
    setQuery({
      data: [
        makeCycle({
          id: "11111111-1111-1111-1111-111111111111",
          name: "Onsite loop",
          opportunity_title: "Staff Engineer",
          opportunity_company: "Acme",
        }),
      ],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <InterviewsList />
      </Providers>,
    );
    const row = screen.getByTestId("interviews-row-11111111-1111-1111-1111-111111111111");
    expect(row).toHaveTextContent(/Staff Engineer — Acme/);
  });

  it("links each row to its detail page", () => {
    setQuery({
      data: [makeCycle({ id: "11111111-1111-1111-1111-111111111111", name: "L" })],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <InterviewsList />
      </Providers>,
    );
    const link = screen.getByRole("link", { name: "L" });
    expect(link.getAttribute("href")).toBe(
      "/dashboard/interviews/11111111-1111-1111-1111-111111111111",
    );
  });
});
