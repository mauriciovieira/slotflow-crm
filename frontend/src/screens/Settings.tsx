import { type FormEvent, useState } from "react";
import { useActiveWorkspace } from "../lib/activeWorkspaceHooks";
import {
  type FxRate,
  useDeleteFxRate,
  useFxRates,
  useUpsertFxRate,
} from "../lib/fxRatesHooks";
import { TestIds } from "../testIds";

function todayIso(): string {
  // Build the YYYY-MM-DD string in the user's local timezone. Using
  // `toISOString().slice(0, 10)` would be UTC, which prefills the
  // wrong calendar day for users east/west of UTC near local midnight.
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function DeleteButton({
  workspaceId,
  rate,
}: {
  workspaceId: string;
  rate: FxRate;
}) {
  const del = useDeleteFxRate(workspaceId, rate.id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rate.source !== "manual") {
    // Hide delete on non-manual rows so an automated rate isn't silently
    // wiped from the FE; admins can still drop one via the Django admin.
    return <span className="text-xs text-ink-muted">—</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        data-testid={`${TestIds.SETTINGS_FX_DELETE}-${rate.id}`}
        className="text-xs font-medium text-danger hover:underline"
      >
        Delete
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          setError(null);
          try {
            await del.mutateAsync();
            setConfirming(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not delete.");
          }
        }}
        disabled={del.isPending}
        data-testid={`${TestIds.SETTINGS_FX_DELETE_CONFIRM}-${rate.id}`}
        className="rounded-md bg-danger text-white px-2 py-1 text-xs font-medium disabled:opacity-60"
      >
        {del.isPending ? "Deleting…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        data-testid={`${TestIds.SETTINGS_FX_DELETE_CANCEL}-${rate.id}`}
        className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

function UpsertForm({ workspaceId }: { workspaceId: string }) {
  const upsert = useUpsertFxRate(workspaceId);
  const [currency, setCurrency] = useState("");
  const [base, setBase] = useState("USD");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedCurrency = currency.trim().toUpperCase();
    const trimmedBase = base.trim().toUpperCase();
    if (!trimmedCurrency) {
      setError("Currency is required.");
      return;
    }
    if (!rate) {
      setError("Rate is required.");
      return;
    }
    try {
      await upsert.mutateAsync({
        workspace: workspaceId,
        currency: trimmedCurrency,
        base_currency: trimmedBase,
        rate,
        date,
      });
      setCurrency("");
      setRate("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rate.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={TestIds.SETTINGS_FX_FORM}
      className="border border-border-subtle rounded-lg p-4 mb-4 space-y-3 bg-surface"
    >
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1 block">Currency</span>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            data-testid={TestIds.SETTINGS_FX_FORM_CURRENCY}
            placeholder="EUR"
            className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1 block">Base</span>
          <input
            type="text"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            data-testid={TestIds.SETTINGS_FX_FORM_BASE}
            placeholder="USD"
            className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1 block">Rate</span>
          <input
            type="number"
            step="any"
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            data-testid={TestIds.SETTINGS_FX_FORM_RATE}
            placeholder="0.92"
            className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-secondary mb-1 block">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            data-testid={TestIds.SETTINGS_FX_FORM_DATE}
            className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          />
        </label>
      </div>
      {error && (
        <p
          role="alert"
          data-testid={TestIds.SETTINGS_FX_FORM_ERROR}
          className="text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={upsert.isPending}
          data-testid={TestIds.SETTINGS_FX_FORM_SUBMIT}
          className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
        >
          {upsert.isPending ? "Saving…" : "Add rate"}
        </button>
      </div>
    </form>
  );
}

export function Settings() {
  const activeQuery = useActiveWorkspace();
  const workspaceId = activeQuery.data?.active?.id ?? "";
  const fxQuery = useFxRates(workspaceId || undefined);

  return (
    <section
      data-testid={TestIds.SETTINGS_FX_SECTION}
      className="px-6 py-6 max-w-4xl mx-auto"
    >
      <header className="mb-6">
        <h1 className="text-page-title text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Workspace-scoped configuration. Today: FX rates used to compare
          compensation across currencies.
        </p>
      </header>

      <div className="rounded-xl border border-border-subtle bg-surface-card p-6">
        <h2 className="text-base font-semibold text-ink mb-4">FX rates</h2>

        {workspaceId ? (
          <UpsertForm workspaceId={workspaceId} />
        ) : (
          <p className="text-sm text-ink-secondary mb-4">
            Pick an active workspace to manage FX rates.
          </p>
        )}

        {fxQuery.isLoading ? (
          <p
            data-testid={TestIds.SETTINGS_FX_LOADING}
            className="text-sm text-ink-secondary"
          >
            Loading rates…
          </p>
        ) : fxQuery.error ? (
          <div data-testid={TestIds.SETTINGS_FX_ERROR} className="text-sm text-ink-secondary">
            <p className="mb-2">Could not load rates.</p>
            <button
              type="button"
              onClick={() => fxQuery.refetch()}
              className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
            >
              Try again
            </button>
          </div>
        ) : (fxQuery.data ?? []).length === 0 ? (
          <p data-testid={TestIds.SETTINGS_FX_EMPTY} className="text-sm text-ink-secondary">
            No rates yet.
          </p>
        ) : (
          <table
            data-testid={TestIds.SETTINGS_FX_LIST}
            className="w-full border border-border-subtle rounded-lg overflow-hidden text-sm"
          >
            <thead className="bg-surface text-ink-secondary text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Currency</th>
                <th className="px-3 py-2 font-medium">Base</th>
                <th className="px-3 py-2 font-medium">Rate</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(fxQuery.data ?? []).map((row: FxRate) => (
                <tr
                  key={row.id}
                  data-testid={`${TestIds.SETTINGS_FX_ROW}-${row.id}`}
                  className="border-t border-border-subtle"
                >
                  <td className="px-3 py-2 text-ink font-medium">{row.currency}</td>
                  <td className="px-3 py-2 text-ink-secondary">{row.base_currency}</td>
                  <td className="px-3 py-2 text-ink-secondary">{row.rate}</td>
                  <td className="px-3 py-2 text-ink-secondary">{row.date}</td>
                  <td className="px-3 py-2 text-ink-secondary">{row.source}</td>
                  <td className="px-3 py-2 text-right">
                    <DeleteButton workspaceId={workspaceId} rate={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
