import { Link } from "react-router";
import { type BaseResume, useResumes } from "../lib/resumesHooks";
import { TestIds } from "../testIds";

const NEW_HREF = "/dashboard/resumes/new";
const NEW_BUTTON_PRIMARY =
  "inline-flex items-center rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ResumesList() {
  const query = useResumes();

  if (query.isLoading) {
    return (
      <div data-testid={TestIds.RESUMES_LOADING} className="px-8 py-12 text-ink-secondary">
        Loading resumes…
      </div>
    );
  }

  if (query.error) {
    return (
      <div
        data-testid={TestIds.RESUMES_ERROR}
        className="px-8 py-12 text-center text-ink-secondary"
      >
        <p className="mb-3">Could not load resumes.</p>
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

  const resumes = query.data ?? [];

  if (resumes.length === 0) {
    return (
      <div
        data-testid={TestIds.RESUMES_EMPTY}
        className="px-8 py-20 text-center max-w-2xl mx-auto"
      >
        <p className="font-mono text-xs uppercase tracking-wider text-ink-muted mb-3">
          No resumes yet
        </p>
        <h2 className="text-page-title text-ink mb-2">Start your CV library.</h2>
        <p className="text-body-lg text-ink-secondary mb-6">
          A resume is a named container; each version is an immutable snapshot you can submit
          with an opportunity.
        </p>
        <Link
          to={NEW_HREF}
          data-testid={TestIds.RESUMES_NEW_BUTTON}
          className={NEW_BUTTON_PRIMARY}
        >
          New resume
        </Link>
      </div>
    );
  }

  return (
    <section className="px-6 py-6">
      <div className="flex items-center justify-end mb-4">
        <Link to={NEW_HREF} data-testid={TestIds.RESUMES_NEW_BUTTON} className={NEW_BUTTON_PRIMARY}>
          New resume
        </Link>
      </div>
      <table
        data-testid={TestIds.RESUMES_LIST}
        className="w-full border border-border-subtle rounded-lg overflow-hidden text-sm"
      >
        <thead className="bg-surface-card text-ink-secondary text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Latest version</th>
            <th className="px-4 py-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {resumes.map((r: BaseResume) => (
            <tr
              key={r.id}
              data-testid={`${TestIds.RESUMES_ROW}-${r.id}`}
              className="border-t border-border-subtle hover:bg-surface-card"
            >
              <td className="px-4 py-3 text-ink font-medium">
                <Link
                  to={`/dashboard/resumes/${r.id}`}
                  className="text-ink hover:text-brand-deep hover:underline"
                >
                  {r.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink-secondary">
                {r.latest_version ? `v${r.latest_version.version_number}` : "—"}
              </td>
              <td className="px-4 py-3 text-ink-secondary">{formatDate(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
