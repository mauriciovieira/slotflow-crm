import { STAGE_LABEL, useStageHistory } from "../lib/opportunitiesHooks";
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
  });
}

function stageLabel(value: string): string {
  // STAGE_LABEL is keyed by the FE OpportunityStage union; the BE may
  // emit a stage we don't yet know about (e.g. after a deploy that adds
  // one). Fall back to the raw value rather than rendering "undefined".
  return (STAGE_LABEL as Record<string, string>)[value] ?? value;
}

export function OpportunityStageHistorySection({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const query = useStageHistory(opportunityId);

  return (
    <section
      data-testid={TestIds.OPPORTUNITY_STAGE_HISTORY_SECTION}
      className="mt-8 rounded-xl border border-border-subtle bg-surface-card p-6"
    >
      <h2 className="text-base font-semibold text-ink mb-4">Stage history</h2>

      {query.isLoading ? (
        <p
          data-testid={TestIds.OPPORTUNITY_STAGE_HISTORY_LOADING}
          className="text-sm text-ink-secondary"
        >
          Loading history…
        </p>
      ) : query.error ? (
        <div
          data-testid={TestIds.OPPORTUNITY_STAGE_HISTORY_ERROR}
          className="text-sm text-ink-secondary"
        >
          <p className="mb-2">Could not load stage history.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
          >
            Try again
          </button>
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <p
          data-testid={TestIds.OPPORTUNITY_STAGE_HISTORY_EMPTY}
          className="text-sm text-ink-secondary"
        >
          No stage changes yet.
        </p>
      ) : (
        <ul
          data-testid={TestIds.OPPORTUNITY_STAGE_HISTORY_LIST}
          className="divide-y divide-border-subtle text-sm"
        >
          {(query.data ?? []).map((row) => (
            <li
              key={row.id}
              data-testid={`${TestIds.OPPORTUNITY_STAGE_HISTORY_ROW}-${row.id}`}
              className="py-2 flex items-baseline justify-between gap-3"
            >
              <span className="text-ink">
                <span className="font-mono text-xs text-ink-secondary">
                  {stageLabel(row.from_stage)}
                </span>
                <span className="mx-2 text-ink-muted">→</span>
                <span className="font-medium">{stageLabel(row.to_stage)}</span>
              </span>
              <span className="text-xs text-ink-secondary whitespace-nowrap">
                {row.actor_repr} · {formatTimestamp(row.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
