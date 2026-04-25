import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useCreateOpportunity } from "../lib/opportunitiesHooks";
import { TestIds } from "../testIds";

export function OpportunityCreate() {
  const navigate = useNavigate();
  const create = useCreateOpportunity();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await create.mutateAsync({
        title: title.trim(),
        company: company.trim(),
        notes: notes.trim(),
      });
      navigate("/dashboard/opportunities", { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create opportunity.");
    }
  }

  return (
    <section className="px-6 py-6 max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        data-testid={TestIds.OPPORTUNITY_CREATE_FORM}
        className="rounded-xl border border-border-subtle bg-surface-card p-6 space-y-4"
        noValidate
      >
        <header>
          <h1 className="text-page-title text-ink">New opportunity</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Track a role you&apos;re pursuing. You can add stage and notes later.
          </p>
        </header>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Title</span>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid={TestIds.OPPORTUNITY_CREATE_TITLE}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            placeholder="Staff Engineer"
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Company</span>
          <input
            type="text"
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            data-testid={TestIds.OPPORTUNITY_CREATE_COMPANY}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            placeholder="Acme"
          />
        </label>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Notes (optional)</span>
          <textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            data-testid={TestIds.OPPORTUNITY_CREATE_NOTES}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand resize-y"
            placeholder="Recruiter intro call on Friday"
          />
        </label>

        {submitError && (
          <p
            role="alert"
            data-testid={TestIds.OPPORTUNITY_CREATE_ERROR}
            className="text-sm text-danger"
          >
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/dashboard/opportunities")}
            data-testid={TestIds.OPPORTUNITY_CREATE_CANCEL}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            data-testid={TestIds.OPPORTUNITY_CREATE_SUBMIT}
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {create.isPending ? "Saving…" : "Create opportunity"}
          </button>
        </div>
      </form>
    </section>
  );
}
