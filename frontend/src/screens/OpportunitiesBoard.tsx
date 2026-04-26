import { type DragEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  OPPORTUNITIES_KEY,
  STAGES,
  STAGE_LABEL,
  type Opportunity,
  type OpportunityStage,
  useOpportunities,
  useUpdateOpportunity,
} from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

const TOGGLE_BTN =
  "rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card";
const TOGGLE_BTN_ACTIVE =
  "rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium";

const DRAG_MIME = "application/x-opportunity-id";

const STAGE_PILL: Record<OpportunityStage, string> = {
  applied: "bg-brand-light text-ink-secondary",
  screening: "bg-blue-100 text-blue-800",
  interview: "bg-brand text-white",
  offer: "bg-brand-deep text-white",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-200 text-ink-secondary",
};

function useEffectOnce(fn: () => void) {
  // One-shot effect helper. Keeps DropMutator's mutation from re-firing
  // if React 18 strict mode double-invokes the effect.
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    fn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function Card({ opp }: { opp: Opportunity }) {
  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData(DRAG_MIME, opp.id);
    e.dataTransfer.effectAllowed = "move";
  }
  return (
    <div
      draggable
      onDragStart={handleDragStart}
      data-testid={`${TestIds.OPPORTUNITIES_BOARD_CARD}-${opp.id}`}
      className="rounded-md border border-border-subtle bg-surface p-3 mb-2 cursor-move"
    >
      <Link
        to={`/dashboard/opportunities/${opp.id}`}
        className="text-sm font-medium text-ink hover:text-brand-deep hover:underline"
      >
        {opp.title}
      </Link>
      <div className="text-xs text-ink-secondary mt-1">{opp.company}</div>
    </div>
  );
}

function Column({
  stage,
  opps,
  onDropToStage,
}: {
  stage: OpportunityStage;
  opps: Opportunity[];
  onDropToStage: (id: string, target: OpportunityStage) => void;
}) {
  const [over, setOver] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    // Required for the drop event to fire on this target.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!over) setOver(true);
  }
  function handleDragLeave() {
    setOver(false);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (id) onDropToStage(id, stage);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid={`${TestIds.OPPORTUNITIES_BOARD_COLUMN}-${stage}`}
      className={`flex flex-col rounded-lg border border-border-subtle bg-surface-card p-3 min-h-[12rem] ${over ? "ring-2 ring-brand" : ""}`}
    >
      <header className="flex items-center justify-between mb-2">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_PILL[stage]}`}
        >
          {STAGE_LABEL[stage]}
        </span>
        <span className="text-xs text-ink-muted">{opps.length}</span>
      </header>
      <div className="flex-1">
        {opps.map((o) => (
          <Card key={o.id} opp={o} />
        ))}
      </div>
    </div>
  );
}

function DropMutator({
  id,
  stage,
  onError,
  onDone,
}: {
  id: string;
  stage: OpportunityStage;
  onError: () => void;
  onDone: () => void;
}) {
  // `useUpdateOpportunity` binds a query-client mutation to a fixed id
  // at hook-creation time. We mount this child once per drag and let it
  // unmount after the mutation settles, which is cheaper than threading
  // an imperative mutation API through the parent.
  const update = useUpdateOpportunity(id);
  useEffectOnce(() => {
    update
      .mutateAsync({ stage })
      .catch(() => onError())
      .finally(() => onDone());
  });
  return null;
}

export function OpportunitiesBoard() {
  const query = useOpportunities();
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ id: string; stage: OpportunityStage } | null>(null);

  function handleDropToStage(id: string, target: OpportunityStage) {
    // Optimistic: rewrite the cached row so the card hops to the new
    // column before the PATCH lands. On error we invalidate to pull the
    // server's truth back. On success the mutation's `onSuccess` already
    // invalidates the list, so the optimistic write is a smooth bridge.
    qc.setQueryData<Opportunity[]>(OPPORTUNITIES_KEY, (prev) => {
      if (!prev) return prev;
      return prev.map((row) => (row.id === id ? { ...row, stage: target } : row));
    });
    setPending({ id, stage: target });
  }

  function handleSettleError() {
    qc.invalidateQueries({ queryKey: OPPORTUNITIES_KEY });
  }
  function handleSettleDone() {
    setPending(null);
  }

  if (query.isLoading) {
    return (
      <section className="px-6 py-6 max-w-6xl mx-auto">
        <p
          data-testid={TestIds.OPPORTUNITIES_BOARD_LOADING}
          className="text-sm text-ink-secondary"
        >
          Loading board…
        </p>
      </section>
    );
  }
  if (query.error) {
    return (
      <section className="px-6 py-6 max-w-6xl mx-auto">
        <div
          data-testid={TestIds.OPPORTUNITIES_BOARD_ERROR}
          className="text-sm text-ink-secondary"
        >
          <p className="mb-2">Could not load opportunities.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const rows: Opportunity[] = query.data ?? [];
  const byStage: Record<OpportunityStage, Opportunity[]> = {
    applied: [],
    screening: [],
    interview: [],
    offer: [],
    rejected: [],
    withdrawn: [],
  };
  for (const o of rows) byStage[o.stage].push(o);

  return (
    <section
      data-testid={TestIds.OPPORTUNITIES_BOARD}
      className="px-6 py-6 max-w-7xl mx-auto"
    >
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-page-title text-ink">Opportunities</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Drag cards between stages to update their status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/opportunities"
            data-testid={TestIds.OPPORTUNITIES_VIEW_TOGGLE_TABLE}
            className={TOGGLE_BTN}
          >
            Table
          </Link>
          <span
            data-testid={TestIds.OPPORTUNITIES_VIEW_TOGGLE_BOARD}
            className={TOGGLE_BTN_ACTIVE}
          >
            Board
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            opps={byStage[stage]}
            onDropToStage={handleDropToStage}
          />
        ))}
      </div>

      {pending && (
        <DropMutator
          key={`${pending.id}-${pending.stage}`}
          id={pending.id}
          stage={pending.stage}
          onError={handleSettleError}
          onDone={handleSettleDone}
        />
      )}
    </section>
  );
}
