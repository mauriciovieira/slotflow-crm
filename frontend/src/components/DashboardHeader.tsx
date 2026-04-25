import { useLogout, useMe } from "../lib/authHooks";
import { TestIds } from "../testIds";

export interface DashboardHeaderProps {
  title: string;
}

export function DashboardHeader({ title }: DashboardHeaderProps) {
  const me = useMe();
  const logout = useLogout();
  const username = me.data?.username ?? "";

  return (
    <header
      data-testid={TestIds.DASHBOARD_HEADER}
      className="h-14 flex items-center justify-between px-6 border-b border-border-subtle bg-surface"
    >
      <h1 className="text-base font-semibold text-ink">{title}</h1>
      <div className="flex items-center gap-4">
        <span
          data-testid={TestIds.SIGNED_IN_HEADER}
          className="text-sm text-ink-secondary"
        >
          Signed in as <span className="text-ink font-medium">{username}</span>
        </span>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          data-testid={TestIds.SIGN_OUT_BUTTON}
          className="rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-card disabled:opacity-60"
        >
          {logout.isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
