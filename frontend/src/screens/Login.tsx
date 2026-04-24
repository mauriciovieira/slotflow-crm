import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import lockup from "../assets/brand/lockup.svg";
import { useLogin, useMe } from "../lib/authHooks";
import { TestIds } from "../testIds";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const login = useLogin();
  const navigate = useNavigate();

  const me = useMe();
  useEffect(() => {
    if (!me.data?.authenticated) return;
    // `is_verified` is the authoritative "fully authenticated" signal. In
    // production it implies a confirmed TOTP device; in dev under
    // SLOTFLOW_BYPASS_2FA it is forced true without a device. Check it first
    // so the bypass flow doesn't get intercepted by the device check below.
    if (me.data.is_verified) navigate("/dashboard", { replace: true });
    else if (!me.data.has_totp_device) navigate("/2fa/setup", { replace: true });
    else navigate("/2fa/verify", { replace: true });
  }, [me.data, navigate]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    try {
      const result = await login.mutateAsync({ username, password });
      if (result.is_verified) navigate("/dashboard", { replace: true });
      else if (!result.has_totp_device) navigate("/2fa/setup", { replace: true });
      else navigate("/2fa/verify", { replace: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <main className="min-h-full grid grid-cols-1 md:grid-cols-2">
      <section className="flex flex-col justify-center px-8 md:px-16 py-12">
        <img src={lockup} alt="Slotflow" height={22} className="mb-12" />
        <h1 className="text-[32px] font-semibold tracking-[-0.64px] text-ink mb-3">
          Welcome back
        </h1>
        <p className="text-ink-secondary mb-8">Sign in to your Slotflow workspace.</p>
        <div className="space-y-3 mb-6">
          <button
            type="button"
            disabled
            title="Not wired yet"
            aria-label="Continue with Google"
            className="w-full border border-border-subtle rounded-md py-2 text-ink opacity-60 cursor-not-allowed"
          >
            Continue with Google
          </button>
          <button
            type="button"
            disabled
            title="Not wired yet"
            aria-label="Continue with GitHub"
            className="w-full border border-border-subtle rounded-md py-2 text-ink opacity-60 cursor-not-allowed"
          >
            Continue with GitHub
          </button>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border-subtle" />
          <span className="text-xs text-ink-muted uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">Username</span>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              data-testid={TestIds.LOGIN_USERNAME}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid={TestIds.LOGIN_PASSWORD}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            />
          </label>
          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={login.isPending}
            data-testid={TestIds.LOGIN_SUBMIT}
            className="w-full rounded-md bg-brand text-white py-2 font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
      <aside
        className="hidden md:flex items-center justify-center p-12"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, var(--color-brand-light), transparent 60%), var(--color-bg)",
        }}
      >
        <div className="max-w-sm rounded-xl border border-border-subtle bg-surface-card p-6 shadow-card">
          <p className="text-xs text-ink-muted mb-2 uppercase tracking-wider">Next action</p>
          <p className="font-medium text-ink mb-1">Reply to Wave recruiter</p>
          <p className="text-sm text-ink-secondary">Today · 3:00 PM</p>
        </div>
      </aside>
    </main>
  );
}
