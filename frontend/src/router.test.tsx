import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { Navigate, RouterProvider, createMemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthGuard } from "./components/AuthGuard";
import { DashboardLayout } from "./components/DashboardLayout";
import { StubPanel } from "./components/StubPanel";
import { DASHBOARD_NAV } from "./dashboardNav";
import type { Me } from "./lib/authHooks";
import { TestIds } from "./testIds";

vi.mock("./lib/authHooks", async () => {
  const actual = await vi.importActual<typeof import("./lib/authHooks")>("./lib/authHooks");
  return { ...actual, useMe: vi.fn(), useLogout: vi.fn() };
});

import { useLogout, useMe } from "./lib/authHooks";

function seedVerified() {
  vi.mocked(useMe).mockReturnValue({
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
  vi.mocked(useLogout).mockReturnValue({
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

function buildRouter(initial: string) {
  return createMemoryRouter(
    [
      {
        path: "/dashboard",
        element: (
          <AuthGuard>
            <DashboardLayout />
          </AuthGuard>
        ),
        children: [
          { index: true, element: <Navigate to="opportunities" replace /> },
          ...DASHBOARD_NAV.map((item) => ({
            path: item.slug,
            element: <StubPanel title={item.label} />,
          })),
        ],
      },
    ],
    { initialEntries: [initial] },
  );
}

describe("router — /dashboard branch", () => {
  it("redirects /dashboard index to /dashboard/opportunities", async () => {
    seedVerified();
    const router = buildRouter("/dashboard");
    const rtl = await import("@testing-library/react");
    rtl.render(
      <Providers>
        <RouterProvider router={router} />
      </Providers>,
    );
    const title = await rtl.screen.findByTestId(TestIds.STUB_PANEL_TITLE);
    expect(title).toHaveTextContent("Opportunities");
    expect(router.state.location.pathname).toBe("/dashboard/opportunities");
  });

  it("mounts the Resumes stub at /dashboard/resumes", async () => {
    seedVerified();
    const router = buildRouter("/dashboard/resumes");
    const rtl = await import("@testing-library/react");
    rtl.render(
      <Providers>
        <RouterProvider router={router} />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.STUB_PANEL_TITLE)).toHaveTextContent("Resumes");
  });
});
