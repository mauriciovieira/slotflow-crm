import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../lib/api";
import { useAcceptPassword, useInvitePreflight, useOauthStart } from "../lib/inviteHooks";
import { renderMarkdown } from "../lib/markdown";
import { TestIds } from "../testIds";
import lockup from "../assets/brand/lockup.svg";

function ErrorScreen({
  testId,
  title,
  body,
}: {
  testId: string;
  title: string;
  body: string;
}) {
  return (
    <main
      data-testid={testId}
      className="min-h-full flex items-center justify-center px-8"
    >
      <div className="max-w-md text-center">
        <img src={lockup} alt="Slotflow" height={22} className="mx-auto mb-8" />
        <h1 className="text-[24px] font-semibold text-ink mb-3">{title}</h1>
        <p className="text-ink-secondary">{body}</p>
      </div>
    </main>
  );
}

function defaultWorkspaceName(email: string): string {
  // Backend WORKSPACE_NAME_RE = /^[A-Za-z0-9 '\-]{2,80}$/. Strip everything
  // outside that allowlist from the email local-part so the default value
  // submits cleanly without the user having to re-edit the field.
  const raw = (email.split("@")[0] || "").toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9'\- ]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned ? `${cleaned}'s workspace` : "my workspace";
}

function bannerText(code: string | null): string | null {
  switch (code) {
    case "email_mismatch":
      return "OAuth email did not match the invite. Use the matching account.";
    case "user_exists":
      return "An account already exists for this email. Contact admin.";
    case "oauth_failed":
      return "Sign-in cancelled or failed. Try again.";
    default:
      return null;
  }
}

export function AcceptInvite() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, error, isLoading } = useInvitePreflight(token);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error");

  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [hasReadToS, setHasReadToS] = useState(false);
  const [tosAgreed, setTosAgreed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const accept = useAcceptPassword(token);
  const oauthStart = useOauthStart(token);

  useEffect(() => {
    if (data?.email) setWorkspaceName(defaultWorkspaceName(data.email));
  }, [data?.email]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) setHasReadToS(true);
  }, [data?.terms_version?.body_markdown]);

  const tosHtml = useMemo(
    () =>
      data?.terms_version ? renderMarkdown(data.terms_version.body_markdown) : "",
    [data?.terms_version],
  );

  if (isLoading)
    return (
      <div className="px-8 py-12 text-ink-secondary">Loading invite…</div>
    );

  if (error instanceof ApiError) {
    if (error.status === 404) {
      return (
        <ErrorScreen
          testId={TestIds.ACCEPT_INVITE_INVALID}
          title="Invalid invite link"
          body="The link you followed isn't recognised. Double-check the URL or contact your administrator."
        />
      );
    }
    if (error.status === 410) {
      // Backend returns `{error: "revoked" | "already_used" | "expired"}`.
      // Branch on the structured field rather than the flattened message so
      // the UI doesn't break if message phrasing changes.
      const reason =
        error.body && typeof error.body === "object" && "error" in error.body
          ? String((error.body as { error: unknown }).error)
          : "";
      if (reason === "revoked") {
        return (
          <ErrorScreen
            testId={TestIds.ACCEPT_INVITE_REVOKED}
            title="Invite revoked"
            body="This invite has been revoked. Contact your administrator to request a new one."
          />
        );
      }
      if (reason === "already_used") {
        return (
          <ErrorScreen
            testId={TestIds.ACCEPT_INVITE_ALREADY_USED}
            title="Invite already used"
            body="This invite has already been accepted. Sign in to your account instead."
          />
        );
      }
      return (
        <ErrorScreen
          testId={TestIds.ACCEPT_INVITE_EXPIRED}
          title="Invite expired"
          body="This invite has expired. Contact your administrator to request a new one."
        />
      );
    }
  }

  if (!data || !data.terms_version) {
    return (
      <ErrorScreen
        testId={TestIds.ACCEPT_INVITE_INVALID}
        title="Invite unavailable"
        body="The current Terms of Service could not be loaded. Try again later or contact your administrator."
      />
    );
  }
  const terms = data.terms_version;

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4)
      setHasReadToS(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    try {
      const result = await accept.mutateAsync({
        password,
        workspace_name: workspaceName,
        terms_version_id: terms.id,
      });
      navigate(result.next, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.body && typeof err.body === "object") {
        setFieldErrors(err.body as Record<string, string[]>);
        return;
      }
      setFieldErrors({
        password: [err instanceof Error ? err.message : "Sign-up failed."],
      });
    }
  }

  async function startOauth(provider: "google" | "github") {
    try {
      const result = await oauthStart.mutateAsync({
        provider,
        workspace_name: workspaceName,
        terms_version_id: terms.id,
      });
      // Refuse anything that isn't a same-origin root-relative path. Belt-and-
      // suspenders against an open-redirect if the backend ever changes.
      const url = result.redirect_url;
      if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) {
        setFieldErrors({ workspace_name: ["OAuth start returned an invalid redirect."] });
        return;
      }
      window.location.href = url;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.body && typeof err.body === "object") {
        setFieldErrors(err.body as Record<string, string[]>);
        return;
      }
      setFieldErrors({
        workspace_name: [
          err instanceof Error ? err.message : "Could not start OAuth sign-in.",
        ],
      });
    }
  }

  const submitDisabled =
    !hasReadToS || !tosAgreed || !password || accept.isPending;
  const oauthDisabled = !hasReadToS || !tosAgreed || oauthStart.isPending;
  const banner = bannerText(errorCode);

  return (
    <main
      data-testid={TestIds.ACCEPT_INVITE_PAGE}
      className="min-h-full grid grid-cols-1 md:grid-cols-2"
    >
      <section className="flex flex-col justify-center px-8 md:px-16 py-12">
        <img src={lockup} alt="Slotflow" height={22} className="mb-12" />
        <h1 className="text-[32px] font-semibold tracking-[-0.64px] text-ink mb-3">
          You&apos;re invited to Slotflow
        </h1>
        {banner && (
          <p
            role="alert"
            data-testid={TestIds.ACCEPT_INVITE_ERROR_BANNER}
            className="mb-6 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {banner}
          </p>
        )}
        <p className="text-ink-secondary mb-2">Email:</p>
        <p
          data-testid={TestIds.ACCEPT_INVITE_EMAIL}
          className="text-ink mb-6"
        >
          {data.email}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">
              Workspace name
            </span>
            <input
              type="text"
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              data-testid={TestIds.ACCEPT_INVITE_WORKSPACE}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            />
            {fieldErrors.workspace_name?.map((msg) => (
              <span
                key={msg}
                data-testid={TestIds.ACCEPT_INVITE_FIELD_ERROR}
                className="text-sm text-danger"
              >
                {msg}
              </span>
            ))}
          </label>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => startOauth("google")}
              data-testid={TestIds.ACCEPT_INVITE_GOOGLE}
              disabled={oauthDisabled}
              className="w-full border border-border-subtle rounded-md py-2 text-ink hover:bg-surface-card disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => startOauth("github")}
              data-testid={TestIds.ACCEPT_INVITE_GITHUB}
              disabled={oauthDisabled}
              className="w-full border border-border-subtle rounded-md py-2 text-ink hover:bg-surface-card disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Continue with GitHub
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-xs text-ink-muted uppercase tracking-wider">
              or
            </span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>

          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid={TestIds.ACCEPT_INVITE_PASSWORD}
              className="w-full border border-border-subtle rounded-md px-3 py-2 bg-surface focus:outline-none focus:border-brand"
            />
            {fieldErrors.password?.map((msg) => (
              <span
                key={msg}
                data-testid={TestIds.ACCEPT_INVITE_FIELD_ERROR}
                className="text-sm text-danger"
              >
                {msg}
              </span>
            ))}
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm text-ink-secondary mb-1">
              Terms of Service ({terms.version})
            </legend>
            <div
              ref={scrollRef}
              onScroll={onScroll}
              data-testid={TestIds.ACCEPT_INVITE_TOS_SCROLL}
              className="max-h-[40vh] overflow-y-auto border border-border-subtle rounded-md p-4 bg-surface text-sm prose"
              dangerouslySetInnerHTML={{ __html: tosHtml }}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={!hasReadToS}
                checked={tosAgreed}
                onChange={(e) => setTosAgreed(e.target.checked)}
                data-testid={TestIds.ACCEPT_INVITE_TOS_CHECKBOX}
                aria-describedby={TestIds.ACCEPT_INVITE_TOS_CAPTION}
              />
              I agree to the Terms of Service.
            </label>
            {!hasReadToS && (
              <span
                id={TestIds.ACCEPT_INVITE_TOS_CAPTION}
                data-testid={TestIds.ACCEPT_INVITE_TOS_CAPTION}
                aria-live="polite"
                className="text-xs text-ink-muted"
              >
                Scroll to the bottom to enable.
              </span>
            )}
          </fieldset>

          <button
            type="submit"
            disabled={submitDisabled}
            data-testid={TestIds.ACCEPT_INVITE_SUBMIT}
            className="w-full rounded-md bg-brand text-white py-2 font-medium hover:bg-brand-deep disabled:opacity-60"
          >
            {accept.isPending ? "Creating account…" : "Accept invite"}
          </button>
        </form>
      </section>
      <aside
        className="hidden md:flex items-center justify-center p-12"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, var(--color-brand-light), transparent 60%), var(--color-bg)",
        }}
      />
    </main>
  );
}
