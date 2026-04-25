import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { Settings } from "./Settings";
import type { FxRate } from "../lib/fxRatesHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/activeWorkspaceHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/activeWorkspaceHooks")>(
    "../lib/activeWorkspaceHooks",
  );
  return { ...actual, useActiveWorkspace: vi.fn() };
});

vi.mock("../lib/fxRatesHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/fxRatesHooks")>(
    "../lib/fxRatesHooks",
  );
  return {
    ...actual,
    useFxRates: vi.fn(),
    useUpsertFxRate: vi.fn(),
    useDeleteFxRate: vi.fn(),
  };
});

import { useActiveWorkspace } from "../lib/activeWorkspaceHooks";
import {
  useDeleteFxRate,
  useFxRates,
  useUpsertFxRate,
} from "../lib/fxRatesHooks";

const useActiveMock = vi.mocked(useActiveWorkspace);
const useFxRatesMock = vi.mocked(useFxRates);
const useUpsertMock = vi.mocked(useUpsertFxRate);
const useDeleteMock = vi.mocked(useDeleteFxRate);

const WS_ID = "ws-1";

function rateFixture(overrides: Partial<FxRate> = {}): FxRate {
  return {
    id: "fx-1",
    workspace: WS_ID,
    currency: "EUR",
    base_currency: "USD",
    rate: "0.92000000",
    date: "2026-01-01",
    source: "manual",
    created_by: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function setActive() {
  useActiveMock.mockReturnValue({
    data: { active: { id: WS_ID, name: "W", slug: "w" }, available: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: "success",
  } as unknown as ReturnType<typeof useActiveWorkspace>);
}

function setRates(state: Partial<ReturnType<typeof useFxRates>>) {
  useFxRatesMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useFxRates>);
}

function setUpsert(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useUpsertMock.mockReturnValue({
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useUpsertFxRate>);
}

function setDelete(mutateAsync: ReturnType<typeof vi.fn>, isPending = false) {
  useDeleteMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync,
    isPending,
    isError: false,
    isSuccess: false,
    isIdle: !isPending,
    status: isPending ? "pending" : "idle",
  } as unknown as ReturnType<typeof useDeleteFxRate>);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderSettings() {
  return render(
    <Providers>
      <Settings />
    </Providers>,
  );
}

describe("Settings → FX rates", () => {
  it("renders empty state with the form available", () => {
    setActive();
    setRates({ data: [], isSuccess: true, status: "success" });
    setUpsert(vi.fn());
    setDelete(vi.fn());
    renderSettings();
    expect(screen.getByTestId(TestIds.SETTINGS_FX_EMPTY)).toBeVisible();
    expect(screen.getByTestId(TestIds.SETTINGS_FX_FORM)).toBeVisible();
  });

  it("renders rate rows", () => {
    setActive();
    setRates({
      data: [rateFixture(), rateFixture({ id: "fx-2", currency: "GBP", rate: "0.79" })],
      isSuccess: true,
      status: "success",
    });
    setUpsert(vi.fn());
    setDelete(vi.fn());
    renderSettings();
    expect(screen.getByTestId(TestIds.SETTINGS_FX_LIST)).toBeVisible();
    expect(screen.getByTestId(`${TestIds.SETTINGS_FX_ROW}-fx-1`)).toHaveTextContent(
      /EUR/,
    );
    expect(screen.getByTestId(`${TestIds.SETTINGS_FX_ROW}-fx-2`)).toHaveTextContent(
      /GBP/,
    );
  });

  it("submits the upsert form with uppercased currency codes", async () => {
    setActive();
    setRates({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn().mockResolvedValueOnce(rateFixture());
    setUpsert(mutateAsync);
    setDelete(vi.fn());
    const user = userEvent.setup();
    renderSettings();

    await user.type(screen.getByTestId(TestIds.SETTINGS_FX_FORM_CURRENCY), "eur");
    await user.type(screen.getByTestId(TestIds.SETTINGS_FX_FORM_RATE), "0.92");
    fireEvent.submit(screen.getByTestId(TestIds.SETTINGS_FX_FORM));

    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: WS_ID,
        currency: "EUR",
        base_currency: "USD",
        rate: "0.92",
      }),
    );
  });

  it("blocks submit when currency is empty", async () => {
    setActive();
    setRates({ data: [], isSuccess: true, status: "success" });
    const mutateAsync = vi.fn();
    setUpsert(mutateAsync);
    setDelete(vi.fn());
    const user = userEvent.setup();
    renderSettings();

    await user.type(screen.getByTestId(TestIds.SETTINGS_FX_FORM_RATE), "0.92");
    fireEvent.submit(screen.getByTestId(TestIds.SETTINGS_FX_FORM));
    expect(await screen.findByTestId(TestIds.SETTINGS_FX_FORM_ERROR)).toHaveTextContent(
      /currency is required/i,
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("hides delete button on non-manual rows", () => {
    setActive();
    setRates({
      data: [rateFixture({ source: "task" })],
      isSuccess: true,
      status: "success",
    });
    setUpsert(vi.fn());
    setDelete(vi.fn());
    renderSettings();
    expect(
      screen.queryByTestId(`${TestIds.SETTINGS_FX_DELETE}-fx-1`),
    ).toBeNull();
  });

  it("delete fires only after inline confirm", async () => {
    setActive();
    setRates({ data: [rateFixture()], isSuccess: true, status: "success" });
    setUpsert(vi.fn());
    const mutateAsync = vi.fn().mockResolvedValueOnce(null);
    setDelete(mutateAsync);
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByTestId(`${TestIds.SETTINGS_FX_DELETE}-fx-1`));
    expect(mutateAsync).not.toHaveBeenCalled();
    await user.click(
      screen.getByTestId(`${TestIds.SETTINGS_FX_DELETE_CONFIRM}-fx-1`),
    );
    await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });
});
