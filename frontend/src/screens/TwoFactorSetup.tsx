import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { useConfirmTotp, useTotpSetup } from "../lib/authHooks";

export function TwoFactorSetup() {
  const setup = useTotpSetup();
  const confirm = useConfirmTotp();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      const me = await confirm.mutateAsync(token.replace(/\s+/g, ""));
      // Confirm's success payload is the same `Me` that AuthGuard reads. The
      // backend currently marks the session OTP-verified as part of confirm,
      // so `is_verified` should be true — but if it ever isn't (e.g. stale
      // session, already-confirmed device on a non-OTP session), route to
      // /2fa/verify so AuthGuard doesn't bounce the user from `/` anyway.
      if (me?.is_verified) {
        navigate("/", { replace: true });
      } else {
        navigate("/2fa/verify", { replace: true });
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Confirmation failed.");
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full">
        <h1 className="text-[28px] font-semibold tracking-[-0.56px] text-ink mb-2">
          Set up two-factor auth
        </h1>
        <p className="text-ink-secondary mb-6">
          Scan the QR with any authenticator app, then enter the 6-digit code to confirm.
        </p>
        {setup.isLoading && <p className="text-ink-secondary">Loading QR…</p>}
        {setup.error instanceof Error && (
          <p role="alert" className="text-sm text-danger">
            {setup.error.message}
          </p>
        )}
        {setup.data && (
          <>
            <div
              className="mx-auto w-64 h-64 mb-6 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: setup.data.qr_svg }}
            />
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
                disabled={confirm.isPending || token.length < 6}
                className="w-full rounded-md bg-brand text-white py-2 font-medium hover:bg-brand-deep disabled:opacity-60"
              >
                {confirm.isPending ? "Confirming…" : "Confirm"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
