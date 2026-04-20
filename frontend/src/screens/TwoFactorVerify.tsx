import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useVerifyTotp } from "../lib/authHooks";

export function TwoFactorVerify() {
  const verify = useVerifyTotp();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      await verify.mutateAsync(token.replace(/\s+/g, ""));
      navigate("/", { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Verification failed.");
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="max-w-sm w-full">
        <h1 className="text-[28px] font-semibold tracking-[-0.56px] text-ink mb-2">
          Verify it&apos;s you
        </h1>
        <p className="text-ink-secondary mb-6">
          Enter the 6-digit code from your authenticator app.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">6-digit code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9 ]*"
              required
              minLength={6}
              maxLength={8}
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand tracking-widest text-center text-lg"
            />
          </label>
          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={verify.isPending || token.length < 6}
            className="w-full rounded-md bg-brand text-white py-2 font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {verify.isPending ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </main>
  );
}
