import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { InterviewStepResumesSection } from "./InterviewStepResumesSection";
import type { InterviewStepResume } from "../lib/interviewStepResumesHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/interviewStepResumesHooks", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/interviewStepResumesHooks")
  >("../lib/interviewStepResumesHooks");
  return {
    ...actual,
    useInterviewStepResumes: vi.fn(),
    useLinkResumeToStep: vi.fn(),
    useUnlinkStepResume: vi.fn(),
  };
});

vi.mock("../lib/resumesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/resumesHooks")>(
    "../lib/resumesHooks",
  );
  return { ...actual, useResumes: vi.fn(), useResumeVersions: vi.fn() };
});

import {
  useInterviewStepResumes,
  useLinkResumeToStep,
  useUnlinkStepResume,
} from "../lib/interviewStepResumesHooks";
import { useResumeVersions, useResumes } from "../lib/resumesHooks";

const useResumesMock = vi.mocked(useResumes);
const useResumeVersionsMock = vi.mocked(useResumeVersions);
const useStepResumesMock = vi.mocked(useInterviewStepResumes);
const useLinkMock = vi.mocked(useLinkResumeToStep);
const useUnlinkMock = vi.mocked(useUnlinkStepResume);

const STEP_ID = "step-1";
const CYCLE_ID = "cycle-1";

function fixture(overrides: Partial<InterviewStepResume> = {}): InterviewStepResume {
  return {
    id: "link-1",
    step: STEP_ID,
    resume_version: "v-1",
    resume_version_summary: {
      id: "v-1",
      version_number: 2,
      base_resume_id: "br-1",
      base_resume_name: "Senior Eng",
    },
    note: "",
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function setLinksQuery(state: Partial<ReturnType<typeof useInterviewStepResumes>>) {
  useStepResumesMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useInterviewStepResumes>);
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
  } as unknown as ReturnType<typeof useLinkResumeToStep>);
}

function setUnlink(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useUnlinkMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useUnlinkStepResume>);
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
      <InterviewStepResumesSection stepId={STEP_ID} cycleId={CYCLE_ID} />
    </Providers>,
  );
}

describe("InterviewStepResumesSection", () => {
  it("renders empty state with link toggle", () => {
    setResumes();
    setVersions();
    setLinksQuery({ data: [], isSuccess: true, status: "success" });
    setLink(vi.fn());
    setUnlink(vi.fn());
    renderSection();
    expect(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_EMPTY}-${STEP_ID}`),
    ).toBeVisible();
    expect(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_LINK_TOGGLE}-${STEP_ID}`),
    ).toBeVisible();
  });

  it("renders loading state", () => {
    setResumes();
    setVersions();
    setLinksQuery({ isLoading: true, status: "pending" });
    setLink(vi.fn());
    setUnlink(vi.fn());
    renderSection();
    expect(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_LOADING}-${STEP_ID}`),
    ).toBeVisible();
  });

  it("renders one row per linked resume", () => {
    setResumes();
    setVersions();
    setLinksQuery({
      data: [fixture()],
      isSuccess: true,
      status: "success",
    });
    setLink(vi.fn());
    setUnlink(vi.fn());
    renderSection();
    expect(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_LIST}-${STEP_ID}`),
    ).toBeVisible();
    expect(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_ROW}-link-1`),
    ).toHaveTextContent(/Senior Eng/);
  });

  it("submits link form with selected resume + version", async () => {
    setResumes();
    setVersions();
    setLinksQuery({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn().mockResolvedValueOnce(fixture());
    setLink(mutateAsync);
    setUnlink(vi.fn());
    const user = userEvent.setup();
    renderSection();

    await user.click(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_LINK_TOGGLE}-${STEP_ID}`),
    );
    await user.selectOptions(
      screen.getByTestId(TestIds.INTERVIEW_STEP_RESUMES_LINK_RESUME),
      "br-1",
    );
    await user.selectOptions(
      screen.getByTestId(TestIds.INTERVIEW_STEP_RESUMES_LINK_VERSION),
      "v-1",
    );
    fireEvent.submit(screen.getByTestId(TestIds.INTERVIEW_STEP_RESUMES_LINK_FORM));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      step: STEP_ID,
      resume_version: "v-1",
    });
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
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK}-link-1`),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    await user.click(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK_CONFIRM}-link-1`),
    );
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("renders inline error when unlink rejects", async () => {
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
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK}-link-1`),
    );
    await user.click(
      screen.getByTestId(`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK_CONFIRM}-link-1`),
    );

    const error = await screen.findByTestId(
      `${TestIds.INTERVIEW_STEP_RESUMES_UNLINK_ERROR}-link-1`,
    );
    expect(error).toHaveTextContent(/forbidden/i);
  });
});
