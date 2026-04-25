import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { OpportunityDetail } from "./OpportunityDetail";
import type { Opportunity } from "../lib/opportunitiesHooks";
import { ApiError } from "../lib/api";
import { TestIds } from "../testIds";

vi.mock("../lib/opportunitiesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/opportunitiesHooks")>(
    "../lib/opportunitiesHooks",
  );
  return {
    ...actual,
    useOpportunity: vi.fn(),
    useUpdateOpportunity: vi.fn(),
    useArchiveOpportunity: vi.fn(),
  };
});

import {
  useArchiveOpportunity,
  useOpportunity,
  useUpdateOpportunity,
} from "../lib/opportunitiesHooks";

const useOpportunityMock = vi.mocked(useOpportunity);
const useUpdateOpportunityMock = vi.mocked(useUpdateOpportunity);
const useArchiveOpportunityMock = vi.mocked(useArchiveOpportunity);

const FIXED_ID = "11111111-1111-1111-1111-111111111111";

function fixture(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: FIXED_ID,
    workspace: "ws-1",
    title: "Staff Engineer",
    company: "Acme",
    stage: "interview",
    notes: "intro call",
    expected_total_compensation: null,
    compensation_currency: "",
    created_by: { id: 1, username: "alice" },
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function setQuery(state: Partial<ReturnType<typeof useOpportunity>>) {
  useOpportunityMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useOpportunity>);
}

function setUpdate(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useUpdateOpportunityMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useUpdateOpportunity>);
}

function setArchive(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useArchiveOpportunityMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useArchiveOpportunity>);
}

function renderDetail() {
  return renderWithProviders(<OpportunityDetail />, {
    path: "/dashboard/opportunities/:opportunityId",
    initialEntries: [`/dashboard/opportunities/${FIXED_ID}`],
    extraRoutes: [
      { path: "/dashboard/opportunities", element: <p>list placeholder</p> },
    ],
  });
}

describe("OpportunityDetail", () => {
  it("renders the loading state", () => {
    setQuery({ isLoading: true, status: "pending" });
    setUpdate(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByText(/loading opportunity/i)).toBeVisible();
  });

  it("renders the not-found branch when the API returns 404", () => {
    setQuery({
      error: new ApiError(404, "Not found"),
      isError: true,
      status: "error",
    });
    setUpdate(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_NOT_FOUND)).toBeVisible();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_BACK)).toBeVisible();
  });

  it("renders the generic error branch with a retry button", () => {
    setQuery({
      error: new Error("network down"),
      isError: true,
      status: "error",
    });
    setUpdate(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_ERROR)).toBeVisible();
  });

  it("pre-fills the form from the API payload", () => {
    setQuery({ data: fixture(), isSuccess: true, status: "success" });
    setUpdate(vi.fn());
    setArchive(vi.fn());
    renderDetail();
    expect(
      (screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_TITLE) as HTMLInputElement).value,
    ).toBe("Staff Engineer");
    expect(
      (screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_COMPANY) as HTMLInputElement).value,
    ).toBe("Acme");
    expect(
      (screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_STAGE) as HTMLSelectElement).value,
    ).toBe("interview");
  });

  it("submits the patched values and navigates to the list", async () => {
    setQuery({ data: fixture(), isSuccess: true, status: "success" });
    const mutateAsync = vi.fn().mockResolvedValueOnce(fixture({ stage: "offer" }));
    setUpdate(mutateAsync);
    setArchive(vi.fn());
    const user = userEvent.setup();
    renderDetail();

    const stageSelect = screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_STAGE);
    await user.selectOptions(stageSelect, "offer");
    fireEvent.submit(screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_FORM));

    await screen.findByText("list placeholder");
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "offer", title: "Staff Engineer", company: "Acme" }),
    );
  });

  it("archives after the inline confirm and navigates to the list", async () => {
    setQuery({ data: fixture(), isSuccess: true, status: "success" });
    setUpdate(vi.fn());
    const archiveMutate = vi.fn().mockResolvedValueOnce(null);
    setArchive(archiveMutate);
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_ARCHIVE));
    expect(screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_ARCHIVE_CONFIRM)).toBeVisible();
    expect(archiveMutate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId(TestIds.OPPORTUNITY_DETAIL_ARCHIVE_CONFIRM));
    await screen.findByText("list placeholder");
    expect(archiveMutate).toHaveBeenCalledTimes(1);
  });
});
