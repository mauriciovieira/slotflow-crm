import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { InterviewCycleCreate } from "./InterviewCycleCreate";
import { TestIds } from "../testIds";

vi.mock("../lib/interviewsHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/interviewsHooks")>(
    "../lib/interviewsHooks",
  );
  return { ...actual, useStartInterviewCycle: vi.fn() };
});

vi.mock("../lib/opportunitiesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/opportunitiesHooks")>(
    "../lib/opportunitiesHooks",
  );
  return { ...actual, useOpportunities: vi.fn() };
});

import { useStartInterviewCycle } from "../lib/interviewsHooks";
import { useOpportunities } from "../lib/opportunitiesHooks";

const useStartMock = vi.mocked(useStartInterviewCycle);
const useOpportunitiesMock = vi.mocked(useOpportunities);

function setOpportunities() {
  useOpportunitiesMock.mockReturnValue({
    data: [
      {
        id: "op-1",
        workspace: "ws-1",
        title: "Staff Eng",
        company: "Acme",
        stage: "interview",
        notes: "",
        expected_total_compensation: null,
        compensation_currency: "",
        created_by: null,
        created_at: "2026-04-25T00:00:00Z",
        updated_at: "2026-04-25T00:00:00Z",
        archived_at: null,
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
  } as unknown as ReturnType<typeof useOpportunities>);
}

function setMutation(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useStartMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useStartInterviewCycle>);
}

describe("InterviewCycleCreate", () => {
  it("renders inputs", () => {
    setOpportunities();
    setMutation(vi.fn());
    renderWithProviders(<InterviewCycleCreate />);
    expect(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_OPPORTUNITY)).toBeVisible();
    expect(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_NAME)).toBeVisible();
    expect(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_SUBMIT)).toBeVisible();
  });

  it("submits and navigates to the new cycle detail on success", async () => {
    setOpportunities();
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce({ id: "33333333-3333-3333-3333-333333333333" });
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<InterviewCycleCreate />, {
      path: "/dashboard/interviews/new",
      initialEntries: ["/dashboard/interviews/new"],
      extraRoutes: [
        { path: "/dashboard/interviews/:cycleId", element: <p>detail placeholder</p> },
      ],
    });

    await user.selectOptions(
      screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_OPPORTUNITY),
      "op-1",
    );
    await user.type(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_NAME), "Onsite loop");
    fireEvent.submit(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_FORM));

    await screen.findByText("detail placeholder");
    expect(mutateAsync).toHaveBeenCalledWith({
      opportunity: "op-1",
      name: "Onsite loop",
    });
  });

  it("blocks submission when no opportunity selected", async () => {
    setOpportunities();
    const mutateAsync = vi.fn();
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<InterviewCycleCreate />);

    await user.type(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_NAME), "x");
    fireEvent.submit(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_FORM));

    const error = await screen.findByTestId(TestIds.INTERVIEW_CYCLE_CREATE_ERROR);
    expect(error).toHaveTextContent(/pick an opportunity/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows API error on submit failure", async () => {
    setOpportunities();
    const mutateAsync = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Server angry."), { name: "ApiError" }));
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<InterviewCycleCreate />);

    await user.selectOptions(
      screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_OPPORTUNITY),
      "op-1",
    );
    await user.type(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_NAME), "x");
    fireEvent.submit(screen.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_FORM));

    const error = await screen.findByTestId(TestIds.INTERVIEW_CYCLE_CREATE_ERROR);
    expect(error).toHaveTextContent(/server angry/i);
  });
});
