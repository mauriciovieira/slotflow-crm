import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { OpportunityResumesSection } from "./OpportunityResumesSection";
import type { OpportunityResume } from "../lib/opportunityResumesHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/opportunityResumesHooks", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/opportunityResumesHooks")
  >("../lib/opportunityResumesHooks");
  return {
    ...actual,
    useOpportunityResumes: vi.fn(),
    useLinkResumeToOpportunity: vi.fn(),
    useUnlinkOpportunityResume: vi.fn(),
  };
});

vi.mock("../lib/resumesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/resumesHooks")>(
    "../lib/resumesHooks",
  );
  return { ...actual, useResumes: vi.fn(), useResumeVersions: vi.fn() };
});

import {
  useLinkResumeToOpportunity,
  useOpportunityResumes,
  useUnlinkOpportunityResume,
} from "../lib/opportunityResumesHooks";
import { useResumeVersions, useResumes } from "../lib/resumesHooks";

const useResumesMock = vi.mocked(useResumes);
const useResumeVersionsMock = vi.mocked(useResumeVersions);
const useOpportunityResumesMock = vi.mocked(useOpportunityResumes);
const useLinkMock = vi.mocked(useLinkResumeToOpportunity);
const useUnlinkMock = vi.mocked(useUnlinkOpportunityResume);

const OPP_ID = "opp-1";

function fixture(overrides: Partial<OpportunityResume> = {}): OpportunityResume {
  return {
    id: "link-1",
    opportunity: OPP_ID,
    resume_version: "v-1",
    resume_version_summary: {
      id: "v-1",
      version_number: 2,
      base_resume_id: "br-1",
      base_resume_name: "Senior Eng",
    },
    role: "submitted",
    note: "",
    created_by: null,
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    ...overrides,
  };
}

function setLinksQuery(state: Partial<ReturnType<typeof useOpportunityResumes>>) {
  useOpportunityResumesMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useOpportunityResumes>);
}

function setResumes() {
  useResumesMock.mockReturnValue({
    data: [
      {
        id: "br-1",
        workspace: "ws-1",
        name: "Senior Eng",
        created_by: null,
        created_at: "",
        updated_at: "",
        archived_at: null,
        latest_version: { version_number: 2 },
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: "success",
  } as unknown as ReturnType<typeof useResumes>);
}

function setVersions() {
  useResumeVersionsMock.mockReturnValue({
    data: [
      {
        id: "v-1",
        base_resume: "br-1",
        version_number: 2,
        document: {},
        document_hash: "x",
        notes: "",
        created_by: null,
        created_at: "",
        updated_at: "",
      },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: "success",
  } as unknown as ReturnType<typeof useResumeVersions>);
}

function setLink(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useLinkMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useLinkResumeToOpportunity>);
}

function setUnlink(
  mutateAsync: ReturnType<typeof vi.fn>,
  isPending = false,
) {
  useUnlinkMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useUnlinkOpportunityResume>);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderSection() {
  return render(
    <Providers>
      <OpportunityResumesSection opportunityId={OPP_ID} />
    </Providers>,
  );
}

describe("OpportunityResumesSection", () => {
  it("renders loading state", () => {
    setResumes();
    setVersions();
    setLinksQuery({ isLoading: true, status: "pending" });
    setLink(vi.fn());
    setUnlink(vi.fn());
    renderSection();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LOADING)).toBeVisible();
  });

  it("renders error state", () => {
    setResumes();
    setVersions();
    setLinksQuery({ error: new Error("boom"), isError: true, status: "error" });
    setLink(vi.fn());
    setUnlink(vi.fn());
    renderSection();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_ERROR)).toBeVisible();
  });

  it("renders empty state", () => {
    setResumes();
    setVersions();
    setLinksQuery({ data: [], isSuccess: true, status: "success" });
    setLink(vi.fn());
    setUnlink(vi.fn());
    renderSection();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_EMPTY)).toBeVisible();
  });

  it("renders one row per link with role pill + base resume name + version", () => {
    setResumes();
    setVersions();
    setLinksQuery({
      data: [
        fixture({ id: "link-1", role: "submitted" }),
        fixture({ id: "link-2", role: "used_internally" }),
      ],
      isSuccess: true,
      status: "success",
    });
    setLink(vi.fn());
    setUnlink(vi.fn());
    renderSection();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LIST)).toBeVisible();
    expect(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_ROW}-link-1`),
    ).toHaveTextContent(/Senior Eng/);
    expect(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_ROW}-link-1`),
    ).toHaveTextContent(/Submitted/);
    expect(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_ROW}-link-2`),
    ).toHaveTextContent(/Used internally/);
  });

  it("submits link form with selected resume + version + role", async () => {
    setResumes();
    setVersions();
    setLinksQuery({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn().mockResolvedValueOnce(fixture());
    setLink(mutateAsync);
    setUnlink(vi.fn());
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_TOGGLE));
    await user.selectOptions(
      screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_RESUME),
      "br-1",
    );
    await user.selectOptions(
      screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_VERSION),
      "v-1",
    );
    fireEvent.submit(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_FORM));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      opportunity: OPP_ID,
      resume_version: "v-1",
      role: "submitted",
    });
  });

  it("blocks link submit without a chosen version", async () => {
    setResumes();
    setVersions();
    setLinksQuery({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn();
    setLink(mutateAsync);
    setUnlink(vi.fn());
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_TOGGLE));
    await user.selectOptions(
      screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_RESUME),
      "br-1",
    );
    // Skip the version pick.
    fireEvent.submit(screen.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_FORM));
    // Form natively requires the version select — submit no-ops at the form
    // level when the field's `required` rejects. Either way the mutation
    // must not have fired.
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("unlink fires mutation only after inline confirm", async () => {
    setResumes();
    setVersions();
    setLinksQuery({
      data: [fixture()],
      isSuccess: true,
      status: "success",
    });
    setLink(vi.fn());
    const mutateAsync = vi.fn().mockResolvedValueOnce(null);
    setUnlink(mutateAsync);
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_UNLINK}-link-1`),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    await user.click(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_UNLINK_CONFIRM}-link-1`),
    );
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("renders an inline error when unlink mutation rejects (e.g. 403/500)", async () => {
    setResumes();
    setVersions();
    setLinksQuery({
      data: [fixture()],
      isSuccess: true,
      status: "success",
    });
    setLink(vi.fn());
    const mutateAsync = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Forbidden."), { name: "ApiError" }));
    setUnlink(mutateAsync);
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_UNLINK}-link-1`),
    );
    await user.click(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_UNLINK_CONFIRM}-link-1`),
    );

    const error = await screen.findByTestId(
      `${TestIds.OPPORTUNITY_RESUMES_UNLINK_ERROR}-link-1`,
    );
    expect(error).toHaveTextContent(/forbidden/i);
    // Confirm UI must remain so the user can retry, not silently collapse.
    expect(
      screen.getByTestId(`${TestIds.OPPORTUNITY_RESUMES_UNLINK_CONFIRM}-link-1`),
    ).toBeVisible();
  });
});
