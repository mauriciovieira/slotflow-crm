import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useCreateResume } from "../lib/resumesHooks";
import { TestIds } from "../testIds";

export function ResumeCreate() {
  const navigate = useNavigate();
  const create = useCreateResume();
  const [name, setName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      // Block whitespace-only submissions client-side. The native `required`
      // attribute only rejects fully empty inputs; trimming here gives a
      // friendlier error than the API's generic 400 detail.
      setSubmitError("Name is required.");
      return;
    }
    try {
      const created = await create.mutateAsync({ name: trimmed });
      navigate(`/dashboard/resumes/${created.id}`, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create resume.");
    }
  }

  return (
    <section className="px-6 py-6 max-w-2xl mx-auto">
      <form
        onSubmit={handleSubmit}
        data-testid={TestIds.RESUME_CREATE_FORM}
        className="rounded-xl border border-border-subtle bg-surface-card p-6 space-y-4"
      >
        <header>
          <h1 className="text-page-title text-ink">New resume</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Pick a name. You&apos;ll add the first version on the next screen.
          </p>
        </header>

        <label className="block">
          <span className="text-sm text-ink-secondary mb-1 block">Name</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid={TestIds.RESUME_CREATE_NAME}
            className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            placeholder="Senior Eng — backend"
          />
        </label>

        {submitError && (
          <p
            role="alert"
            data-testid={TestIds.RESUME_CREATE_ERROR}
            className="text-sm text-danger"
          >
            {submitError}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/dashboard/resumes")}
            data-testid={TestIds.RESUME_CREATE_CANCEL}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            data-testid={TestIds.RESUME_CREATE_SUBMIT}
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {create.isPending ? "Saving…" : "Create resume"}
          </button>
        </div>
      </form>
    </section>
  );
}
