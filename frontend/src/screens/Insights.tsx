import { useState } from "react";
import { useActiveWorkspace } from "../lib/activeWorkspaceHooks";
import {
  type CompensationLineItem,
  type SkippedOpportunity,
  useCompensationSnapshot,
} from "../lib/insightsHooks";
import { STAGE_LABEL, type OpportunityStage } from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

function todayIso(): string {
  // Local timezone — same reasoning as Settings: avoid UTC-induced
  // off-by-one near local midnight.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatAmount(raw: string, currency: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${raw} ${currency}`;
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

const SKIPPED_REASON_LABEL: Record<string, string> = {
  "missing-comp-fields": "Missing compensation fields",
  "fx-rate-missing": "No FX rate on or before this date",
};

export function Insights() {
  const activeQuery = useActiveWorkspace();
  const workspaceId = activeQuery.data?.active?.id ?? "";
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(todayIso());

  const snapshotQuery = useCompensationSnapshot({
    workspaceId: workspaceId || undefined,
    currency,
    date,
  });

  return (
    <section
      data-testid={TestIds.INSIGHTS_SECTION}
      className="px-6 py-6 max-w-4xl mx-auto"
    >
      <header className="mb-6">
        <h1 className="text-page-title text-ink">Insights</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Compensation snapshot across active opportunities, converted via your
          stored FX rates.
        </p>
      </header>

      <div className="rounded-xl border border-border-subtle bg-surface-card p-6 mb-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="block">
            <span className="text-xs text-ink-secondary mb-1 block">Currency</span>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              data-testid={TestIds.INSIGHTS_CURRENCY_INPUT}
              className="w-24 border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-secondary mb-1 block">As of</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid={TestIds.INSIGHTS_DATE_INPUT}
              className="border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
            />
          </label>
        </div>

        {!workspaceId && activeQuery.isLoading && (
          <p className="text-sm text-ink-secondary">Loading workspace…</p>
        )}
        {!workspaceId && !activeQuery.isLoading && (
          <p className="text-sm text-ink-secondary">
            Pick an active workspace to compute a snapshot.
          </p>
        )}

        {workspaceId && (
          <>
            {snapshotQuery.isLoading ? (
              <p
                data-testid={TestIds.INSIGHTS_LOADING}
                className="text-sm text-ink-secondary"
              >
                Computing snapshot…
              </p>
            ) : snapshotQuery.error ? (
              <div data-testid={TestIds.INSIGHTS_ERROR} className="text-sm text-ink-secondary">
                <p className="mb-2">Could not load snapshot.</p>
                <button
                  type="button"
                  onClick={() => snapshotQuery.refetch()}
                  className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
                >
                  Try again
                </button>
              </div>
            ) : snapshotQuery.data ? (
              <SnapshotBody snapshot={snapshotQuery.data} />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function SnapshotBody({
  snapshot,
}: {
  snapshot: import("../lib/insightsHooks").CompensationSnapshot;
}) {
  const totalText = formatAmount(snapshot.total, snapshot.target_currency);
  const empty = snapshot.line_items.length === 0 && snapshot.skipped.length === 0;
  if (empty) {
    return (
      <p data-testid={TestIds.INSIGHTS_EMPTY} className="text-sm text-ink-secondary">
        No active opportunities yet.
      </p>
    );
  }
  return (
    <>
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-ink-muted font-mono">
          Expected total
        </p>
        <p
          data-testid={TestIds.INSIGHTS_TOTAL}
          className="text-3xl font-semibold text-ink mt-1"
        >
          {totalText}
        </p>
      </div>
      {snapshot.line_items.length > 0 && (
        <table
          data-testid={TestIds.INSIGHTS_LINE_ITEMS}
          className="w-full border border-border-subtle rounded-lg overflow-hidden text-sm mb-6"
        >
          <thead className="bg-surface text-ink-secondary text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium text-right">Source</th>
              <th className="px-3 py-2 font-medium text-right">Converted</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.line_items.map((item: CompensationLineItem) => (
              <tr
                key={item.opportunity_id}
                data-testid={`${TestIds.INSIGHTS_LINE_ITEM}-${item.opportunity_id}`}
                className="border-t border-border-subtle"
              >
                <td className="px-3 py-2 text-ink font-medium">{item.title}</td>
                <td className="px-3 py-2 text-ink-secondary">{item.company}</td>
                <td className="px-3 py-2 text-ink-secondary">
                  {STAGE_LABEL[item.stage as OpportunityStage] ?? item.stage}
                </td>
                <td className="px-3 py-2 text-ink-secondary text-right">
                  {formatAmount(item.source_amount, item.source_currency)}
                </td>
                <td className="px-3 py-2 text-ink text-right">
                  {formatAmount(item.converted_amount, snapshot.target_currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {snapshot.skipped.length > 0 && (
        <details data-testid={TestIds.INSIGHTS_SKIPPED} className="mt-2">
          <summary className="text-sm text-ink-secondary cursor-pointer">
            {snapshot.skipped.length} skipped — click to expand
          </summary>
          <ul className="mt-2 divide-y divide-border-subtle">
            {snapshot.skipped.map((item: SkippedOpportunity) => (
              <li
                key={item.opportunity_id}
                data-testid={`${TestIds.INSIGHTS_SKIPPED_ITEM}-${item.opportunity_id}`}
                className="py-2 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-ink">
                  {item.title} <span className="text-ink-secondary">— {item.company}</span>
                </span>
                <span className="text-xs text-ink-muted font-mono">
                  {SKIPPED_REASON_LABEL[item.reason] ?? item.reason}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
