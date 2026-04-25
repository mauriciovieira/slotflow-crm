import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test-utils/renderWithProviders";
import { OpportunityCreate } from "./OpportunityCreate";
import { TestIds } from "../testIds";

vi.mock("../lib/opportunitiesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/opportunitiesHooks")>(
    "../lib/opportunitiesHooks",
  );
  return { ...actual, useCreateOpportunity: vi.fn() };
});

import { useCreateOpportunity } from "../lib/opportunitiesHooks";

const useCreateOpportunityMock = vi.mocked(useCreateOpportunity);

function setMutation(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useCreateOpportunityMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useCreateOpportunity>);
}

describe("OpportunityCreate", () => {
  it("renders the title, company, notes inputs and a submit button", () => {
    setMutation(vi.fn());
    renderWithProviders(<OpportunityCreate />);
    expect(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE)).toBeVisible();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY)).toBeVisible();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_NOTES)).toBeVisible();
    expect(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_SUBMIT)).toBeVisible();
  });

  it("submits with the typed values and navigates to the list on success", async () => {
    const mutateAsync = vi.fn().mockResolvedValueOnce({});
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<OpportunityCreate />, {
      path: "/dashboard/opportunities/new",
      initialEntries: ["/dashboard/opportunities/new"],
      extraRoutes: [
        { path: "/dashboard/opportunities", element: <p>list placeholder</p> },
      ],
    });

    await user.type(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE), "Staff Engineer");
    await user.type(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY), "Acme");
    await user.type(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_NOTES), "intro call");

    fireEvent.submit(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_FORM));

    await screen.findByText("list placeholder");
    expect(mutateAsync).toHaveBeenCalledWith({
      title: "Staff Engineer",
      company: "Acme",
      notes: "intro call",
    });
  });

  it("shows the error returned by the mutation when the API rejects", async () => {
    const mutateAsync = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error("Workspace required."), { name: "ApiError", status: 400 }),
    );
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<OpportunityCreate />);

    await user.type(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE), "x");
    await user.type(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY), "y");
    fireEvent.submit(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_FORM));

    const error = await screen.findByTestId(TestIds.OPPORTUNITY_CREATE_ERROR);
    expect(error).toHaveTextContent(/workspace required/i);
  });

  it("Cancel navigates to the list without calling the mutation", async () => {
    const mutateAsync = vi.fn();
    setMutation(mutateAsync);
    const user = userEvent.setup();
    renderWithProviders(<OpportunityCreate />, {
      path: "/dashboard/opportunities/new",
      initialEntries: ["/dashboard/opportunities/new"],
      extraRoutes: [
        { path: "/dashboard/opportunities", element: <p>list placeholder</p> },
      ],
    });

    await user.click(screen.getByTestId(TestIds.OPPORTUNITY_CREATE_CANCEL));
    await screen.findByText("list placeholder");
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
