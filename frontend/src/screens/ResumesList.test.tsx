import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ResumesList } from "./ResumesList";
import type { BaseResume } from "../lib/resumesHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/resumesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/resumesHooks")>(
    "../lib/resumesHooks",
  );
  return { ...actual, useResumes: vi.fn() };
});

import { useResumes } from "../lib/resumesHooks";

type QueryReturn = ReturnType<typeof useResumes>;

function setQuery(state: Partial<QueryReturn>) {
  vi.mocked(useResumes).mockReturnValue({
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

function makeResume(overrides: Partial<BaseResume> = {}): BaseResume {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workspace: "ws-1",
    name: "Senior Eng",
    created_by: { id: 1, username: "alice" },
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    archived_at: null,
    latest_version: null,
    ...overrides,
  };
}

describe("ResumesList", () => {
  it("renders loading state", () => {
    setQuery({ isLoading: true, status: "pending" });
    render(
      <Providers>
        <ResumesList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.RESUMES_LOADING)).toBeVisible();
  });

  it("renders error state", () => {
    setQuery({ error: new Error("boom"), isError: true, status: "error" });
    render(
      <Providers>
        <ResumesList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.RESUMES_ERROR)).toBeVisible();
  });

  it("renders empty state with new-resume CTA", () => {
    setQuery({ data: [], isSuccess: true, status: "success" });
    render(
      <Providers>
        <ResumesList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.RESUMES_EMPTY)).toBeVisible();
    const cta = screen.getByTestId(TestIds.RESUMES_NEW_BUTTON);
    expect(cta.getAttribute("href")).toBe("/dashboard/resumes/new");
  });

  it("renders rows with name and latest_version pill", () => {
    setQuery({
      data: [
        makeResume({
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          name: "Backend",
          latest_version: {
            id: "v1",
            base_resume: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            version_number: 3,
            document: {},
            document_hash: "x",
            notes: "",
            created_by: null,
            created_at: "2026-04-25T00:00:00Z",
            updated_at: "2026-04-25T00:00:00Z",
          },
        }),
        makeResume({
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          name: "Frontend",
          latest_version: null,
        }),
      ],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <ResumesList />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.RESUMES_LIST)).toBeVisible();
    expect(
      screen.getByTestId("resumes-row-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
    ).toHaveTextContent(/Backend/);
    expect(
      screen.getByTestId("resumes-row-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
    ).toHaveTextContent(/v3/);
    expect(
      screen.getByTestId("resumes-row-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ).toHaveTextContent("—");
  });

  it("links each row to its detail page", () => {
    setQuery({
      data: [makeResume({ id: "11111111-1111-1111-1111-111111111111", name: "X" })],
      isSuccess: true,
      status: "success",
    });
    render(
      <Providers>
        <ResumesList />
      </Providers>,
    );
    const link = screen.getByRole("link", { name: "X" });
    expect(link.getAttribute("href")).toBe(
      "/dashboard/resumes/11111111-1111-1111-1111-111111111111",
    );
  });
});
