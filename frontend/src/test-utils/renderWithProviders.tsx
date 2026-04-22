import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Routes, Route } from "react-router";

export interface RenderOptionsExt {
  initialEntries?: string[];
  path?: string;
  extraRoutes?: { path: string; element: ReactElement }[];
}

export function renderWithProviders(
  ui: ReactElement,
  {
    initialEntries = ["/"],
    path = "/",
    extraRoutes = [],
    ...rtlOpts
  }: RenderOptionsExt & RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={path} element={ui} />
          {extraRoutes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
    rtlOpts,
  );
  return Object.assign(result, { queryClient });
}
