import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { routes } from "./router";
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

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router };
}

describe("router — /dashboard branch", () => {
  it("redirects /dashboard index to /dashboard/opportunities", async () => {
    seedVerified();
    const { router } = renderAt("/dashboard");
    const rtl = await import("@testing-library/react");
    rtl.render(
      <Providers>
        <RouterProvider router={router} />
      </Providers>,
    );
    // The opportunities route mounts the real list view; without an API mock
    // it shows loading or error, but the dashboard layout/header is a
    // deterministic anchor that confirms navigation completed. Wait on the
    // header so the index→/opportunities <Navigate> has time to resolve
    // before we check the pathname.
    const header = await rtl.screen.findByTestId(TestIds.DASHBOARD_HEADER);
    await rtl.waitFor(() => {
      expect(router.state.location.pathname).toBe("/dashboard/opportunities");
    });
    expect(header).toHaveTextContent("Opportunities");
  });

  it("mounts the Resumes stub at /dashboard/resumes with a matching header title", async () => {
    seedVerified();
    const { router } = renderAt("/dashboard/resumes");
    const rtl = await import("@testing-library/react");
    rtl.render(
      <Providers>
        <RouterProvider router={router} />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.STUB_PANEL)).toBeVisible();
    expect(screen.getByTestId(TestIds.DASHBOARD_HEADER)).toHaveTextContent("Resumes");
  });
});
