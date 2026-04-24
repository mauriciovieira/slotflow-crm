import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useMe } from "../lib/authHooks";

export interface AuthGuardProps {
  children: ReactNode;
  requireVerified?: boolean;
}

export function AuthGuard({ children, requireVerified = true }: AuthGuardProps) {
  const { data, isLoading, error } = useMe();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="min-h-full flex items-center justify-center text-ink-secondary">
        Loading…
      </main>
    );
  }

  // `/api/auth/me/` is unauthenticated-friendly: anonymous users get a 200 with
  // `authenticated: false`. Any error reaching it (network, 5xx) means we can't
  // prove the session state — treat it the same as anonymous and send the user
  // to /login so they can try again, rather than hanging on a loading screen.
  if (error || !data) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!data.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requireVerified && !data.is_verified) {
    // `is_verified` is the authoritative "fully authenticated" signal. In
    // production a true value implies a confirmed TOTP device; in dev under
    // SLOTFLOW_BYPASS_2FA it's forced true without a device. Only send the
    // user through setup/verify when they're not yet verified.
    if (!data.has_totp_device) {
      return <Navigate to="/2fa/setup" replace />;
    }
    return <Navigate to="/2fa/verify" replace />;
  }

  return <>{children}</>;
}
