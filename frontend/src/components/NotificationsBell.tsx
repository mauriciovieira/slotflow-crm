import { useEffect, useRef, useState } from "react";
import {
  type NotificationRow,
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
} from "../lib/notificationsHooks";
import { TestIds } from "../testIds";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function describeKind(row: NotificationRow): string {
  // Lightweight kind → human phrasing. Unknown kinds fall through to
  // the raw key so a future BE-added kind doesn't render blank.
  // Each payload field is coerced to a string so a missing or
  // non-string value never reaches the UI as "undefined" / "[object
  // Object]".
  const actor = asString(row.payload.actor_repr) || "Someone";
  const title = asString(row.payload.title);
  const company = asString(row.payload.company);
  const target = title && company ? `${title} @ ${company}` : title || row.kind;
  switch (row.kind) {
    case "opportunity.created":
      return `${actor} created ${target}`;
    case "opportunity.archived":
      return `${actor} archived ${target}`;
    case "opportunity.stage_changed": {
      const from = asString(row.payload.from);
      const to = asString(row.payload.to);
      if (from && to) return `${actor} moved ${target} ${from} → ${to}`;
      if (to) return `${actor} moved ${target} → ${to}`;
      return `${actor} moved ${target}`;
    }
    case "mcp_token.issued":
      return `${actor} issued an MCP token`;
    case "mcp_token.revoked":
      return `${actor} revoked an MCP token`;
    default:
      return `${actor} · ${row.kind}`;
  }
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const countQuery = useUnreadNotificationCount();
  // List query is gated on `open` so the steady-state cost is the
  // unread-count poll alone; the list is fetched the first time the
  // panel opens (and refetched on subsequent opens via cache invalidation).
  const listQuery = useNotifications({ enabled: open });
  const markRead = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = countQuery.data?.count ?? 0;

  // Close on outside click while the panel is open.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        e.target instanceof Node &&
        !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const rows: NotificationRow[] = listQuery.data?.results ?? [];

  // Prefer the loaded list when available — if the count query is
  // mid-flight or errored but the list shows unread rows, the user
  // should still be able to clear them. Fall back to the count badge
  // (and only treat zero-unread as authoritative once the count
  // query has actually succeeded) when no list data is loaded yet.
  const listLoaded =
    !listQuery.isLoading && !listQuery.error && listQuery.data !== undefined;
  const noUnreadVisible = listLoaded
    ? rows.every((row) => row.read_at !== null)
    : countQuery.isSuccess && unread === 0;

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        data-testid={TestIds.NOTIFICATIONS_BELL}
        className="relative rounded-md border border-border-subtle px-2 py-1.5 text-sm text-ink hover:bg-surface-card"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span
            data-testid={TestIds.NOTIFICATIONS_BADGE}
            className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] rounded-full bg-danger text-white text-[10px] font-medium flex items-center justify-center px-1"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid={TestIds.NOTIFICATIONS_PANEL}
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto rounded-md border border-border-subtle bg-surface shadow-md z-10"
        >
          <header className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            <button
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || noUnreadVisible}
              data-testid={TestIds.NOTIFICATIONS_MARK_ALL_READ}
              className="text-xs text-ink-secondary hover:text-ink disabled:opacity-60"
            >
              Mark all read
            </button>
          </header>

          {listQuery.isLoading ? (
            <p
              data-testid={TestIds.NOTIFICATIONS_LOADING}
              className="px-3 py-6 text-sm text-ink-secondary"
            >
              Loading…
            </p>
          ) : listQuery.error ? (
            <div
              data-testid={TestIds.NOTIFICATIONS_ERROR}
              className="px-3 py-6 text-sm text-ink-secondary"
            >
              <p className="mb-2">Could not load notifications.</p>
              <button
                type="button"
                onClick={() => listQuery.refetch()}
                className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
              >
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <p
              data-testid={TestIds.NOTIFICATIONS_EMPTY}
              className="px-3 py-6 text-sm text-ink-secondary"
            >
              You&apos;re all caught up.
            </p>
          ) : (
            <ul
              data-testid={TestIds.NOTIFICATIONS_LIST}
              className="divide-y divide-border-subtle"
            >
              {rows.map((row) => (
                <li
                  key={row.id}
                  data-testid={`${TestIds.NOTIFICATIONS_ITEM}-${row.id}`}
                  className={`px-3 py-2 text-sm ${row.read_at ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-ink">{describeKind(row)}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {formatTimestamp(row.created_at)}
                      </p>
                    </div>
                    {!row.read_at && (
                      <button
                        type="button"
                        onClick={() => markRead.mutate([row.id])}
                        disabled={markRead.isPending}
                        data-testid={`${TestIds.NOTIFICATIONS_MARK_READ}-${row.id}`}
                        className="text-xs text-ink-secondary hover:text-ink disabled:opacity-60"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
