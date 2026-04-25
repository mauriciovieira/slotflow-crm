import { useState } from "react";
import { useActiveWorkspace } from "../lib/activeWorkspaceHooks";
import { type AuditEvent, useAuditEvents } from "../lib/auditEventsHooks";
import { TestIds } from "../testIds";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function MetadataCell({ row }: { row: AuditEvent }) {
  const isEmpty = !row.metadata || Object.keys(row.metadata).length === 0;
  if (isEmpty) {
    return <span className="text-xs text-ink-muted">—</span>;
  }
  return (
    <details>
      <summary
        data-testid={`${TestIds.AUDIT_METADATA_EXPAND}-${row.id}`}
        className="cursor-pointer text-xs text-ink-secondary"
      >
        {Object.keys(row.metadata).length} keys
      </summary>
      <pre
        data-testid={`${TestIds.AUDIT_METADATA_BODY}-${row.id}`}
        className="mt-1 text-xs text-ink-secondary whitespace-pre-wrap break-words font-mono"
      >
        {JSON.stringify(row.metadata, null, 2)}
      </pre>
    </details>
  );
}

export function AuditLog() {
  const activeQuery = useActiveWorkspace();
  const workspaceId = activeQuery.data?.active?.id ?? "";
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");

  const query = useAuditEvents({
    workspaceId: workspaceId || undefined,
    action,
    entityType,
    entityId,
  });

  const rows: AuditEvent[] = (query.data?.pages ?? []).flatMap(
    (page) => page.results,
  );

  function clearFilters() {
    setAction("");
    setEntityType("");
    setEntityId("");
  }

  return (
    <section
      data-testid={TestIds.AUDIT_SECTION}
      className="px-6 py-6 max-w-6xl mx-auto"
    >
      <header className="mb-6">
        <h1 className="text-page-title text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Read-only history of security-sensitive activity in this workspace.
          Owner-only.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1 block">Action</span>
          <input
            type="text"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            data-testid={TestIds.AUDIT_FILTER_ACTION}
            placeholder="mcp_token.issued"
            className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1 block">Entity type</span>
          <input
            type="text"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            data-testid={TestIds.AUDIT_FILTER_ENTITY_TYPE}
            placeholder="opportunities.Opportunity"
            className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1 block">Entity id</span>
          <input
            type="text"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            data-testid={TestIds.AUDIT_FILTER_ENTITY_ID}
            placeholder="42"
            className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          />
        </label>
      </div>
      <div className="mb-4">
        <button
          type="button"
          onClick={clearFilters}
          data-testid={TestIds.AUDIT_FILTER_CLEAR}
          className="text-xs text-ink-secondary hover:text-ink"
        >
          Clear filters
        </button>
      </div>

      {query.isLoading ? (
        <p data-testid={TestIds.AUDIT_LOADING} className="text-sm text-ink-secondary">
          Loading audit events…
        </p>
      ) : query.error ? (
        <div data-testid={TestIds.AUDIT_ERROR} className="text-sm text-ink-secondary">
          <p className="mb-2">Could not load audit events.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p data-testid={TestIds.AUDIT_EMPTY} className="text-sm text-ink-secondary">
          No audit events yet.
        </p>
      ) : (
        <>
          <table
            data-testid={TestIds.AUDIT_TABLE}
            className="w-full border border-border-subtle rounded-lg overflow-hidden text-sm"
          >
            <thead className="bg-surface text-ink-secondary text-left">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Entity</th>
                <th className="px-3 py-2 font-medium">Correlation</th>
                <th className="px-3 py-2 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`${TestIds.AUDIT_ROW}-${row.id}`}
                  className="border-t border-border-subtle align-top"
                >
                  <td className="px-3 py-2 text-ink-secondary whitespace-nowrap">
                    {formatTimestamp(row.created_at)}
                  </td>
                  <td className="px-3 py-2 text-ink font-medium">{row.actor_repr}</td>
                  <td className="px-3 py-2 text-ink font-mono text-xs">{row.action}</td>
                  <td className="px-3 py-2 text-ink-secondary text-xs">
                    {row.entity_type ? (
                      <>
                        <span className="font-mono">{row.entity_type}</span>
                        {row.entity_id && (
                          <span className="ml-1 text-ink-muted">#{row.entity_id}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-muted font-mono text-xs">
                    {row.correlation_id || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <MetadataCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {query.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                data-testid={TestIds.AUDIT_LOAD_MORE}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card disabled:opacity-60"
              >
                {query.isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
