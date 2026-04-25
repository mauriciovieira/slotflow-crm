import { Link } from "react-router";
import {
  STEP_STATUS_LABEL,
  type InterviewCycle,
  type InterviewStepStatus,
  useInterviewCycles,
} from "../lib/interviewsHooks";
import { TestIds } from "../testIds";

const NEW_HREF = "/dashboard/interviews/new";
const NEW_BUTTON_PRIMARY =
  "inline-flex items-center rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep";

const STATUS_PILL: Record<InterviewStepStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-brand-deep text-white",
  cancelled: "bg-gray-200 text-ink-secondary",
  no_show: "bg-red-100 text-red-700",
};

function StatusPill({ status }: { status: InterviewStepStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[status]}`}
    >
      {STEP_STATUS_LABEL[status]}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function InterviewsList() {
  const query = useInterviewCycles();

  if (query.isLoading) {
    return (
      <div data-testid={TestIds.INTERVIEWS_LOADING} className="px-8 py-12 text-ink-secondary">
        Loading interview cycles…
      </div>
    );
  }

  if (query.error) {
    return (
      <div
        data-testid={TestIds.INTERVIEWS_ERROR}
        className="px-8 py-12 text-center text-ink-secondary"
      >
        <p className="mb-3">Could not load interview cycles.</p>
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

  const cycles = query.data ?? [];

  if (cycles.length === 0) {
    return (
      <div
        data-testid={TestIds.INTERVIEWS_EMPTY}
        className="px-8 py-20 text-center max-w-2xl mx-auto"
      >
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted mb-3">
          No interview cycles yet
        </p>
        <h2 className="text-page-title text-ink mb-2">Track every loop end-to-end.</h2>
        <p className="text-body-lg text-ink-secondary mb-6">
          Start a cycle when an opportunity moves into interviews. Add steps as the
          conversation unfolds; close the loop when it lands.
        </p>
        <Link
          to={NEW_HREF}
          data-testid={TestIds.INTERVIEWS_NEW_BUTTON}
          className={NEW_BUTTON_PRIMARY}
        >
          New cycle
        </Link>
      </div>
    );
  }

  return (
    <section className="px-6 py-6">
      <div className="flex items-center justify-end mb-4">
        <Link to={NEW_HREF} data-testid={TestIds.INTERVIEWS_NEW_BUTTON} className={NEW_BUTTON_PRIMARY}>
          New cycle
        </Link>
      </div>
      <table
        data-testid={TestIds.INTERVIEWS_LIST}
        className="w-full border border-border-subtle rounded-lg overflow-hidden text-sm"
      >
        <thead className="bg-surface-card text-ink-secondary text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Cycle</th>
            <th className="px-4 py-3 font-medium">Opportunity</th>
            <th className="px-4 py-3 font-medium">Steps</th>
            <th className="px-4 py-3 font-medium">Last status</th>
            <th className="px-4 py-3 font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c: InterviewCycle) => (
            <tr
              key={c.id}
              data-testid={`${TestIds.INTERVIEWS_ROW}-${c.id}`}
              className="border-t border-border-subtle hover:bg-surface-card"
            >
              <td className="px-4 py-3 text-ink font-medium">
                <Link
                  to={`/dashboard/interviews/${c.id}`}
                  className="text-ink hover:text-brand-deep hover:underline"
                >
                  {c.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-secondary">
                {c.opportunity_title && c.opportunity_company
                  ? `${c.opportunity_title} — ${c.opportunity_company}`
                  : c.opportunity_title ?? "—"}
              </td>
              <td className="px-4 py-3 text-ink-secondary">{c.steps_count}</td>
              <td className="px-4 py-3">
                {c.last_step_status ? <StatusPill status={c.last_step_status} /> : "—"}
              </td>
              <td className="px-4 py-3 text-ink-secondary">
                {c.started_at ? formatDate(c.started_at) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
