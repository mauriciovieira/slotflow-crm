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

  if (requireVerified) {
    if (!data.has_totp_device) {
      return <Navigate to="/2fa/setup" replace />;
    }
    if (!data.is_verified) {
      return <Navigate to="/2fa/verify" replace />;
    }
  }

  return <>{children}</>;
}
