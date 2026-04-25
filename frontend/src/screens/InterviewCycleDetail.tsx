import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { InterviewStepResumesSection } from "../components/InterviewStepResumesSection";
import {
  STEP_KINDS,
  STEP_KIND_LABEL,
  STEP_STATUSES,
  STEP_STATUS_LABEL,
  type InterviewStep,
  type InterviewStepKind,
  type InterviewStepStatus,
  isNotFound,
  useAddInterviewStep,
  useInterviewCycle,
  useInterviewSteps,
  useUpdateStepStatus,
} from "../lib/interviewsHooks";
import { TestIds } from "../testIds";

const BACK_HREF = "/dashboard/interviews";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
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

function StepStatusSelect({
  cycleId,
  step,
}: {
  cycleId: string;
  step: InterviewStep;
}) {
  const update = useUpdateStepStatus(cycleId, step.id);
  // Hold the user's selection in local state so the controlled `<select>`
  // reflects the in-flight value while the mutation runs. Without this,
  // React would re-render with `step.status` (still the old value) before
  // the cache invalidation lands and the select would visually snap back.
  const [pending, setPending] = useState<InterviewStepStatus | null>(null);
  const value = pending ?? step.status;
  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value as InterviewStepStatus;
        if (next !== step.status) {
          setPending(next);
          update.mutate(
            { status: next },
            { onSettled: () => setPending(null) },
          );
        }
      }}
      disabled={update.isPending}
      data-testid={`${TestIds.INTERVIEW_CYCLE_STEP_STATUS_SELECT}-${step.id}`}
      className="border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface"
    >
      {STEP_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STEP_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

export function InterviewCycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const query = useInterviewCycle(cycleId);
  const stepsQuery = useInterviewSteps(cycleId);
  const addStep = useAddInterviewStep(cycleId ?? "");

  const [composing, setComposing] = useState(false);
  const [stepKind, setStepKind] = useState<InterviewStepKind>("phone");
  const [interviewer, setInterviewer] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);

  if (query.isLoading) {
    return <div className="px-8 py-12 text-ink-secondary">Loading cycle…</div>;
  }

  if (query.error) {
    if (isNotFound(query.error)) {
      return (
        <div
          data-testid={TestIds.INTERVIEW_CYCLE_DETAIL_NOT_FOUND}
          className="px-8 py-20 text-center max-w-2xl mx-auto"
        >
          <p className="font-mono text-xs uppercase tracking-wider text-ink-muted mb-3">
            Not found
          </p>
          <h2 className="text-page-title text-ink mb-4">That cycle doesn&apos;t exist.</h2>
          <Link
            to={BACK_HREF}
            data-testid={TestIds.INTERVIEW_CYCLE_DETAIL_BACK}
            className="text-brand-deep hover:underline"
          >
            ← Back to list
          </Link>
        </div>
      );
    }
    return (
      <div
        data-testid={TestIds.INTERVIEW_CYCLE_DETAIL_ERROR}
        className="px-8 py-12 text-center text-ink-secondary"
      >
        <p className="mb-3">Could not load this cycle.</p>
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

  const cycle = query.data;
  if (!cycle) return null;

  const steps = stepsQuery.data ?? [];
  const stepsLoading = stepsQuery.isLoading;
  const stepsError = stepsQuery.error;

  async function handleAddStep(event: FormEvent) {
    event.preventDefault();
    setStepError(null);
    const trimmedInterviewer = interviewer.trim();
    try {
      await addStep.mutateAsync({
        kind: stepKind,
        ...(trimmedInterviewer ? { interviewer: trimmedInterviewer } : {}),
      });
      setComposing(false);
      setInterviewer("");
    } catch (err) {
      setStepError(err instanceof Error ? err.message : "Could not add step.");
    }
  }

  return (
    <section className="px-6 py-6 max-w-3xl mx-auto">
      <Link
        to={BACK_HREF}
        data-testid={TestIds.INTERVIEW_CYCLE_DETAIL_BACK}
        className="text-sm text-ink-secondary hover:text-ink mb-4 inline-block"
      >
        ← Back to list
      </Link>

      <header className="mb-6">
        <h1
          data-testid={TestIds.INTERVIEW_CYCLE_DETAIL_HEADING}
          className="text-page-title text-ink"
        >
          {cycle.name}
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Started {formatDate(cycle.started_at)}
        </p>
      </header>

      <div className="rounded-xl border border-border-subtle bg-surface-card p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-ink">Steps</h2>
          {!composing && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              data-testid={TestIds.INTERVIEW_CYCLE_NEW_STEP_TOGGLE}
              className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
            >
              New step
            </button>
          )}
        </div>

        {composing && (
          <form
            onSubmit={handleAddStep}
            data-testid={TestIds.INTERVIEW_CYCLE_NEW_STEP_FORM}
            className="border border-border-subtle rounded-lg p-4 mb-6 space-y-3 bg-surface"
          >
            <label className="block">
              <span className="text-sm text-ink-secondary mb-1 block">Kind</span>
              <select
                value={stepKind}
                onChange={(e) => setStepKind(e.target.value as InterviewStepKind)}
                data-testid={TestIds.INTERVIEW_CYCLE_NEW_STEP_KIND}
                className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
              >
                {STEP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {STEP_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-ink-secondary mb-1 block">
                Interviewer (optional)
              </span>
              <input
                type="text"
                value={interviewer}
                onChange={(e) => setInterviewer(e.target.value)}
                data-testid={TestIds.INTERVIEW_CYCLE_NEW_STEP_INTERVIEWER}
                className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
                placeholder="Jane Doe"
              />
            </label>
            {stepError && (
              <p
                role="alert"
                data-testid={TestIds.INTERVIEW_CYCLE_NEW_STEP_ERROR}
                className="text-sm text-danger"
              >
                {stepError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setComposing(false);
                  setStepError(null);
                }}
                data-testid={TestIds.INTERVIEW_CYCLE_NEW_STEP_CANCEL}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addStep.isPending}
                data-testid={TestIds.INTERVIEW_CYCLE_NEW_STEP_SUBMIT}
                className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
              >
                {addStep.isPending ? "Saving…" : "Save step"}
              </button>
            </div>
          </form>
        )}

        {stepsLoading ? (
          <p
            data-testid={TestIds.INTERVIEW_CYCLE_STEPS_LOADING}
            className="text-sm text-ink-secondary"
          >
            Loading steps…
          </p>
        ) : stepsError ? (
          <div
            data-testid={TestIds.INTERVIEW_CYCLE_STEPS_ERROR}
            className="text-sm text-ink-secondary"
          >
            <p className="mb-2">Could not load steps.</p>
            <button
              type="button"
              onClick={() => stepsQuery.refetch()}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card"
            >
              Try again
            </button>
          </div>
        ) : steps.length === 0 ? (
          <p
            data-testid={TestIds.INTERVIEW_CYCLE_STEPS_EMPTY}
            className="text-sm text-ink-secondary"
          >
            No steps yet. Add the first one when something gets scheduled.
          </p>
        ) : (
          <ul
            data-testid={TestIds.INTERVIEW_CYCLE_STEPS_LIST}
            className="divide-y divide-border-subtle"
          >
            {steps.map((step: InterviewStep) => (
              <li
                key={step.id}
                data-testid={`${TestIds.INTERVIEW_CYCLE_STEP_ROW}-${step.id}`}
                className="py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-ink font-medium">
                      {step.sequence}. {STEP_KIND_LABEL[step.kind]}
                    </p>
                    {step.interviewer && (
                      <p className="text-sm text-ink-secondary">{step.interviewer}</p>
                    )}
                  </div>
                  <StepStatusSelect cycleId={cycleId ?? ""} step={step} />
                </div>
                <InterviewStepResumesSection
                  stepId={step.id}
                  cycleId={cycleId ?? ""}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
