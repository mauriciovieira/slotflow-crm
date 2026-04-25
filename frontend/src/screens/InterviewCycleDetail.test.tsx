import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { InterviewCycleDetail } from "./InterviewCycleDetail";
import type { InterviewCycle, InterviewStep } from "../lib/interviewsHooks";
import { ApiError } from "../lib/api";
import { TestIds } from "../testIds";

vi.mock("../lib/interviewsHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/interviewsHooks")>(
    "../lib/interviewsHooks",
  );
  return {
    ...actual,
    useInterviewCycle: vi.fn(),
    useInterviewSteps: vi.fn(),
    useAddInterviewStep: vi.fn(),
    useUpdateStepStatus: vi.fn(),
  };
});

import {
  useAddInterviewStep,
  useInterviewCycle,
  useInterviewSteps,
  useUpdateStepStatus,
} from "../lib/interviewsHooks";

const useCycleMock = vi.mocked(useInterviewCycle);
const useStepsMock = vi.mocked(useInterviewSteps);
const useAddStepMock = vi.mocked(useAddInterviewStep);
const useUpdateStatusMock = vi.mocked(useUpdateStepStatus);

const FIXED_ID = "11111111-1111-1111-1111-111111111111";

function cycleFixture(overrides: Partial<InterviewCycle> = {}): InterviewCycle {
  return {
    id: FIXED_ID,
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

function stepFixture(overrides: Partial<InterviewStep> = {}): InterviewStep {
  return {
    id: "s1",
    cycle: FIXED_ID,
    sequence: 1,
    kind: "phone",
    status: "scheduled",
    scheduled_for: null,
    duration_minutes: null,
    interviewer: "",
    notes: "",
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    ...overrides,
  };
}

function setCycleQuery(state: Partial<ReturnType<typeof useInterviewCycle>>) {
  useCycleMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useInterviewCycle>);
}

function setStepsQuery(state: Partial<ReturnType<typeof useInterviewSteps>>) {
  useStepsMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useInterviewSteps>);
}

function setAddStep(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useAddStepMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useAddInterviewStep>);
}

function setUpdateStatus(mutate: ReturnType<typeof vi.fn>, isPending = false) {
  useUpdateStatusMock.mockReturnValue({
    mutate,
    mutateAsync: vi.fn(),
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useUpdateStepStatus>);
}

function renderDetail() {
  return renderWithProviders(<InterviewCycleDetail />, {
    path: "/dashboard/interviews/:cycleId",
    initialEntries: [`/dashboard/interviews/${FIXED_ID}`],
    extraRoutes: [
      { path: "/dashboard/interviews", element: <p>list placeholder</p> },
    ],
  });
}

describe("InterviewCycleDetail", () => {
  it("renders loading state", () => {
    setCycleQuery({ isLoading: true, status: "pending" });
    setStepsQuery({ data: [], isSuccess: true, status: "success" });
    setAddStep(vi.fn());
    setUpdateStatus(vi.fn());
    renderDetail();
    expect(screen.getByText(/loading cycle/i)).toBeVisible();
  });

  it("renders not-found branch on 404", () => {
    setCycleQuery({
      error: new ApiError(404, "Not found"),
      isError: true,
      status: "error",
    });
    setStepsQuery({ data: [], isSuccess: true, status: "success" });
    setAddStep(vi.fn());
    setUpdateStatus(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.INTERVIEW_CYCLE_DETAIL_NOT_FOUND)).toBeVisible();
  });

  it("renders heading + empty steps placeholder", () => {
    setCycleQuery({ data: cycleFixture(), isSuccess: true, status: "success" });
    setStepsQuery({ data: [], isSuccess: true, status: "success" });
    setAddStep(vi.fn());
    setUpdateStatus(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.INTERVIEW_CYCLE_DETAIL_HEADING)).toHaveTextContent(
      "Onsite loop",
    );
    expect(screen.getByTestId(TestIds.INTERVIEW_CYCLE_STEPS_EMPTY)).toBeVisible();
  });

  it("renders one row per step", () => {
    setCycleQuery({ data: cycleFixture(), isSuccess: true, status: "success" });
    setStepsQuery({
      data: [stepFixture(), stepFixture({ id: "s2", sequence: 2, kind: "technical" })],
      isSuccess: true,
      status: "success",
    });
    setAddStep(vi.fn());
    setUpdateStatus(vi.fn());
    renderDetail();
    expect(screen.getByTestId(TestIds.INTERVIEW_CYCLE_STEPS_LIST)).toBeVisible();
    expect(
      screen.getByTestId(`${TestIds.INTERVIEW_CYCLE_STEP_ROW}-s1`),
    ).toHaveTextContent(/Phone screen/);
    expect(
      screen.getByTestId(`${TestIds.INTERVIEW_CYCLE_STEP_ROW}-s2`),
    ).toHaveTextContent(/Technical/);
  });

  it("submits a new step", async () => {
    setCycleQuery({ data: cycleFixture(), isSuccess: true, status: "success" });
    setStepsQuery({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn().mockResolvedValueOnce(stepFixture());
    setAddStep(mutateAsync);
    setUpdateStatus(vi.fn());
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_TOGGLE));
    fireEvent.submit(screen.getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_FORM));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({ kind: "phone" });
  });

  it("calls update_step_status when the dropdown changes", async () => {
    setCycleQuery({ data: cycleFixture(), isSuccess: true, status: "success" });
    setStepsQuery({
      data: [stepFixture()],
      isSuccess: true,
      status: "success",
    });
    setAddStep(vi.fn());
    const mutate = vi.fn();
    setUpdateStatus(mutate);
    const user = userEvent.setup();
    renderDetail();

    await user.selectOptions(
      screen.getByTestId(`${TestIds.INTERVIEW_CYCLE_STEP_STATUS_SELECT}-s1`),
      "completed",
    );
    expect(mutate).toHaveBeenCalledWith(
      { status: "completed" },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it("shows the in-flight selection while mutation is pending instead of snapping back", async () => {
    setCycleQuery({ data: cycleFixture(), isSuccess: true, status: "success" });
    setStepsQuery({
      data: [stepFixture({ status: "scheduled" })],
      isSuccess: true,
      status: "success",
    });
    setAddStep(vi.fn());
    // Simulate "mutation fired but not yet settled" — `mutate` records the
    // call but never calls `onSettled`. The select must visually hold the
    // user's pick instead of falling back to `step.status`.
    const mutate = vi.fn();
    setUpdateStatus(mutate);
    const user = userEvent.setup();
    renderDetail();

    const select = screen.getByTestId(
      `${TestIds.INTERVIEW_CYCLE_STEP_STATUS_SELECT}-s1`,
    ) as HTMLSelectElement;
    await user.selectOptions(select, "completed");
    expect(mutate).toHaveBeenCalledWith(
      { status: "completed" },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
    // Re-render under the same in-flight state — value must still be
    // "completed", not "scheduled".
    expect(select.value).toBe("completed");
  });

  it("does not fire status mutation when value matches current status", async () => {
    setCycleQuery({ data: cycleFixture(), isSuccess: true, status: "success" });
    setStepsQuery({
      data: [stepFixture({ status: "scheduled" })],
      isSuccess: true,
      status: "success",
    });
    setAddStep(vi.fn());
    const mutate = vi.fn();
    setUpdateStatus(mutate);
    const user = userEvent.setup();
    renderDetail();

    await user.selectOptions(
      screen.getByTestId(`${TestIds.INTERVIEW_CYCLE_STEP_STATUS_SELECT}-s1`),
      "scheduled",
    );
    expect(mutate).not.toHaveBeenCalled();
  });
});
