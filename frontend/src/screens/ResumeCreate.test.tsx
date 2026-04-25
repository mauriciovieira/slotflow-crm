import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { ResumeCreate } from "./ResumeCreate";
import { TestIds } from "../testIds";

vi.mock("../lib/resumesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/resumesHooks")>(
    "../lib/resumesHooks",
  );
  return { ...actual, useCreateResume: vi.fn() };
});

import { useCreateResume } from "../lib/resumesHooks";

const useCreateResumeMock = vi.mocked(useCreateResume);

function setMutation(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useCreateResumeMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useCreateResume>);
}

describe("ResumeCreate", () => {
  it("renders the form fields", () => {
    setMutation(vi.fn());
    renderWithProviders(<ResumeCreate />);
    expect(screen.getByTestId(TestIds.RESUME_CREATE_NAME)).toBeVisible();
    expect(screen.getByTestId(TestIds.RESUME_CREATE_SUBMIT)).toBeVisible();
  });

  it("submits and navigates to the new resume detail on success", async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValueOnce({ id: "33333333-3333-3333-3333-333333333333" });
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<ResumeCreate />, {
      path: "/dashboard/resumes/new",
      initialEntries: ["/dashboard/resumes/new"],
      extraRoutes: [
        { path: "/dashboard/resumes/:resumeId", element: <p>detail placeholder</p> },
      ],
    });

    await user.type(screen.getByTestId(TestIds.RESUME_CREATE_NAME), "Senior Eng");
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_CREATE_FORM));

    await screen.findByText("detail placeholder");
    expect(mutateAsync).toHaveBeenCalledWith({ name: "Senior Eng" });
  });

  it("shows API error when submit fails", async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("Name taken."), { name: "ApiError" }));
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<ResumeCreate />);

    await user.type(screen.getByTestId(TestIds.RESUME_CREATE_NAME), "x");
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_CREATE_FORM));

    const error = await screen.findByTestId(TestIds.RESUME_CREATE_ERROR);
    expect(error).toHaveTextContent(/name taken/i);
  });

  it("blocks whitespace-only name client-side without calling the mutation", async () => {
    const mutateAsync = vi.fn();
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<ResumeCreate />);

    // Native `required` rejects empty strings but accepts spaces; the
    // component must catch that itself and surface a friendly error.
    await user.type(screen.getByTestId(TestIds.RESUME_CREATE_NAME), "   ");
    fireEvent.submit(screen.getByTestId(TestIds.RESUME_CREATE_FORM));

    const error = await screen.findByTestId(TestIds.RESUME_CREATE_ERROR);
    expect(error).toHaveTextContent(/name is required/i);
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("cancel navigates to list without calling the mutation", async () => {
    const mutateAsync = vi.fn();
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<ResumeCreate />, {
      path: "/dashboard/resumes/new",
      initialEntries: ["/dashboard/resumes/new"],
      extraRoutes: [{ path: "/dashboard/resumes", element: <p>list placeholder</p> }],
    });
    await user.click(screen.getByTestId(TestIds.RESUME_CREATE_CANCEL));
    await screen.findByText("list placeholder");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
