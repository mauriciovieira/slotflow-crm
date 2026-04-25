# Invite + OAuth Signup — Design

**Date:** 2026-04-25
**Status:** Brainstorm complete, awaiting user review before plan
**Scope:** First subsystem of a larger billing/onboarding track. Covers admin-issued invites, OAuth (Google + GitHub) and password signup paths, ToS acceptance, admin invitee management, and 2FA branching when an OAuth provider asserts MFA.

## Context

`Login.tsx` ships with disabled "Continue with Google" / "Continue with GitHub" placeholders and `Landing.tsx` points "Get started" at `/login?signup=1`, but no signup flow exists. The product spec assumed admin-created users; this design wires real onboarding while keeping the system invite-only (no public self-serve).

### Followups parked from the same brainstorm

The user's original prompt covered five additional subsystems. Each will get its own brainstorm → spec → plan cycle. Build order:

1. **This spec** — invite + OAuth signup.
2. Plans + paywall enforcement (Free: 5-opportunity cap; Premium tier).
3. Polar.sh subscription wiring (https://polar.sh/) — checkout + webhooks.
4. Coupons (https://polar.sh/docs/features/discounts) — admin creates codes redeemable for 3 months Premium free.
5. API consumption metering (Polar.sh usage-based billing).
6. Referrals — paying user invites friend; both get +1 month credit on successful conversion.

The data model in this spec leaves room for plan/subscription/credit fields without forcing them now.

## Goals

- Platform admin (Django superuser) can issue per-email invite links from `/admin/`.
- Invitee opens link, accepts ToS, picks one of three credential paths (Google OAuth, GitHub OAuth, email + password), lands on `/2fa/setup` (or `/dashboard` if their OAuth provider asserted MFA).
- Each invitee gets a freshly-created `Workspace` and OWNER `Membership` on accept.
- Admin can revoke / resend / delete invites and view full lifecycle status.
- Every state transition is captured in the existing `audit.write_audit_event` trail.
- Existing 2FA mandate is preserved end-to-end; OAuth never silently bypasses it without provider-asserted MFA.

## Non-goals

- Self-serve signup (no public registration page; "Get started" copy on Landing becomes "Request invite" with a `mailto:` placeholder).
- Email delivery infrastructure (SES / SendGrid / SMTP). Admin copies the generated invite URL out of band.
- Multi-tenant invitation (admin invites a user to an existing workspace) — every invitee gets a new workspace per Q6=a.
- Workspace switching, multi-workspace membership management — separate spec.
- Plans / paywall enforcement — separate spec (followup #2).
- Polar.sh integration — separate spec (followup #3).
- Productionised legal-reviewed Terms of Service text — placeholder body only; spec lists this as an open item.
- E2E coverage of the OAuth callback paths — needs provider mocking infra; deferred.

## Decisions

| # | Topic | Decision |
|---|---|---|
| Q3 | Invite issuer | Platform admin only (Django `is_superuser`) |
| Q4 | Delivery | Generated link only; admin copies and shares manually |
| Q5 | Token lifecycle | Single-use, 7-day expiry |
| Q6 | Workspace at accept | Auto-create new `Workspace` + OWNER `Membership` per invitee |
| Q7 | Credential modes | OAuth (Google + GitHub) **and** email/password — invitee chooses |
| Q8 | Email match | Strict — OAuth account email **must** equal invite email |
| Q9 | Username | `User.username = email` |
| Q10 | 2FA after OAuth | Skip TOTP setup if provider asserts MFA; otherwise enforce |
| Q11 | Email collision | Reject at accept time (HTTP 409). Admin sees failed attempt in audit log |
| Q12 | Admin actions | Full CRUD: view, revoke, resend, delete |
| Q13 | Audit events | Full lifecycle (issued / resent / revoked / deleted / accepted / rejected variants) |
| Q14 | Workspace name | Auto-default `"<email-local>'s workspace"`; user renames in settings |
| Q15 | ToS | Required checkbox **with scroll-to-bottom gate**; placeholder ToS body in `docs/legal/terms-v0.1.0.md` |

| # | Architecture | Choice |
|---|---|---|
| A | OAuth library | `django-allauth` |
| B | Token storage | Opaque random (`secrets.token_urlsafe(32)`), SHA256-hashed at rest |
| C | Frontend route | Standalone `/accept-invite/:token` |
| D | Terms versioning | `TermsVersion` model + `User.accepted_terms_version` FK |

## Architecture

### 1. New `invites/` Django app

Sibling to `tenancy/`, `identity/`, `core/`. Registered in `config/settings/base.py::INSTALLED_APPS`.

#### `invites/models.py`

```python
class Invite(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending"
        ACCEPTED = "accepted"
        REVOKED = "revoked"

    email = models.EmailField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)  # SHA256 hex
    expires_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name="invites_issued",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="invite_accepted",
    )
    workspace = models.ForeignKey(
        "tenancy.Workspace", on_delete=models.SET_NULL, null=True, blank=True,
    )

    class Meta:
        indexes = [models.Index(fields=["status", "-created_at"])]

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    @property
    def is_consumable(self) -> bool:
        return self.status == self.Status.PENDING and not self.is_expired

    def mark_accepted(self, *, user, workspace) -> None: ...
```

- Raw token never persisted; only `token_hash`. URL contains the raw token; backend hashes on lookup.
- "Expired" is **derived** (computed property), not a row state. Avoids a cron flipping rows. Admin filter combines `status==PENDING` with `expires_at > now()`.
- `created_by` is `PROTECT`: a superuser cannot be deleted while live invites point at them. Forces explicit revoke first.

#### `invites/services/tokens.py`

```python
def issue_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex_hash). Raw must only be shown once."""
    raw = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed

def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
```

### 2. `core/models.py` additions — Terms versioning

```python
class TermsVersion(TimeStampedModel):
    version = models.CharField(max_length=32, unique=True)  # e.g. "0.1.0-draft"
    body = models.TextField()                               # markdown
    effective_at = models.DateTimeField()

    @classmethod
    def current(cls) -> "TermsVersion | None":
        return (
            cls.objects.filter(effective_at__lte=timezone.now())
            .order_by("-effective_at").first()
        )
```

### 3. `identity/models.py` — `User` field additions

```python
accepted_terms_version = models.ForeignKey(
    "core.TermsVersion", on_delete=models.PROTECT, null=True, blank=True,
)
accepted_terms_at = models.DateTimeField(null=True, blank=True)
```

`PROTECT` so a `TermsVersion` row that has any acceptances cannot be deleted. ToS history is append-only.

### 4. allauth integration

#### Settings (`config/settings/base.py`)

```python
INSTALLED_APPS += [
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.github",
    "invites",
]

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

ACCOUNT_ADAPTER = "invites.adapters.SlotflowAccountAdapter"
SOCIALACCOUNT_ADAPTER = "invites.adapters.SlotflowSocialAccountAdapter"
ACCOUNT_EMAIL_VERIFICATION = "none"   # invite + OAuth email act as proof
SOCIALACCOUNT_AUTO_SIGNUP = False     # adapter controls signup eligibility

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": ["openid", "email", "profile"],
        "AUTH_PARAMS": {"prompt": "select_account"},
    },
    "github": {
        "SCOPE": ["user:email", "read:user"],   # read:user → two_factor_authentication
    },
}
```

#### URL mount (`config/urls.py`)

```python
path("accounts/", include("allauth.urls")),
```

allauth ships `/accounts/google/login/`, `/accounts/google/login/callback/`, `/accounts/github/login/`, `/accounts/github/login/callback/`. The existing `Require2FAMiddleware` already allowlists `/accounts/`, so this slots in safely. The `/2fa/` namespace is untouched.

OAuth client credentials live in Django admin (`SocialApplication` rows) per environment. A new `docs/operations/oauth-setup.md` runbook covers Google Cloud Console + GitHub Developer Settings configuration.

#### Custom adapter (`invites/adapters.py`)

```python
class SlotflowAccountAdapter(DefaultAccountAdapter):
    """Block self-serve signup unconditionally — invite-only platform."""

    def is_open_for_signup(self, request) -> bool:
        return False  # Password signup goes through invites.api, not allauth

class SlotflowSocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request, sociallogin) -> bool:
        # Only if a valid invite token is in the session
        token_hash = request.session.get("pending_invite_token_hash")
        if not token_hash:
            return False
        return Invite.objects.filter(
            token_hash=token_hash, status=Invite.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).exists()

    def pre_social_login(self, request, sociallogin):
        # Existing-user login (no pending invite) — allow if SocialAccount linked
        token_hash = request.session.get("pending_invite_token_hash")
        if not token_hash:
            if sociallogin.is_existing:
                return
            raise ImmediateHttpResponse(redirect("/login?error=no_account"))

        # Signup path — enforce email match
        invite = Invite.objects.get(token_hash=token_hash)
        raw_token = request.session.get("pending_invite_raw_token", "")
        if (sociallogin.user.email or "").lower() != invite.email.lower():
            write_audit_event(
                actor=None, action="invite.rejected_email_mismatch",
                entity=invite,
                metadata={
                    "provider": sociallogin.account.provider,
                    "oauth_email_hash": sha256_email(sociallogin.user.email),
                },
            )
            raise ImmediateHttpResponse(
                redirect(f"/accept-invite/{raw_token}/?error=email_mismatch")
            )

        # Q11=b: reject if a User already exists with this email.
        if User.objects.filter(email__iexact=invite.email).exists():
            raise ImmediateHttpResponse(
                redirect(f"/accept-invite/{raw_token}/?error=user_exists")
            )

    def save_user(self, request, sociallogin, form=None):
        invite = Invite.objects.select_for_update().get(
            token_hash=request.session["pending_invite_token_hash"],
        )
        if not invite.is_consumable:
            raise ImmediateHttpResponse(self._error_redirect(request, invite))

        with transaction.atomic():
            user = sociallogin.user
            user.username = sociallogin.user.email
            user.set_unusable_password()  # OAuth-only at signup
            user.accepted_terms_version_id = request.session["accepted_terms_version_id"]
            user.accepted_terms_at = timezone.now()
            user.save()
            sociallogin.connect(request, user)  # creates SocialAccount linked to our user

            workspace = Workspace.objects.create(
                slug=_unique_slug(user.email),
                name=request.session["workspace_name"],
            )
            Membership.objects.create(
                user=user, workspace=workspace, role=MembershipRole.OWNER,
            )
            invite.mark_accepted(user=user, workspace=workspace)

            mfa = _check_oauth_mfa(sociallogin)
            if mfa:
                request.session["oauth_mfa_satisfied"] = True
                mark_otp_session_fresh(request)
                write_audit_event(
                    actor=user, action="oauth.mfa_satisfied", entity=user,
                    metadata={
                        "provider": sociallogin.account.provider,
                        "claim_source": "amr" if sociallogin.account.provider == "google" else "github_api",
                    },
                )

            write_audit_event(actor=user, action="invite.accepted",
                              entity=invite,
                              metadata={"path": sociallogin.account.provider})
            write_audit_event(actor=user, action="user.created",
                              entity=user,
                              metadata={"path": sociallogin.account.provider,
                                        "workspace_id": workspace.id})
            write_audit_event(actor=user, action="terms.accepted",
                              entity=user,
                              metadata={"terms_version_id": user.accepted_terms_version_id,
                                        "version": user.accepted_terms_version.version})
        return user
```

#### MFA-claim detection (`invites/services/oauth_mfa.py`)

```python
def _check_oauth_mfa(sociallogin) -> bool:
    provider = sociallogin.account.provider
    if provider == "google":
        amr = sociallogin.account.extra_data.get("amr") or []
        return "mfa" in amr
    if provider == "github":
        token = sociallogin.token.token
        try:
            resp = requests.get(
                "https://api.github.com/user",
                headers={"Authorization": f"token {token}",
                         "Accept": "application/vnd.github+json"},
                timeout=5,
            )
        except requests.RequestException:
            return False
        if resp.status_code != 200:
            return False
        return bool(resp.json().get("two_factor_authentication"))
    return False
```

GitHub caveat: `two_factor_authentication` only appears with `read:user` scope (granted) and only reflects MFA state at sign-in time. Users can disable MFA later without us learning. Conservative: if API call fails for any reason, treat as `False` and force TOTP setup.

### 5. `Require2FAMiddleware` extension (`core/middleware/require_2fa.py`)

Insert a new gate above the existing TOTP-device check, in this priority order:

1. `is_2fa_bypass_active()` → skip (existing dev path).
2. `request.session.get("oauth_mfa_satisfied") is True` → skip redirect.
3. Existing logic: redirect to `/2fa/setup` if no confirmed TOTP device, else `/2fa/verify` if not fresh.

`/api/auth/me/` exposes a new `mfa_via_oauth: bool` field next to `is_verified`. `is_verified` becomes True if either `oauth_mfa_satisfied` is set on the session OR the user has a confirmed TOTP device.

The flag is **per-session**, not stored on `User` — re-evaluated on each OAuth login. Logout clears it.

### 6. Backend API endpoints

| Method | Path | Auth | Body | Purpose |
|---|---|---|---|---|
| `GET` | `/api/invites/<token>/` | Anonymous | — | Preflight |
| `POST` | `/api/invites/<token>/accept-password/` | Anonymous | `{password, workspace_name, terms_version_id}` | Password signup |
| `POST` | `/api/invites/<token>/oauth-start/` | Anonymous | `{provider, workspace_name, terms_version_id}` | Stash session + redirect to allauth |

#### Preflight responses

| State | HTTP | Body |
|---|---|---|
| Valid pending | 200 | `{email, expires_at, terms_version: {id, version, body_markdown}, providers: ["google", "github"]}` |
| Not found | 404 | `{error: "invalid_token"}` |
| Expired | 410 | `{error: "expired", expires_at}` |
| Revoked | 410 | `{error: "revoked"}` |
| Already accepted | 410 | `{error: "already_used"}` |

#### Accept-password flow

1. Lookup `Invite` by `hash_token(token)`. 410 if not consumable.
2. Validate `password` (Django built-in validators), `workspace_name` (regex `^[A-Za-z0-9 '\-]{2,80}$`), `terms_version_id == TermsVersion.current().id`.
3. Reject 409 if `User.objects.filter(email__iexact=invite.email).exists()`.
4. `transaction.atomic()`: create User (`username=email`, `set_password`), create Workspace + OWNER Membership, set `accepted_terms_*`, mark Invite ACCEPTED, write audit events (`invite.accepted` path=`"password"`, `user.created`, `terms.accepted`).
5. `login(request, user)` (Django session auth).
6. Return `{next: "/2fa/setup"}` — password path never satisfies OAuth-MFA, so always 2FA setup.

#### OAuth-start flow

1. Lookup Invite. 410 if not consumable.
2. Validate `provider in {"google", "github"}`, `workspace_name`, `terms_version_id`.
3. Stash on session: `pending_invite_token_hash`, `pending_invite_raw_token` (for error redirect URL reconstruction), `workspace_name`, `accepted_terms_version_id`.
4. Return `{redirect_url: "/accounts/<provider>/login/"}`.
5. Frontend sets `window.location.href = redirect_url`. allauth handles the rest; adapter consumes the session entries during callback.
6. After successful `save_user` (or any terminal redirect), adapter `pop`s `pending_invite_token_hash`, `pending_invite_raw_token`, `workspace_name`, `accepted_terms_version_id` from the session so a stale entry cannot bleed into a later OAuth attempt in the same browser.

### 7. Frontend

#### New screen: `frontend/src/screens/AcceptInvite.tsx`

Two-column layout mirroring `Login.tsx` (DESIGN.md compliant):

- **Left column**: lockup + heading "You're invited to Slotflow" + read-only email display + workspace-name input (default `"<email-local>'s workspace"`) + Google + GitHub buttons + "or" divider + password field + ToS area + submit.
- **Right column**: existing mint radial gradient panel.

Behaviour:

- `useQuery(["invite", token])` calls preflight on mount.
- On preflight error variants (404 / 410), render the matching error screen instead of the form. The "already_used" variant links to `/login`.
- ToS body rendered inline in a scrollable region (`max-h: 50vh`, `overflow-y: auto`). Checkbox `disabled` until `scrollTop + clientHeight >= scrollHeight - 4`. Once true, sticky. If `scrollHeight <= clientHeight` on render (short ToS), `hasReadToS` initialises `true` to avoid deadlock.
- Caption "Scroll to the bottom to enable" beneath the checkbox while disabled; `aria-live="polite"` so screen readers announce when it disappears. Checkbox `aria-describedby` points at the caption.
- Password submit → `useMutation` to `accept-password`. On success → `navigate(response.next)` (`/2fa/setup`). On 422 → field-level errors. On 410 → re-render error variant. On 409 → top-of-form alert "An account already exists for this email. Contact admin."
- OAuth click → mutation to `oauth-start`. On success → `window.location.href = response.redirect_url`.
- On mount, inspect `?error=` query string and render an inline alert above the form: `email_mismatch` → "OAuth email did not match the invite. Use the matching account."; `user_exists` → "An account already exists for this email. Contact admin."; `oauth_failed` → "Sign-in cancelled or failed. Try again." Preflight still runs (token may still be PENDING and consumable).

New `TestIds`:

```ts
ACCEPT_INVITE_EMAIL,
ACCEPT_INVITE_WORKSPACE,
ACCEPT_INVITE_PASSWORD,
ACCEPT_INVITE_TOS_SCROLL,
ACCEPT_INVITE_TOS_CHECKBOX,
ACCEPT_INVITE_TOS_CAPTION,
ACCEPT_INVITE_SUBMIT,
ACCEPT_INVITE_GOOGLE,
ACCEPT_INVITE_GITHUB,
```

Markdown rendering uses `marked` (small dep). If the team prefers no new dep, fall back to a tiny inline renderer covering paragraphs, lists, headings — sufficient for the placeholder ToS.

#### Updates to existing screens

- `frontend/src/screens/Login.tsx`: remove `disabled title="Not wired yet"` from Google + GitHub buttons. `onClick` sets `window.location.href = "/accounts/google/login/"` (resp. `github`). No invite token in session → adapter rejects unknown OAuth identities with redirect `/login?error=no_account`. Login screen renders an inline alert if `?error=no_account` is present.
- `frontend/src/screens/Landing.tsx:39`: change "Get started" → "Request invite" with `href="mailto:TODO@slotflow.app"` (placeholder; product picks final address). Remove the `?signup=1` breadcrumb.

### 8. Admin (`invites/admin.py`)

```python
@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ("email", "computed_status", "expires_at", "accepted_at",
                    "accepted_by", "created_by", "created_at")
    list_filter = ("status", ExpiredFilter)
    search_fields = ("email",)
    readonly_fields = ("token_hash", "accepted_at", "accepted_by",
                       "workspace", "created_by", "created_at")
    actions = ["revoke_selected", "resend_selected"]
    ordering = ("-created_at",)
```

- `add_view` override: on save, generate a fresh token, store hash, surface raw URL **once** via `messages.success(request, ...)`. Detail view never re-displays raw.
- `resend_selected`: regenerate `token_hash` + reset `expires_at = now() + 7d` for each PENDING row; emit one message per row with the new URL; write `invite.resent` audit per row. Refuses ACCEPTED / REVOKED rows with a warning message.
- `revoke_selected`: set `status=REVOKED` for PENDING rows; write `invite.revoked` audit per row.
- Native delete works; `delete_model` / `delete_queryset` overridden to write `invite.deleted` audit (snapshot `email` + `status` into metadata since the row is going away).
- `ExpiredFilter` (`SimpleListFilter`) provides Active / Expired buckets keyed off `expires_at` cmp `now()` and `status==PENDING`.
- `get_readonly_fields(request, obj)`: accepted invites are fully readonly; pending invites permit editing only `expires_at`. Email is immutable post-create.
- `has_add_permission`, `has_change_permission`, `has_delete_permission`, `has_view_permission` all gated to `request.user.is_superuser`. No leakage to non-super staff.

### 9. Audit events

| Action | Trigger | Actor | Entity | Metadata |
|---|---|---|---|---|
| `invite.issued` | `InviteAdmin` save | issuing admin | Invite | `{email, expires_at}` |
| `invite.resent` | `resend_selected` | issuing admin | Invite | `{old_expires_at, new_expires_at}` |
| `invite.revoked` | `revoke_selected` | admin | Invite | `{}` |
| `invite.deleted` | admin delete | admin | Invite snapshot | `{email, status}` |
| `invite.accepted` | accept success (any path) | new User | Invite | `{path: "password" \| "google" \| "github"}` |
| `invite.rejected_email_mismatch` | adapter rejects on email mismatch | None | Invite | `{provider, oauth_email_hash}` |
| `invite.rejected_user_exists` | accept attempted but `User` already exists for invite email | None | Invite | `{path: "password" \| "google" \| "github"}` |
| `invite.rejected_expired` | preflight or accept on stale | None | Invite | `{}` |
| `invite.rejected_revoked` | accept on REVOKED | None | Invite | `{}` |
| `user.created` | accept success | new User | User | `{path, workspace_id}` |
| `terms.accepted` | accept success | new User | User | `{terms_version_id, version}` |
| `oauth.mfa_satisfied` | OAuth callback w/ MFA claim present | User | User | `{provider, claim_source}` |

`oauth_email_hash` is `sha256(email)` — preserves forensic correlation without persisting the mismatched address verbatim. Correlation id on every event auto-derived from `core.middleware.correlation_id.get_correlation_id()`.

### 10. ToS bootstrap

- New file: `docs/legal/terms-v0.1.0.md`. Front-matter: `> NOT LEGAL ADVICE. Placeholder ToS for invite-gated alpha. Replace before public launch.` Body covers usage scope, account responsibilities, data handling, change notification, contact — boilerplate suitable for an invite-only alpha.
- Data migration `core/migrations/00XX_seed_terms_v1.py`: reads the file at runtime (uses `pathlib` against `BASE_DIR`), inserts `TermsVersion(version="0.1.0-draft", body=<file_contents>, effective_at=<migration time>)`.
- Migration is idempotent: `update_or_create(version="0.1.0-draft", ...)`.
- Future ToS updates: admin form for `TermsVersion` create or `loaddata`. Existing users prompted to re-accept on next login when `accepted_terms_version != current()` — out of scope for this spec but the FK supports it.

### 11. e2e harness interaction

- `seed_e2e_user` extended: also `update_or_create` the current `TermsVersion` (so each `/api/test/_reset/` cycle leaves a usable ToS row).
- `is_2fa_bypass_active()` continues to short-circuit `Require2FAMiddleware` ahead of the `oauth_mfa_satisfied` gate. Bypass takes priority.
- New e2e specs (Playwright):
  - `e2e/tests/invite-password.spec.ts` — reset, create invite via admin API helper, open invite URL in incognito context, scroll ToS to bottom (deterministic via `.scrollIntoView()` on a sentinel element keyed by `ACCEPT_INVITE_TOS_SCROLL`), submit password, expect `/2fa/setup`.
  - `e2e/tests/invite-expired.spec.ts` — pre-create expired invite, visit, expect "Expired" error variant.
  - `e2e/tests/invite-revoked.spec.ts` — same with revoked.
- OAuth e2e deferred — needs a Google + GitHub OIDC stub server. Tracked as a followup spec.

## Error handling and edge cases

- **Two tabs accepting same invite** — second submission hits 410 `already_used`.
- **Admin revokes mid-flow** — accept submit returns 410. Frontend re-renders error variant.
- **Admin resends mid-flow** — old `token_hash` no longer in DB → 404. User must use the new link.
- **GitHub `/user` API failure during MFA detection** — log warning, treat as no MFA, fall through to `/2fa/setup`. Never fail the signup on a third-party blip.
- **Email collision (Q11)** — accept returns 409 with explicit "Contact admin" copy. Audit captures the rejection.
- **Concurrent accept (race)** — `select_for_update()` on the Invite row inside the transaction serialises competing requests. Loser gets 410.

## Testing

### Backend (`backend/invites/tests/`)

- `models/invite_test.py`: `is_consumable`, `is_expired`, `mark_accepted`, status transitions.
- `models/terms_version_test.py`: `current()` resolution, ordering by `effective_at`.
- `services/token_test.py`: token entropy length, hash determinism, URL encoding round-trip.
- `services/oauth_mfa_test.py`: Google `amr` permutations, GitHub API variants (mocked with `responses`), API failure → False.
- `admin/invite_admin_test.py`: revoke / resend actions, one-time URL flash, permission gating to superuser, native delete writes audit event.
- `api/preflight_test.py`: 200 / 404 / 410 matrix per state.
- `api/accept_password_test.py`: success path, 410 expired/revoked/accepted, 409 user-exists, 422 field validators, ToS version mismatch.
- `api/oauth_start_test.py`: session keys stashed correctly, redirect URL well-formed.
- `views/accept_callback_test.py`: adapter `pre_social_login` email-match enforcement, `save_user` creates Workspace+Membership+audit, MFA-claim path skips 2FA.
- `services/audit_test.py`: each action emits the expected `AuditEvent` row with the expected metadata.

### Frontend (`frontend/src/screens/AcceptInvite.test.tsx`)

- Renders preflight 200 → form populated with email and default workspace name.
- 404 / 410 / expired / revoked / already-used → correct error variant rendered.
- ToS scroll gate: checkbox disabled until simulated scroll-to-bottom; short-ToS auto-enables; caption announces enabled state.
- Submit password → mutation called with payload, success navigates `/2fa/setup`.
- OAuth click → mutation → `window.location.href` set to the returned redirect_url (mocked `location`).

### E2E

See section 11.

## Rollout

No feature flag — invite-only signup IS the launch state. Each step ships as its own PR, additively, in this order:

1. Backend models + migrations + services (no allauth yet) — additive, breaks nothing.
2. allauth install + adapters + URL mount — login still works because login path through adapter is the existing-user branch.
3. Admin pages — invites can be issued but not yet consumable through frontend.
4. Backend API endpoints (`preflight`, `accept-password`, `oauth-start`) + ToS migration.
5. Frontend `AcceptInvite.tsx` + `TestIds` + ToS markdown rendering.
6. Wire `Login.tsx` Google + GitHub buttons (existing-user-login mode); update `Landing.tsx` "Get started" copy.
7. e2e specs.

Bootstrap: existing `ensure_superuser` mgmt command remains the entry point. Superuser logs into `/admin/` and issues the first real invite.

## Open items

- ToS placeholder body (`docs/legal/terms-v0.1.0.md`) needs legal review before any public alpha.
- "Request invite" mailto target on `Landing.tsx` — product picks the final address.
- Per-environment OAuth client credentials — operator runbook in `docs/operations/oauth-setup.md`.
- E2E coverage of OAuth callback paths — needs provider stub server; followup spec.
- Markdown renderer choice (`marked` vs inline minimal) — small call deferred to plan.

## Followups (parked from this brainstorm)

Build order continues from this spec:

1. **Plans + paywall enforcement** — `Plan` model on User (or Workspace), `Free` (5-opportunity cap), `Premium`. Enforcement at opportunity create. Local-only, no Polar yet.
2. **Polar.sh subscriptions** — checkout, webhook handler, customer-to-user mapping. Flips `Plan` on success.
3. **Coupons** — admin creates redeemable codes; 3 months Premium free. Polar discount integration vs. local credit.
4. **API consumption metering** — Polar usage-based billing; identify which API endpoints meter; emit usage events.
5. **Referrals** — paying user generates referral link; conversion grants both sides +1 month credit; self-referral and abuse guards.

Each gets a separate brainstorm → spec → plan cycle.
