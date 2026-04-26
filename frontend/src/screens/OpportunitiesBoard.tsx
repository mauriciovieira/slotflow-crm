import { type DragEvent, useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { OpportunityStagePill } from "../components/OpportunityStagePill";
import {
  OPPORTUNITIES_KEY,
  STAGES,
  STAGE_LABEL,
  type Opportunity,
  type OpportunityStage,
  useMoveOpportunity,
  useOpportunities,
} from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

const TOGGLE_BTN =
  "rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card";
const TOGGLE_BTN_ACTIVE =
  "rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium pointer-events-none";

const DRAG_MIME = "application/x-opportunity-id";

function Card({
  opp,
  draggable,
  onMoveToStage,
  movingDisabled,
}: {
  opp: Opportunity;
  draggable: boolean;
  onMoveToStage: (id: string, target: OpportunityStage) => void;
  movingDisabled: boolean;
}) {
  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    if (!draggable) {
      e.preventDefault();
      return;
    }
    // Always include text/plain alongside the custom MIME so Firefox /
    // Safari dispatch the drop event reliably (some versions refuse to
    // start a drag when only a non-standard MIME type is set).
    e.dataTransfer.setData(DRAG_MIME, opp.id);
    e.dataTransfer.setData("text/plain", opp.id);
    e.dataTransfer.effectAllowed = "move";
  }
  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      data-testid={`${TestIds.OPPORTUNITIES_BOARD_CARD}-${opp.id}`}
      // The inner title <Link> stays clickable even when `draggable` is
      // false, so don't paint the whole card as `cursor-not-allowed` —
      // that would lie about the navigation affordance. Just the
      // dimming hints that drag is temporarily blocked.
      className={`rounded-md border border-border-subtle bg-surface p-3 mb-2 ${draggable ? "cursor-move" : "cursor-default opacity-70"}`}
    >
      <Link
        to={`/dashboard/opportunities/${opp.id}`}
        className="text-sm font-medium text-ink hover:text-brand-deep hover:underline"
      >
        {opp.title}
      </Link>
      <div className="text-xs text-ink-secondary mt-1">{opp.company}</div>
      {/* Keyboard-accessible alternative to drag-and-drop: a per-card
          stage <select> that triggers the same move mutation. Native
          <select> works with screen readers and keyboard nav out of
          the box, where HTML5 DnD does not. */}
      <label className="block mt-2 text-xs text-ink-secondary">
        <span aria-label={`Move ${opp.title} to a different stage`}>
          Move to
        </span>
        <select
          value={opp.stage}
          disabled={movingDisabled}
          onChange={(e) => {
            const next = e.target.value as OpportunityStage;
            if (next !== opp.stage) onMoveToStage(opp.id, next);
          }}
          data-testid={`${TestIds.OPPORTUNITIES_BOARD_MOVE_SELECT}-${opp.id}`}
          className="ml-1 text-xs border border-border-subtle rounded px-1 py-0.5 bg-surface focus:outline-none focus:border-brand"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Column({
  stage,
  opps,
  onDropToStage,
  onMoveToStage,
  acceptingDrops,
}: {
  stage: OpportunityStage;
  opps: Opportunity[];
  onDropToStage: (id: string, target: OpportunityStage) => void;
  onMoveToStage: (id: string, target: OpportunityStage) => void;
  acceptingDrops: boolean;
}) {
  const [over, setOver] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (!acceptingDrops) return;
    // Required for the drop event to fire on this target.
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!over) setOver(true);
  }
  function handleDragLeave() {
    setOver(false);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (!acceptingDrops) return;
    e.preventDefault();
    setOver(false);
    // Fall back to `text/plain` so the drop reads back the id in
    // browsers that only preserve the standard MIME (Firefox / Safari
    // don't always round-trip a custom type).
    const id =
      e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain");
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
        <OpportunityStagePill stage={stage} />
        <span className="text-xs text-ink-muted">{opps.length}</span>
      </header>
      <div className="flex-1">
        {opps.map((o) => (
          <Card
            key={o.id}
            opp={o}
            draggable={acceptingDrops}
            onMoveToStage={onMoveToStage}
            movingDisabled={!acceptingDrops}
          />
        ))}
      </div>
    </div>
  );
}

export function OpportunitiesBoard() {
  const query = useOpportunities();
  const qc = useQueryClient();
  const rows: Opportunity[] = query.data ?? [];

  // Imperative variant of `useUpdateOpportunity` shared with detail-
  // screen edits. Centralizing the mutation keeps cache semantics
  // (per-row write + stage-history invalidation + list invalidation +
  // error-rollback) in one place; the board only needs to fire it.
  const move = useMoveOpportunity();

  function handleDropToStage(id: string, target: OpportunityStage) {
    // Race guard: while a previous drop is still in flight, ignore new
    // drops. Without this a fast second drag could land a second PATCH
    // mid-flight and produce out-of-order writes. The Column also
    // passes `acceptingDrops={!move.isPending}` so columns visually
    // reject drops in this window — defense in depth.
    if (move.isPending) return;

    // No-op short-circuit: dropping back into the same column is a
    // common misclick. The BE already special-cases stage-no-op
    // (no transition), but skipping the PATCH avoids a round-trip
    // and a transient cache rewrite that the server would just echo.
    // Look up the row from the closed-over query result rather than
    // `qc.getQueryData`, which is empty until React Query has actually
    // populated the cache (notably under tests that mock the hook).
    const current = rows.find((row) => row.id === id);
    if (current?.stage === target) return;

    // Optimistic: rewrite the cached row so the card hops to the new
    // column before the PATCH lands. The mutation's `onError` reverts
    // by invalidating; `onSuccess` invalidates anyway so the optimistic
    // write is a smooth bridge.
    qc.setQueryData<Opportunity[]>(OPPORTUNITIES_KEY, (prev) => {
      if (!prev) return prev;
      return prev.map((row) => (row.id === id ? { ...row, stage: target } : row));
    });
    move.mutate({ id, payload: { stage: target } });
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

  const byStage: Record<OpportunityStage, Opportunity[]> = {
    applied: [],
    screening: [],
    interview: [],
    offer: [],
    rejected: [],
    withdrawn: [],
  };
  for (const o of rows) {
    // Guard against a future BE deploy that adds a stage the FE doesn't
    // yet know about: degrade gracefully (log + skip) instead of
    // crashing the whole board on `byStage[<unknown>].push`.
    if (Object.prototype.hasOwnProperty.call(byStage, o.stage)) {
      byStage[o.stage as OpportunityStage].push(o);
      continue;
    }
    // Only warn in dev. Prod users shouldn't see console noise for data
    // the UI already degrades gracefully on (the row is skipped from
    // every column anyway).
    if (import.meta.env.DEV) {
      console.warn("Skipping opportunity with unexpected stage", {
        id: o.id,
        stage: o.stage,
      });
    }
  }

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
        {/* Both states render as <Link> with `aria-current="page"` on
            the active route so screen readers announce the current
            view, and `pointer-events-none` on the active link
            prevents a redundant self-navigation click. */}
        <nav className="flex items-center gap-2" aria-label="Opportunities view">
          <Link
            to="/dashboard/opportunities"
            data-testid={TestIds.OPPORTUNITIES_VIEW_TOGGLE_TABLE}
            className={TOGGLE_BTN}
          >
            Table
          </Link>
          <Link
            to="/dashboard/opportunities/board"
            aria-current="page"
            data-testid={TestIds.OPPORTUNITIES_VIEW_TOGGLE_BOARD}
            className={TOGGLE_BTN_ACTIVE}
          >
            Board
          </Link>
        </nav>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map((stage) => (
          <Column
            key={stage}
            stage={stage}
            opps={byStage[stage]}
            onDropToStage={handleDropToStage}
            onMoveToStage={handleDropToStage}
            acceptingDrops={!move.isPending}
          />
        ))}
      </div>
    </section>
  );
}
