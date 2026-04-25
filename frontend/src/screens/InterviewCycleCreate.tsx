import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useOpportunities } from "../lib/opportunitiesHooks";
import { useStartInterviewCycle } from "../lib/interviewsHooks";
import { TestIds } from "../testIds";

export function InterviewCycleCreate() {
  const navigate = useNavigate();
  const opportunitiesQuery = useOpportunities();
  const create = useStartInterviewCycle();
  const [opportunityId, setOpportunityId] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const opportunities = opportunitiesQuery.data ?? [];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSubmitError("Cycle name is required.");
      return;
    }
    if (!opportunityId) {
      setSubmitError("Pick an opportunity.");
      return;
    }
    const trimmedNotes = notes.trim();
    try {
      const created = await create.mutateAsync({
        opportunity: opportunityId,
        name: trimmedName,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      navigate(`/dashboard/interviews/${created.id}`, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not start cycle.");
    }
  }

  return (
    <section className="px-6 py-6 max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        data-testid={TestIds.INTERVIEW_CYCLE_CREATE_FORM}
        className="rounded-xl border border-border-subtle bg-surface-card p-6 space-y-4"
      >
        <header>
          <h1 className="text-page-title text-ink">New interview cycle</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Pick the opportunity this loop attaches to. You&apos;ll add steps on the
            next screen.
          </p>
        </header>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Opportunity</span>
          <select
            required
            value={opportunityId}
            onChange={(e) => setOpportunityId(e.target.value)}
            data-testid={TestIds.INTERVIEW_CYCLE_CREATE_OPPORTUNITY}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
          >
            <option value="">Select an opportunity…</option>
            {opportunities.map((opp) => (
              <option key={opp.id} value={opp.id}>
                {opp.title} — {opp.company}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Cycle name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid={TestIds.INTERVIEW_CYCLE_CREATE_NAME}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            placeholder="Onsite loop"
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Notes (optional)</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid={TestIds.INTERVIEW_CYCLE_CREATE_NOTES}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand resize-y"
          />
        </label>

        {submitError && (
          <p
            role="alert"
            data-testid={TestIds.INTERVIEW_CYCLE_CREATE_ERROR}
            className="text-sm text-danger"
          >
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/dashboard/interviews")}
            data-testid={TestIds.INTERVIEW_CYCLE_CREATE_CANCEL}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            data-testid={TestIds.INTERVIEW_CYCLE_CREATE_SUBMIT}
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {create.isPending ? "Saving…" : "Start cycle"}
          </button>
        </div>
      </form>
    </section>
  );
}
