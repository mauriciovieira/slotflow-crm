import { type FormEvent, useEffect, useState } from "react";
import {
  OPPORTUNITY_RESUME_ROLES,
  OPPORTUNITY_RESUME_ROLE_LABEL,
  type OpportunityResume,
  type OpportunityResumeRole,
  useLinkResumeToOpportunity,
  useOpportunityResumes,
  useUnlinkOpportunityResume,
} from "../lib/opportunityResumesHooks";
import { useResumes, useResumeVersions } from "../lib/resumesHooks";
import { TestIds } from "../testIds";

const ROLE_PILL: Record<OpportunityResumeRole, string> = {
  submitted: "bg-brand-deep text-white",
  used_internally: "bg-brand-light text-ink-secondary",
};

function RolePill({ role }: { role: OpportunityResumeRole }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_PILL[role]}`}
    >
      {OPPORTUNITY_RESUME_ROLE_LABEL[role]}
    </span>
  );
}

function UnlinkButton({
  opportunityId,
  link,
}: {
  opportunityId: string;
  link: OpportunityResume;
}) {
  const unlink = useUnlinkOpportunityResume(opportunityId, link.id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    try {
      await unlink.mutateAsync();
      // Success collapses the confirm UI; the row itself disappears once
      // the list query refetches.
      setConfirming(false);
    } catch (err) {
      // Surface 403/500/etc. inline so the user knows the unlink didn't
      // happen, instead of silently sitting in the confirm state.
      setError(err instanceof Error ? err.message : "Could not unlink.");
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        data-testid={`${TestIds.OPPORTUNITY_RESUMES_UNLINK}-${link.id}`}
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
          data-testid={`${TestIds.OPPORTUNITY_RESUMES_UNLINK_CONFIRM}-${link.id}`}
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
          data-testid={`${TestIds.OPPORTUNITY_RESUMES_UNLINK_CANCEL}-${link.id}`}
          className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p
          role="alert"
          data-testid={`${TestIds.OPPORTUNITY_RESUMES_UNLINK_ERROR}-${link.id}`}
          className="text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function LinkForm({ opportunityId }: { opportunityId: string }) {
  const link = useLinkResumeToOpportunity(opportunityId);
  const resumesQuery = useResumes();
  const resumes = resumesQuery.data ?? [];

  const [resumeId, setResumeId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [role, setRole] = useState<OpportunityResumeRole>("submitted");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const versionsQuery = useResumeVersions(resumeId || undefined);
  const versions = versionsQuery.data ?? [];

  // When the resume picker changes, reset the version picker so we don't
  // submit a version id that no longer matches the chosen resume.
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
        opportunity: opportunityId,
        resume_version: versionId,
        role,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      setResumeId("");
      setVersionId("");
      setRole("submitted");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link resume.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_FORM}
      className="border border-border-subtle rounded-lg p-4 mb-4 space-y-3 bg-surface"
    >
      <label className="block">
        <span className="text-sm text-ink-secondary mb-1 block">Resume</span>
        <select
          value={resumeId}
          onChange={(e) => setResumeId(e.target.value)}
          required
          data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_RESUME}
          className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
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
        <span className="text-sm text-ink-secondary mb-1 block">Version</span>
        <select
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          required
          disabled={!resumeId || versionsQuery.isLoading}
          data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_VERSION}
          className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand disabled:opacity-60"
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
        <span className="text-sm text-ink-secondary mb-1 block">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as OpportunityResumeRole)}
          data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_ROLE}
          className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
        >
          {OPPORTUNITY_RESUME_ROLES.map((r) => (
            <option key={r} value={r}>
              {OPPORTUNITY_RESUME_ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm text-ink-secondary mb-1 block">Note (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_NOTE}
          className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
          placeholder="Sent via referral"
        />
      </label>

      {error && (
        <p
          role="alert"
          data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_ERROR}
          className="text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={link.isPending}
          data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_SUBMIT}
          className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
        >
          {link.isPending ? "Linking…" : "Link"}
        </button>
      </div>
    </form>
  );
}

export function OpportunityResumesSection({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const query = useOpportunityResumes(opportunityId);
  const [composing, setComposing] = useState(false);

  return (
    <section
      data-testid={TestIds.OPPORTUNITY_RESUMES_SECTION}
      className="mt-8 rounded-xl border border-border-subtle p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-ink">Linked resumes</h2>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_TOGGLE}
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
          >
            Link a resume
          </button>
        )}
      </div>

      {composing && (
        <>
          <LinkForm opportunityId={opportunityId} />
          <div className="flex items-center justify-end mb-4">
            <button
              type="button"
              onClick={() => setComposing(false)}
              data-testid={TestIds.OPPORTUNITY_RESUMES_LINK_CANCEL}
              className="text-sm text-ink-secondary hover:text-ink"
            >
              Close
            </button>
          </div>
        </>
      )}

      {query.isLoading ? (
        <p
          data-testid={TestIds.OPPORTUNITY_RESUMES_LOADING}
          className="text-sm text-ink-secondary"
        >
          Loading linked resumes…
        </p>
      ) : query.error ? (
        <div
          data-testid={TestIds.OPPORTUNITY_RESUMES_ERROR}
          className="text-sm text-ink-secondary"
        >
          <p className="mb-2">Could not load linked resumes.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
          >
            Try again
          </button>
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <p
          data-testid={TestIds.OPPORTUNITY_RESUMES_EMPTY}
          className="text-sm text-ink-secondary"
        >
          No linked resumes yet.
        </p>
      ) : (
        <ul
          data-testid={TestIds.OPPORTUNITY_RESUMES_LIST}
          className="divide-y divide-border-subtle"
        >
          {(query.data ?? []).map((link) => (
            <li
              key={link.id}
              data-testid={`${TestIds.OPPORTUNITY_RESUMES_ROW}-${link.id}`}
              className="py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-ink font-medium truncate">
                  {link.resume_version_summary.base_resume_name}{" "}
                  <span className="text-ink-secondary">
                    v{link.resume_version_summary.version_number}
                  </span>
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <RolePill role={link.role} />
                  {link.note && (
                    <span className="text-sm text-ink-secondary truncate">{link.note}</span>
                  )}
                </div>
              </div>
              <UnlinkButton opportunityId={opportunityId} link={link} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
