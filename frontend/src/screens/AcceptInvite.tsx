import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useAcceptInvitation } from "../lib/membersHooks";
import { TestIds } from "../testIds";

export function AcceptInvite() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const accept = useAcceptInvitation();

  useEffect(() => {
    if (!token) return;
    accept.mutate(token, {
      onSuccess: () => {
        // Redirect into the dashboard once the membership is created.
        navigate("/dashboard/opportunities", { replace: true });
      },
    });
    // The mutation is intentionally fire-once on mount; we don't include
    // it in deps so a re-render of the screen never re-triggers accept.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function retry() {
    if (!token) return;
    accept.mutate(token, {
      onSuccess: () =>
        navigate("/dashboard/opportunities", { replace: true }),
    });
  }

  return (
    <section
      data-testid={TestIds.ACCEPT_INVITE_SCREEN}
      className="px-6 py-10 max-w-md mx-auto text-center"
    >
      {accept.isPending || accept.isIdle ? (
        <p
          data-testid={TestIds.ACCEPT_INVITE_LOADING}
          className="text-sm text-ink-secondary"
        >
          Joining workspace…
        </p>
      ) : accept.isError ? (
        <div>
          <p
            data-testid={TestIds.ACCEPT_INVITE_ERROR}
            className="mb-3 text-sm text-danger"
          >
            {accept.error instanceof Error
              ? accept.error.message
              : "Could not accept invitation."}
          </p>
          <button
            type="button"
            onClick={retry}
            data-testid={TestIds.ACCEPT_INVITE_RETRY}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-ink hover:bg-surface-card"
          >
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}
