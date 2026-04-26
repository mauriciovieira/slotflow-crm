import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { OpportunityResumesSection } from "../components/OpportunityResumesSection";
import { OpportunityStageHistorySection } from "../components/OpportunityStageHistorySection";
import {
  STAGES,
  STAGE_LABEL,
  type OpportunityStage,
  isNotFound,
  useArchiveOpportunity,
  useOpportunity,
  useUpdateOpportunity,
} from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

const BACK_HREF = "/dashboard/opportunities";

export function OpportunityDetail() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const navigate = useNavigate();
  const query = useOpportunity(opportunityId);
  const update = useUpdateOpportunity(opportunityId ?? "");
  const archive = useArchiveOpportunity(opportunityId ?? "");

  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [stage, setStage] = useState<OpportunityStage>("applied");
  const [notes, setNotes] = useState("");
  const [compAmount, setCompAmount] = useState("");
  const [compCurrency, setCompCurrency] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  useEffect(() => {
    if (!query.data) return;
    setTitle(query.data.title);
    setCompany(query.data.company);
    setStage(query.data.stage);
    setNotes(query.data.notes);
    setCompAmount(query.data.expected_total_compensation ?? "");
    setCompCurrency(query.data.compensation_currency ?? "");
  }, [query.data]);

  if (query.isLoading) {
    return <div className="px-8 py-12 text-ink-secondary">Loading opportunity…</div>;
  }

  if (query.error) {
    if (isNotFound(query.error)) {
      return (
        <div
          data-testid={TestIds.OPPORTUNITY_DETAIL_NOT_FOUND}
          className="px-8 py-20 text-center max-w-2xl mx-auto"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted mb-3">
            Not found
          </p>
          <h2 className="text-page-title text-ink mb-4">
            That opportunity doesn&apos;t exist.
          </h2>
          <Link
            to={BACK_HREF}
            data-testid={TestIds.OPPORTUNITY_DETAIL_BACK}
            className="text-brand-deep hover:underline"
          >
            ← Back to list
          </Link>
        </div>
      );
    }
    return (
      <div
        data-testid={TestIds.OPPORTUNITY_DETAIL_ERROR}
        className="px-8 py-12 text-center text-ink-secondary"
      >
        <p className="mb-3">Could not load this opportunity.</p>
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

  const opp = query.data;
  if (!opp) {
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const trimmedAmount = compAmount.trim();
    const trimmedCurrency = compCurrency.trim().toUpperCase();
    if ((trimmedAmount === "") !== (trimmedCurrency === "")) {
      // Same paired-fields rule as OpportunityCreate.
      setSubmitError("Provide both compensation amount and currency, or neither.");
      return;
    }
    try {
      await update.mutateAsync({
        title: title.trim(),
        company: company.trim(),
        stage,
        notes: notes.trim(),
        // PATCH semantics: when comp is fully cleared, send `null` +
        // empty string so the BE drops both — leaving the previous
        // values would silently retain stale data.
        expected_total_compensation: trimmedAmount === "" ? null : trimmedAmount,
        compensation_currency: trimmedCurrency,
      });
      navigate(BACK_HREF, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not save changes.");
    }
  }

  async function handleArchive() {
    setSubmitError(null);
    try {
      await archive.mutateAsync();
      navigate(BACK_HREF, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not archive.");
    }
  }

  return (
    <section className="px-6 py-6 max-w-2xl mx-auto">
      <Link
        to={BACK_HREF}
        data-testid={TestIds.OPPORTUNITY_DETAIL_BACK}
        className="text-sm text-ink-secondary hover:text-ink mb-4 inline-block"
      >
        ← Back to list
      </Link>

      <form
        onSubmit={handleSubmit}
        data-testid={TestIds.OPPORTUNITY_DETAIL_FORM}
        className="rounded-xl border border-border-subtle bg-surface-card p-6 space-y-4"
      >
        <header>
          <h1 className="text-page-title text-ink">Edit opportunity</h1>
        </header>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Title</span>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid={TestIds.OPPORTUNITY_DETAIL_TITLE}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Company</span>
          <input
            type="text"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            data-testid={TestIds.OPPORTUNITY_DETAIL_COMPANY}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Stage</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as OpportunityStage)}
            data-testid={TestIds.OPPORTUNITY_DETAIL_STAGE}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">
              Expected total comp (optional)
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={compAmount}
              onChange={(e) => setCompAmount(e.target.value)}
              data-testid={TestIds.OPPORTUNITY_DETAIL_COMP_AMOUNT}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
              placeholder="200000"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">
              Currency (e.g. USD)
            </span>
            <input
              type="text"
              maxLength={8}
              value={compCurrency}
              onChange={(e) => setCompCurrency(e.target.value.toUpperCase())}
              data-testid={TestIds.OPPORTUNITY_DETAIL_COMP_CURRENCY}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
              placeholder="USD"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Notes</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid={TestIds.OPPORTUNITY_DETAIL_NOTES}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand resize-y"
          />
        </label>

        {submitError && (
          <p
            role="alert"
            data-testid={TestIds.OPPORTUNITY_DETAIL_ERROR}
            className="text-sm text-danger"
          >
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={update.isPending}
            data-testid={TestIds.OPPORTUNITY_DETAIL_SAVE}
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      <div className="mt-8 rounded-xl border border-border-subtle p-6">
        <h2 className="text-base font-semibold text-ink mb-2">Archive</h2>
        <p className="text-sm text-ink-secondary mb-4">
          Archiving removes this opportunity from the list. The row stays in the database for
          audit; an admin can restore it.
        </p>
        {!confirmingArchive ? (
          <button
            type="button"
            onClick={() => setConfirmingArchive(true)}
            data-testid={TestIds.OPPORTUNITY_DETAIL_ARCHIVE}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-danger hover:bg-surface"
          >
            Archive opportunity
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink">Archive this opportunity?</span>
            <button
              type="button"
              onClick={handleArchive}
              disabled={archive.isPending}
              data-testid={TestIds.OPPORTUNITY_DETAIL_ARCHIVE_CONFIRM}
              className="rounded-md bg-danger text-white px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {archive.isPending ? "Archiving…" : "Yes, archive"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              data-testid={TestIds.OPPORTUNITY_DETAIL_ARCHIVE_CANCEL}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {opportunityId && <OpportunityResumesSection opportunityId={opportunityId} />}
      {opportunityId && <OpportunityStageHistorySection opportunityId={opportunityId} />}
    </section>
  );
}
