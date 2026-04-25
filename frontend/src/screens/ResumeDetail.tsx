import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  type ResumeVersion,
  isNotFound,
  useArchiveResume,
  useCreateResumeVersion,
  useImportResumeVersion,
  useResume,
  useResumeVersions,
  versionRenderUrl,
} from "../lib/resumesHooks";
import { TestIds } from "../testIds";

const BACK_HREF = "/dashboard/resumes";

function formatDate(iso: string): string {
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

export function ResumeDetail() {
  const { resumeId } = useParams<{ resumeId: string }>();
  const navigate = useNavigate();
  const query = useResume(resumeId);
  const versionsQuery = useResumeVersions(resumeId);
  const createVersion = useCreateResumeVersion(resumeId ?? "");
  const importVersion = useImportResumeVersion(resumeId ?? "");
  const archive = useArchiveResume(resumeId ?? "");

  const [composing, setComposing] = useState(false);
  const [documentText, setDocumentText] = useState("");
  const [versionNotes, setVersionNotes] = useState("");
  const [versionError, setVersionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importNotes, setImportNotes] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  if (query.isLoading) {
    return <div className="px-8 py-12 text-ink-secondary">Loading resume…</div>;
  }

  if (query.error) {
    if (isNotFound(query.error)) {
      return (
        <div
          data-testid={TestIds.RESUME_DETAIL_NOT_FOUND}
          className="px-8 py-20 text-center max-w-2xl mx-auto"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted mb-3">
            Not found
          </p>
          <h2 className="text-page-title text-ink mb-4">That resume doesn&apos;t exist.</h2>
          <Link
            to={BACK_HREF}
            data-testid={TestIds.RESUME_DETAIL_BACK}
            className="text-brand-deep hover:underline"
          >
            ← Back to list
          </Link>
        </div>
      );
    }
    return (
      <div
        data-testid={TestIds.RESUME_DETAIL_ERROR}
        className="px-8 py-12 text-center text-ink-secondary"
      >
        <p className="mb-3">Could not load this resume.</p>
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

  const resume = query.data;
  if (!resume) return null;

  const versions = versionsQuery.data ?? [];
  const versionsLoading = versionsQuery.isLoading;
  const versionsError = versionsQuery.error;

  async function handleVersionSubmit(event: FormEvent) {
    event.preventDefault();
    setVersionError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(documentText);
    } catch {
      setVersionError("Document is not valid JSON.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setVersionError("Document must be a JSON object.");
      return;
    }
    try {
      await createVersion.mutateAsync({
        document: parsed,
        ...(versionNotes.trim() ? { notes: versionNotes.trim() } : {}),
      });
      setComposing(false);
      setDocumentText("");
      setVersionNotes("");
    } catch (err) {
      setVersionError(err instanceof Error ? err.message : "Could not save version.");
    }
  }

  async function handleArchive() {
    setArchiveError(null);
    try {
      await archive.mutateAsync();
      navigate(BACK_HREF, { replace: true });
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Could not archive.");
    }
  }

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    setImportError(null);
    if (!importFile) {
      setImportError("Pick a JSON file.");
      return;
    }
    const trimmedNotes = importNotes.trim();
    try {
      await importVersion.mutateAsync({
        file: importFile,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      setImporting(false);
      setImportFile(null);
      setImportNotes("");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not import.");
    }
  }

  return (
    <section className="px-6 py-6 max-w-3xl mx-auto">
      <Link
        to={BACK_HREF}
        data-testid={TestIds.RESUME_DETAIL_BACK}
        className="text-sm text-ink-secondary hover:text-ink mb-4 inline-block"
      >
        ← Back to list
      </Link>

      <header className="mb-6">
        <h1
          data-testid={TestIds.RESUME_DETAIL_HEADING}
          className="text-page-title text-ink"
        >
          {resume.name}
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Created {formatDate(resume.created_at)}
        </p>
      </header>

      <div className="rounded-xl border border-border-subtle bg-surface-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Versions</h2>
          {!composing && !importing && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // Reset form state on every open so a previously-cancelled
                  // attempt doesn't leak stale notes / file / error into the
                  // next session.
                  setImportFile(null);
                  setImportNotes("");
                  setImportError(null);
                  setImporting(true);
                }}
                data-testid={TestIds.RESUME_DETAIL_IMPORT_TOGGLE}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
              >
                Import JSON
              </button>
              <button
                type="button"
                onClick={() => setComposing(true)}
                data-testid={TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE}
                className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
              >
                New version
              </button>
            </div>
          )}
        </div>

        {composing && (
          <form
            onSubmit={handleVersionSubmit}
            data-testid={TestIds.RESUME_DETAIL_NEW_VERSION_FORM}
            className="border border-border-subtle rounded-lg p-4 mb-6 space-y-3 bg-surface"
          >
            <label className="block">
              <span className="text-sm text-ink-secondary mb-1 block">
                JSON Resume document
              </span>
              <textarea
                rows={10}
                required
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
                data-testid={TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT}
                className="w-full font-mono text-xs border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand resize-y"
                placeholder='{"basics": {"name": "Alice"}}'
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-secondary mb-1 block">Notes (optional)</span>
              <input
                type="text"
                value={versionNotes}
                onChange={(e) => setVersionNotes(e.target.value)}
                data-testid={TestIds.RESUME_DETAIL_NEW_VERSION_NOTES}
                className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
                placeholder="Backend slant for Acme submission"
              />
            </label>
            {versionError && (
              <p
                role="alert"
                data-testid={TestIds.RESUME_DETAIL_NEW_VERSION_ERROR}
                className="text-sm text-danger"
              >
                {versionError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setComposing(false);
                  setVersionError(null);
                }}
                data-testid={TestIds.RESUME_DETAIL_NEW_VERSION_CANCEL}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createVersion.isPending}
                data-testid={TestIds.RESUME_DETAIL_NEW_VERSION_SUBMIT}
                className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
              >
                {createVersion.isPending ? "Saving…" : "Save version"}
              </button>
            </div>
          </form>
        )}

        {importing && (
          <form
            onSubmit={handleImport}
            data-testid={TestIds.RESUME_DETAIL_IMPORT_FORM}
            className="border border-border-subtle rounded-lg p-4 mb-6 space-y-3 bg-surface"
          >
            <label className="block">
              <span className="text-sm text-ink-secondary mb-1 block">JSON file</span>
              <input
                type="file"
                accept="application/json,.json"
                // No `required` here on purpose: native constraint validation
                // blocks `onSubmit` from running when the field is empty,
                // which would short-circuit the JSX-level "Pick a JSON file."
                // friendly inline error. The submit handler is the single
                // source of truth for this guard.
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                data-testid={TestIds.RESUME_DETAIL_IMPORT_FILE}
                className="w-full text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm text-ink-secondary mb-1 block">Notes (optional)</span>
              <input
                type="text"
                value={importNotes}
                onChange={(e) => setImportNotes(e.target.value)}
                data-testid={TestIds.RESUME_DETAIL_IMPORT_NOTES}
                className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
                placeholder="Imported from LinkedIn export"
              />
            </label>
            {importError && (
              <p
                role="alert"
                data-testid={TestIds.RESUME_DETAIL_IMPORT_ERROR}
                className="text-sm text-danger"
              >
                {importError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setImporting(false);
                  setImportFile(null);
                  setImportNotes("");
                  setImportError(null);
                }}
                // Disabled while the request is in flight: canceling here
                // can't actually abort the network call, so allowing the
                // click would let a successful response land a new
                // version after the user thought they'd cancelled.
                disabled={importVersion.isPending}
                data-testid={TestIds.RESUME_DETAIL_IMPORT_CANCEL}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={importVersion.isPending}
                data-testid={TestIds.RESUME_DETAIL_IMPORT_SUBMIT}
                className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
              >
                {importVersion.isPending ? "Importing…" : "Import"}
              </button>
            </div>
          </form>
        )}

        {versionsLoading ? (
          <p
            data-testid={TestIds.RESUME_DETAIL_VERSIONS_LOADING}
            className="text-sm text-ink-secondary"
          >
            Loading versions…
          </p>
        ) : versionsError ? (
          <div
            data-testid={TestIds.RESUME_DETAIL_VERSIONS_ERROR}
            className="text-sm text-ink-secondary"
          >
            <p className="mb-2">Could not load versions.</p>
            <button
              type="button"
              onClick={() => versionsQuery.refetch()}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
            >
              Try again
            </button>
          </div>
        ) : versions.length === 0 ? (
          <p
            data-testid={TestIds.RESUME_DETAIL_VERSIONS_EMPTY}
            className="text-sm text-ink-secondary"
          >
            No versions yet. Add the first one to lock in a snapshot.
          </p>
        ) : (
          <ul
            data-testid={TestIds.RESUME_DETAIL_VERSIONS_LIST}
            className="divide-y divide-border-subtle"
          >
            {versions.map((v: ResumeVersion) => (
              <li
                key={v.id}
                data-testid={`${TestIds.RESUME_DETAIL_VERSION_ROW}-${v.id}`}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-ink font-medium">v{v.version_number}</p>
                  {v.notes && <p className="text-sm text-ink-secondary">{v.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={versionRenderUrl(resume.id, v.id)}
                    target="_blank"
                    // `noopener` is the security-relevant bit (prevents the
                    // new tab from accessing window.opener); `noreferrer`
                    // strips the Referer header. Both go together for
                    // user-content links.
                    rel="noopener noreferrer"
                    data-testid={`${TestIds.RESUME_DETAIL_VERSION_RENDER_LINK}-${v.id}`}
                    className="text-sm text-brand-deep hover:underline"
                  >
                    View HTML
                  </a>
                  <p className="text-sm text-ink-secondary">{formatDate(v.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border-subtle p-6">
        <h2 className="text-base font-semibold text-ink mb-2">Archive</h2>
        <p className="text-sm text-ink-secondary mb-4">
          Archiving removes the resume and its versions from the list. The rows stay in the
          database for audit.
        </p>
        {!confirmingArchive ? (
          <button
            type="button"
            onClick={() => setConfirmingArchive(true)}
            data-testid={TestIds.RESUME_DETAIL_ARCHIVE}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-danger hover:bg-surface"
          >
            Archive resume
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink">Archive this resume?</span>
            <button
              type="button"
              onClick={handleArchive}
              disabled={archive.isPending}
              data-testid={TestIds.RESUME_DETAIL_ARCHIVE_CONFIRM}
              className="rounded-md bg-danger text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {archive.isPending ? "Archiving…" : "Yes, archive"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              data-testid={TestIds.RESUME_DETAIL_ARCHIVE_CANCEL}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
            >
              Cancel
            </button>
          </div>
        )}
        {archiveError && (
          <p role="alert" className="text-sm text-danger mt-3">
            {archiveError}
          </p>
        )}
      </div>
    </section>
  );
}
