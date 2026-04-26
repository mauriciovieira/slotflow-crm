import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { NotificationsBell } from "./NotificationsBell";
import type { NotificationRow } from "../lib/notificationsHooks";
import { TestIds } from "../testIds";

vi.mock("../lib/notificationsHooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/notificationsHooks")>(
    "../lib/notificationsHooks",
  );
  return {
    ...actual,
    useNotifications: vi.fn(),
    useUnreadNotificationCount: vi.fn(),
    useMarkNotificationsRead: vi.fn(),
    useMarkAllNotificationsRead: vi.fn(),
  };
});

import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
} from "../lib/notificationsHooks";

const useListMock = vi.mocked(useNotifications);
const useCountMock = vi.mocked(useUnreadNotificationCount);
const useMarkReadMock = vi.mocked(useMarkNotificationsRead);
const useMarkAllMock = vi.mocked(useMarkAllNotificationsRead);

function rowFixture(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: "n-1",
    kind: "opportunity.archived",
    payload: {
      actor_repr: "alice",
      title: "Senior Eng",
      company: "Acme",
    },
    workspace: "ws-1",
    read_at: null,
    created_at: "2026-04-25T10:00:00Z",
    ...overrides,
  };
}

function setList(state: Partial<ReturnType<typeof useNotifications>>) {
  useListMock.mockReturnValue({
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
  } as unknown as ReturnType<typeof useNotifications>);
}

function setCount(count: number) {
  useCountMock.mockReturnValue({
    data: { count },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    isError: false,
    isSuccess: true,
    status: "success",
  } as unknown as ReturnType<typeof useUnreadNotificationCount>);
}

function setMarkRead(mutate: ReturnType<typeof vi.fn>) {
  useMarkReadMock.mockReturnValue({
    mutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: "idle",
  } as unknown as ReturnType<typeof useMarkNotificationsRead>);
}

function setMarkAll(mutate: ReturnType<typeof vi.fn>) {
  useMarkAllMock.mockReturnValue({
    mutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: "idle",
  } as unknown as ReturnType<typeof useMarkAllNotificationsRead>);
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderBell() {
  return render(
    <Providers>
      <NotificationsBell />
    </Providers>,
  );
}

describe("NotificationsBell", () => {
  beforeEach(() => {
    useListMock.mockReset();
    useCountMock.mockReset();
    useMarkReadMock.mockReset();
    useMarkAllMock.mockReset();
  });

  it("hides the badge when unread count is zero", () => {
    setCount(0);
    setList({ data: { count: 0, next: null, previous: null, results: [] } });
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    renderBell();
    expect(screen.queryByTestId(TestIds.NOTIFICATIONS_BADGE)).toBeNull();
  });

  it("shows the badge with the unread count", () => {
    setCount(3);
    setList({});
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    renderBell();
    expect(screen.getByTestId(TestIds.NOTIFICATIONS_BADGE)).toHaveTextContent("3");
  });

  it("clamps the badge to 99+ when over a hundred unread", () => {
    setCount(150);
    setList({});
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    renderBell();
    expect(screen.getByTestId(TestIds.NOTIFICATIONS_BADGE)).toHaveTextContent("99+");
  });

  it("opens the panel on bell click and renders rows", async () => {
    setCount(1);
    setList({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [rowFixture()],
      },
      isSuccess: true,
      status: "success",
    });
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    expect(screen.getByTestId(TestIds.NOTIFICATIONS_PANEL)).toBeVisible();
    expect(screen.getByTestId(`${TestIds.NOTIFICATIONS_ITEM}-n-1`))
      .toHaveTextContent("alice archived Senior Eng @ Acme");
  });

  it("renders the empty state when there are no rows", async () => {
    setCount(0);
    setList({
      data: { count: 0, next: null, previous: null, results: [] },
      isSuccess: true,
      status: "success",
    });
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    expect(screen.getByTestId(TestIds.NOTIFICATIONS_EMPTY)).toBeVisible();
  });

  it("Mark read on a row fires the mutation with that id", async () => {
    setCount(1);
    setList({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [rowFixture()],
      },
      isSuccess: true,
      status: "success",
    });
    const mutate = vi.fn();
    setMarkRead(mutate);
    setMarkAll(vi.fn());
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    await user.click(screen.getByTestId(`${TestIds.NOTIFICATIONS_MARK_READ}-n-1`));
    expect(mutate).toHaveBeenCalledWith(["n-1"]);
  });

  it("Mark all read fires when there's at least one unread row", async () => {
    setCount(2);
    setList({
      data: {
        count: 2,
        next: null,
        previous: null,
        results: [rowFixture(), rowFixture({ id: "n-2" })],
      },
      isSuccess: true,
      status: "success",
    });
    setMarkRead(vi.fn());
    const mutate = vi.fn();
    setMarkAll(mutate);
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_MARK_ALL_READ));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("falls back gracefully when stage_changed payload misses from/to", async () => {
    setCount(1);
    setList({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          rowFixture({
            id: "n-stage",
            kind: "opportunity.stage_changed",
            payload: { actor_repr: "alice", title: "T", company: "C" },
          }),
        ],
      },
      isSuccess: true,
      status: "success",
    });
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    const item = screen.getByTestId(`${TestIds.NOTIFICATIONS_ITEM}-n-stage`);
    expect(item).not.toHaveTextContent("undefined");
    expect(item).not.toHaveTextContent("[object Object]");
    expect(item).toHaveTextContent("alice moved T @ C");
  });

  it("only fetches the list when the panel is open", async () => {
    setCount(0);
    setList({
      data: { count: 0, next: null, previous: null, results: [] },
      isSuccess: true,
      status: "success",
    });
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    const user = userEvent.setup();
    renderBell();

    expect(useListMock).toHaveBeenCalled();
    const initialCall = useListMock.mock.calls.at(-1);
    expect(initialCall?.[0]).toEqual({ enabled: false });

    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    const openCall = useListMock.mock.calls.at(-1);
    expect(openCall?.[0]).toEqual({ enabled: true });
  });

  it("keeps Mark all read enabled when count query is loading but list shows unread", async () => {
    // Count query loading (no count yet); list returns one unread row.
    useCountMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      isFetching: true,
      isError: false,
      isSuccess: false,
      status: "pending",
    } as unknown as ReturnType<typeof useUnreadNotificationCount>);
    setList({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [rowFixture()],
      },
      isSuccess: true,
      status: "success",
    });
    setMarkRead(vi.fn());
    setMarkAll(vi.fn());
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    expect(screen.getByTestId(TestIds.NOTIFICATIONS_MARK_ALL_READ)).not.toBeDisabled();
  });

  it("Mark all read is disabled when nothing is unread", async () => {
    setCount(0);
    setList({
      data: { count: 0, next: null, previous: null, results: [] },
      isSuccess: true,
      status: "success",
    });
    setMarkRead(vi.fn());
    const mutate = vi.fn();
    setMarkAll(mutate);
    const user = userEvent.setup();
    renderBell();
    await user.click(screen.getByTestId(TestIds.NOTIFICATIONS_BELL));
    expect(screen.getByTestId(TestIds.NOTIFICATIONS_MARK_ALL_READ)).toBeDisabled();
  });
});
