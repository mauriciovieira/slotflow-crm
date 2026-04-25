import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type McpToken,
  type McpTokenIssued,
  useIssueMcpToken,
  useMcpTokens,
  useRevokeMcpToken,
} from "../lib/mcpTokensHooks";
import { TestIds } from "../testIds";

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

function PlaintextPanel({
  issued,
  onDismiss,
}: {
  issued: McpTokenIssued;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Track the "Copied" flash timer so we can cancel it on unmount or on
  // a follow-up copy. Without this, dismissing the panel between copy
  // and timeout fires `setCopied(false)` after the component is gone.
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) {
        clearTimeout(copyTimer.current);
        copyTimer.current = null;
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(issued.plaintext);
      setCopied(true);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 2000);
    } catch {
      // Clipboard API can fail (e.g., insecure context); the input is
      // selectable so the user can copy by hand.
    }
  }

  return (
    <div
      data-testid={TestIds.SETTINGS_MCP_PLAINTEXT_PANEL}
      className="mb-4 rounded-lg border border-warning bg-warning-light p-4"
    >
      <p className="text-sm font-medium text-ink mb-2">
        Copy this token now — it won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={issued.plaintext}
          onFocus={(e) => e.currentTarget.select()}
          // The plaintext value is a one-shot secret. Opt out of every
          // browser-side capture path that could surface it later
          // (autocomplete history, password managers, autocorrect /
          // spellcheck dictionaries, mobile auto-capitalization).
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-testid={TestIds.SETTINGS_MCP_PLAINTEXT_VALUE}
          className="flex-1 font-mono text-xs border border-border-subtle rounded-md px-2 py-1 bg-surface focus:outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={handleCopy}
          data-testid={TestIds.SETTINGS_MCP_PLAINTEXT_COPY}
          className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          data-testid={TestIds.SETTINGS_MCP_PLAINTEXT_DISMISS}
          className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function IssueForm({
  onIssued,
}: {
  onIssued: (issued: McpTokenIssued) => void;
}) {
  const issue = useIssueMcpToken();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    try {
      const result = await issue.mutateAsync({ name: trimmed });
      onIssued(result);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue token.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid={TestIds.SETTINGS_MCP_ISSUE_FORM}
      // `noValidate` lets the custom inline error path (`Name is
      // required.`) run consistently in real browsers. With native
      // constraint validation the empty-input submit is silently
      // suppressed, so the inline error never renders.
      noValidate
      className="border border-border-subtle rounded-lg p-3 mb-4 space-y-2 bg-surface"
    >
      <label className="block">
        <span className="text-xs text-ink-secondary mb-1 block">Token name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid={TestIds.SETTINGS_MCP_ISSUE_NAME}
          className="w-full border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand"
          placeholder="My laptop"
        />
      </label>
      {error && (
        <p
          role="alert"
          data-testid={TestIds.SETTINGS_MCP_ISSUE_ERROR}
          className="text-xs text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={issue.isPending}
          data-testid={TestIds.SETTINGS_MCP_ISSUE_SUBMIT}
          className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep disabled:opacity-60"
        >
          {issue.isPending ? "Issuing…" : "Issue token"}
        </button>
      </div>
    </form>
  );
}

function RevokeButton({ token }: { token: McpToken }) {
  const revoke = useRevokeMcpToken(token.id);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (token.revoked_at) {
    return <span className="text-xs text-ink-muted">revoked</span>;
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        data-testid={`${TestIds.SETTINGS_MCP_REVOKE}-${token.id}`}
        className="text-xs font-medium text-danger hover:underline"
      >
        Revoke
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            setError(null);
            try {
              await revoke.mutateAsync();
              setConfirming(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not revoke.");
            }
          }}
          disabled={revoke.isPending}
          data-testid={`${TestIds.SETTINGS_MCP_REVOKE_CONFIRM}-${token.id}`}
          className="rounded-md bg-danger text-white px-2 py-1 text-xs font-medium disabled:opacity-60"
        >
          {revoke.isPending ? "Revoking…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          data-testid={`${TestIds.SETTINGS_MCP_REVOKE_CANCEL}-${token.id}`}
          className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p
          role="alert"
          data-testid={`${TestIds.SETTINGS_MCP_REVOKE_ERROR}-${token.id}`}
          className="text-xs text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function McpTokensSection() {
  const query = useMcpTokens();
  const [composing, setComposing] = useState(false);
  // Plaintext lives in component state only — never in React Query cache.
  // The user sees it once, copies it, dismisses the panel, and it's gone.
  const [issued, setIssued] = useState<McpTokenIssued | null>(null);

  return (
    <section
      data-testid={TestIds.SETTINGS_MCP_SECTION}
      className="mt-8 rounded-xl border border-border-subtle bg-surface-card p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-ink">MCP tokens</h2>
        {!composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            data-testid={TestIds.SETTINGS_MCP_ISSUE_TOGGLE}
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
          >
            Issue token
          </button>
        )}
      </div>

      {issued && (
        <PlaintextPanel issued={issued} onDismiss={() => setIssued(null)} />
      )}

      {composing && (
        <>
          <IssueForm
            onIssued={(payload) => {
              setIssued(payload);
              setComposing(false);
            }}
          />
          <div className="flex items-center justify-end mb-4">
            <button
              type="button"
              onClick={() => setComposing(false)}
              data-testid={TestIds.SETTINGS_MCP_ISSUE_CANCEL}
              className="text-sm text-ink-secondary hover:text-ink"
            >
              Close
            </button>
          </div>
        </>
      )}

      {query.isLoading ? (
        <p data-testid={TestIds.SETTINGS_MCP_LOADING} className="text-sm text-ink-secondary">
          Loading tokens…
        </p>
      ) : query.error ? (
        <div data-testid={TestIds.SETTINGS_MCP_ERROR} className="text-sm text-ink-secondary">
          <p className="mb-2">Could not load tokens.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="rounded-md border border-border-subtle px-2 py-1 text-xs font-medium text-ink hover:bg-surface-card"
          >
            Try again
          </button>
        </div>
      ) : (query.data ?? []).length === 0 ? (
        <p data-testid={TestIds.SETTINGS_MCP_EMPTY} className="text-sm text-ink-secondary">
          No tokens yet.
        </p>
      ) : (
        <table
          data-testid={TestIds.SETTINGS_MCP_LIST}
          className="w-full border border-border-subtle rounded-lg overflow-hidden text-sm"
        >
          <thead className="bg-surface text-ink-secondary text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Last 4</th>
              <th className="px-3 py-2 font-medium">Last used</th>
              <th className="px-3 py-2 font-medium">Created</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((row: McpToken) => (
              <tr
                key={row.id}
                data-testid={`${TestIds.SETTINGS_MCP_ROW}-${row.id}`}
                className={`border-t border-border-subtle ${row.revoked_at ? "opacity-60" : ""}`}
              >
                <td className="px-3 py-2 text-ink font-medium">{row.name}</td>
                <td className="px-3 py-2 text-ink-secondary font-mono">{row.last_four}</td>
                <td className="px-3 py-2 text-ink-secondary">{formatDate(row.last_used_at)}</td>
                <td className="px-3 py-2 text-ink-secondary">{formatDate(row.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <RevokeButton token={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
