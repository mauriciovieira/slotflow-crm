import { Link } from "react-router";
import {
  STAGE_LABEL,
  type Opportunity,
  type OpportunityStage,
  useOpportunities,
} from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

const NEW_OPPORTUNITY_HREF = "/dashboard/opportunities/new";

const NEW_BUTTON_PRIMARY =
  "inline-flex items-center rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep";

const STAGE_PILL: Record<OpportunityStage, string> = {
  applied: "bg-brand-light text-ink-secondary",
  screening: "bg-blue-100 text-blue-800",
  interview: "bg-brand text-white",
  offer: "bg-brand-deep text-white",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-200 text-ink-secondary",
};

function StagePill({ stage }: { stage: OpportunityStage }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STAGE_PILL[stage]}`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function OpportunitiesList() {
  const query = useOpportunities();

  if (query.isLoading) {
    return (
      <div
        data-testid={TestIds.OPPORTUNITIES_LOADING}
        className="px-8 py-12 text-ink-secondary"
      >
        Loading opportunities…
      </div>
    );
  }

  if (query.error) {
    return (
      <div
        data-testid={TestIds.OPPORTUNITIES_ERROR}
        className="px-8 py-12 text-center text-ink-secondary"
      >
        <p className="mb-3">Could not load opportunities.</p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
        >
          Try again
        </button>
      </div>
    );
  }

  const opportunities = query.data ?? [];

  if (opportunities.length === 0) {
    return (
      <div
        data-testid={TestIds.OPPORTUNITIES_EMPTY}
        className="px-8 py-20 text-center max-w-2xl mx-auto"
      >
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted mb-3">
          No opportunities yet
        </p>
        <h2 className="text-page-title text-ink mb-2">Track your next move.</h2>
        <p className="text-body-lg text-ink-secondary mb-6">
          Log the first role you&apos;re chasing — title, company, and any notes.
        </p>
        <Link
          to={NEW_OPPORTUNITY_HREF}
          data-testid={TestIds.OPPORTUNITIES_NEW_BUTTON}
          className={NEW_BUTTON_PRIMARY}
        >
          New opportunity
        </Link>
      </div>
    );
  }

  return (
    <section className="px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            data-testid={TestIds.OPPORTUNITIES_VIEW_TOGGLE_TABLE}
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium"
          >
            Table
          </span>
          <Link
            to="/dashboard/opportunities/board"
            data-testid={TestIds.OPPORTUNITIES_VIEW_TOGGLE_BOARD}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
          >
            Board
          </Link>
        </div>
        <Link
          to={NEW_OPPORTUNITY_HREF}
          data-testid={TestIds.OPPORTUNITIES_NEW_BUTTON}
          className={NEW_BUTTON_PRIMARY}
        >
          New opportunity
        </Link>
      </div>
      <table
        data-testid={TestIds.OPPORTUNITIES_LIST}
        className="w-full border border-border-subtle rounded-lg overflow-hidden text-sm"
      >
        <thead className="bg-surface-card text-ink-secondary text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opp: Opportunity) => (
            <tr
              key={opp.id}
              data-testid={`${TestIds.OPPORTUNITIES_ROW}-${opp.id}`}
              className="border-t border-border-subtle hover:bg-surface-card"
            >
              <td className="px-4 py-3 text-ink font-medium">
                <Link
                  to={`/dashboard/opportunities/${opp.id}`}
                  className="text-ink hover:text-brand-deep hover:underline"
                >
                  {opp.title}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-secondary">{opp.company}</td>
              <td className="px-4 py-3">
                <StagePill stage={opp.stage} />
              </td>
              <td className="px-4 py-3 text-ink-secondary">{formatDate(opp.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
