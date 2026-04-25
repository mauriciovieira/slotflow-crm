import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { DashboardLayout } from "./DashboardLayout";
import type { Me } from "../lib/authHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/authHooks")>("../lib/authHooks");
  return { ...actual, useMe: vi.fn(), useLogout: vi.fn() };
});

import { useLogout, useMe } from "../lib/authHooks";

const useMeMock = vi.mocked(useMe);
const useLogoutMock = vi.mocked(useLogout);

function seed() {
  useMeMock.mockReturnValue({
    data: { authenticated: true, username: "e2e", has_totp_device: true, is_verified: true } as Me,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: "success",
  } as unknown as ReturnType<typeof useMe>);
  useLogoutMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: "idle",
  } as unknown as ReturnType<typeof useLogout>);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mountAt(path: string) {
  seed();
  const router = createMemoryRouter(
    [
      {
        path: "/dashboard",
        element: <DashboardLayout />,
        children: [
          { path: "opportunities", element: <p>OPP-CONTENT</p> },
          { path: "resumes", element: <p>RES-CONTENT</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return { router: <RouterProvider router={router} /> };
}

describe("DashboardLayout", () => {
  it("shows the nav label as the header title based on the current route", async () => {
    const { router } = mountAt("/dashboard/resumes");
    const rtl = await import("@testing-library/react");
    rtl.render(<Providers>{router}</Providers>);
    const header = screen.getByTestId(TestIds.DASHBOARD_HEADER);
    expect(header).toHaveTextContent("Resumes");
  });

  it("renders sidebar + header + outlet together", async () => {
    const { router } = mountAt("/dashboard/opportunities");
    const rtl = await import("@testing-library/react");
    rtl.render(<Providers>{router}</Providers>);
    expect(screen.getByTestId(TestIds.DASHBOARD_SIDEBAR)).toBeVisible();
    expect(screen.getByTestId(TestIds.DASHBOARD_HEADER)).toBeVisible();
    expect(screen.getByText("OPP-CONTENT")).toBeVisible();
  });
});
