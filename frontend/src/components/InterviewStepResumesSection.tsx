import { type FormEvent, useEffect, useState } from "react";
import {
  type InterviewStepResume,
  useInterviewStepResumes,
  useLinkResumeToStep,
  useUnlinkStepResume,
} from "../lib/interviewStepResumesHooks";
import { useResumes, useResumeVersions } from "../lib/resumesHooks";
import { TestIds } from "../testIds";

function UnlinkButton({
  stepId,
  cycleId,
  link,
}: {
  stepId: string;
  cycleId: string;
  link: InterviewStepResume;
}) {
  const unlink = useUnlinkStepResume(stepId, cycleId, link.id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await unlink.mutateAsync();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlink.");
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK}-${link.id}`}
        className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-danger hover:bg-surface"
      >
        Unlink
      </button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={unlink.isPending}
          data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK_CONFIRM}-${link.id}`}
          className="rounded-md bg-danger text-white px-2 py-1 text-xs font-medium disabled:opacity-60"
        >
          {unlink.isPending ? "Unlinking…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK_CANCEL}-${link.id}`}
          className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p
          role="alert"
          data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_UNLINK_ERROR}-${link.id}`}
          className="text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function LinkForm({
  stepId,
  cycleId,
  onClose,
}: {
  stepId: string;
  cycleId: string;
  onClose: () => void;
}) {
  const link = useLinkResumeToStep(stepId, cycleId);
  const resumesQuery = useResumes();
  const resumes = resumesQuery.data ?? [];

  const [resumeId, setResumeId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const versionsQuery = useResumeVersions(resumeId || undefined);
  const versions = versionsQuery.data ?? [];

  useEffect(() => {
    setVersionId("");
  }, [resumeId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!resumeId) {
      setError("Pick a resume.");
      return;
    }
    if (!versionId) {
      setError("Pick a version.");
      return;
    }
    const trimmedNote = note.trim();
    try {
      await link.mutateAsync({
        step: stepId,
        resume_version: versionId,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link resume.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={TestIds.INTERVIEW_STEP_RESUMES_LINK_FORM}
      className="border border-border-subtle rounded-lg p-3 mb-3 space-y-2 bg-surface"
    >
      <label className="block">
        <span className="text-xs text-ink-secondary mb-1 block">Resume</span>
        <select
          value={resumeId}
          onChange={(e) => setResumeId(e.target.value)}
          required
          data-testid={TestIds.INTERVIEW_STEP_RESUMES_LINK_RESUME}
          className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
        >
          <option value="">Select a resume…</option>
          {resumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-ink-secondary mb-1 block">Version</span>
        <select
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          required
          disabled={!resumeId || versionsQuery.isLoading}
          data-testid={TestIds.INTERVIEW_STEP_RESUMES_LINK_VERSION}
          className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand disabled:opacity-60"
        >
          <option value="">
            {!resumeId
              ? "Pick a resume first"
              : versionsQuery.isLoading
                ? "Loading versions…"
                : versions.length === 0
                  ? "No versions yet"
                  : "Select a version…"}
          </option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.version_number}
              {v.notes ? ` — ${v.notes}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-ink-secondary mb-1 block">Note (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid={TestIds.INTERVIEW_STEP_RESUMES_LINK_NOTE}
          className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          placeholder="Discussion focus"
        />
      </label>
      {error && (
        <p
          role="alert"
          data-testid={TestIds.INTERVIEW_STEP_RESUMES_LINK_ERROR}
          className="text-xs text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setError(null);
            onClose();
          }}
          data-testid={TestIds.INTERVIEW_STEP_RESUMES_LINK_CANCEL}
          className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={link.isPending}
          data-testid={TestIds.INTERVIEW_STEP_RESUMES_LINK_SUBMIT}
          className="rounded-md bg-brand text-white px-2 py-1 text-xs font-medium hover:bg-brand-deep disabled:opacity-60"
        >
          {link.isPending ? "Linking…" : "Link"}
        </button>
      </div>
    </form>
  );
}

export function InterviewStepResumesSection({
  stepId,
  cycleId,
}: {
  stepId: string;
  cycleId: string;
}) {
  // The hook reads from the per-cycle cache: every section in a single
  // cycle shares one network request (the parent screen drives the fetch).
  const query = useInterviewStepResumes(stepId, cycleId);
  const [composing, setComposing] = useState(false);

  return (
    <section
      data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_SECTION}-${stepId}`}
      className="mt-3 border-t border-border-subtle pt-3"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-ink-muted font-mono">
          Linked resumes
        </p>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_LINK_TOGGLE}-${stepId}`}
            className="text-xs font-medium text-brand-deep hover:underline"
          >
            Link a resume
          </button>
        )}
      </div>

      {composing && (
        <LinkForm
          stepId={stepId}
          cycleId={cycleId}
          onClose={() => setComposing(false)}
        />
      )}

      {query.isLoading ? (
        <p
          data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_LOADING}-${stepId}`}
          className="text-xs text-ink-secondary"
        >
          Loading…
        </p>
      ) : query.error ? (
        <div
          data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_ERROR}-${stepId}`}
          className="text-xs text-ink-secondary"
        >
          <p>Could not load.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-1 rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
          >
            Try again
          </button>
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <p
          data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_EMPTY}-${stepId}`}
          className="text-xs text-ink-secondary"
        >
          No resumes linked yet.
        </p>
      ) : (
        <ul
          data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_LIST}-${stepId}`}
          className="divide-y divide-border-subtle"
        >
          {(query.data ?? []).map((linkRow) => (
            <li
              key={linkRow.id}
              data-testid={`${TestIds.INTERVIEW_STEP_RESUMES_ROW}-${linkRow.id}`}
              className="py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">
                  {linkRow.resume_version_summary.base_resume_name}{" "}
                  <span className="text-ink-secondary">
                    v{linkRow.resume_version_summary.version_number}
                  </span>
                </p>
                {linkRow.note && (
                  <p className="text-xs text-ink-secondary truncate">{linkRow.note}</p>
                )}
              </div>
              <UnlinkButton stepId={stepId} cycleId={cycleId} link={linkRow} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
