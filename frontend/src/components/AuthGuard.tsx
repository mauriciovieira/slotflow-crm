import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useMe } from "../lib/authHooks";

export interface AuthGuardProps {
  children: ReactNode;
  requireVerified?: boolean;
}

export function AuthGuard({ children, requireVerified = true }: AuthGuardProps) {
  const { data, isLoading } = useMe();
  const location = useLocation();

  if (isLoading || !data) {
    return (
      <main className="min-h-full flex items-center justify-center text-ink-secondary">
        Loading…
      </main>
    );
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
