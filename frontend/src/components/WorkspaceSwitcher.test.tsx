import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { TestIds } from "../testIds";

vi.mock("../lib/activeWorkspaceHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/activeWorkspaceHooks")>(
    "../lib/activeWorkspaceHooks",
  );
  return { ...actual, useActiveWorkspace: vi.fn(), useSetActiveWorkspace: vi.fn() };
});

import { useActiveWorkspace, useSetActiveWorkspace } from "../lib/activeWorkspaceHooks";

type ActiveQuery = ReturnType<typeof useActiveWorkspace>;
type SetMutation = ReturnType<typeof useSetActiveWorkspace>;

function setQuery(state: Partial<ActiveQuery>) {
  vi.mocked(useActiveWorkspace).mockReturnValue({
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
  } as unknown as ActiveQuery);
}

function setMutation(mutate: ReturnType<typeof vi.fn>, isPending = false) {
  vi.mocked(useSetActiveWorkspace).mockReturnValue({
    mutate,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as SetMutation);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("WorkspaceSwitcher", () => {
  it("renders a label when there is exactly one workspace", () => {
    setQuery({
      data: {
        active: { id: "1", name: "Acme", slug: "acme" },
        available: [{ id: "1", name: "Acme", slug: "acme" }],
      },
      isSuccess: true,
    });
    setMutation(vi.fn());
    render(
      <Providers>
        <WorkspaceSwitcher />
      </Providers>,
    );
    expect(screen.getByTestId(TestIds.WORKSPACE_SWITCHER_LABEL)).toHaveTextContent("Acme");
    expect(screen.queryByTestId(TestIds.WORKSPACE_SWITCHER_SELECT)).toBeNull();
  });

  it("renders a select with available workspaces when there are >= 2", () => {
    setQuery({
      data: {
        active: { id: "2", name: "Globex", slug: "globex" },
        available: [
          { id: "1", name: "Acme", slug: "acme" },
          { id: "2", name: "Globex", slug: "globex" },
        ],
      },
      isSuccess: true,
    });
    setMutation(vi.fn());
    render(
      <Providers>
        <WorkspaceSwitcher />
      </Providers>,
    );
    const select = screen.getByTestId(TestIds.WORKSPACE_SWITCHER_SELECT) as HTMLSelectElement;
    expect(select.value).toBe("2");
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((o) => o.textContent)).toEqual(["Acme", "Globex"]);
  });

  it("calls the set mutation with the selected workspace id", () => {
    const mutate = vi.fn();
    setQuery({
      data: {
        active: { id: "1", name: "Acme", slug: "acme" },
        available: [
          { id: "1", name: "Acme", slug: "acme" },
          { id: "2", name: "Globex", slug: "globex" },
        ],
      },
      isSuccess: true,
    });
    setMutation(mutate);
    render(
      <Providers>
        <WorkspaceSwitcher />
      </Providers>,
    );
    fireEvent.change(screen.getByTestId(TestIds.WORKSPACE_SWITCHER_SELECT), {
      target: { value: "2" },
    });
    expect(mutate).toHaveBeenCalledWith("2");
  });

  it("disables the select while the mutation is pending", () => {
    setQuery({
      data: {
        active: { id: "1", name: "Acme", slug: "acme" },
        available: [
          { id: "1", name: "Acme", slug: "acme" },
          { id: "2", name: "Globex", slug: "globex" },
        ],
      },
      isSuccess: true,
    });
    setMutation(vi.fn(), true);
    render(
      <Providers>
        <WorkspaceSwitcher />
      </Providers>,
    );
    const select = screen.getByTestId(TestIds.WORKSPACE_SWITCHER_SELECT) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});
