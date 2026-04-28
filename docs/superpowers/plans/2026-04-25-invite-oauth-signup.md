# Invite + OAuth Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire admin-issued, single-use, 7-day-expiry invite links that let invitees sign up via Google OAuth, GitHub OAuth, or email/password, accept a versioned ToS (with scroll-to-bottom gate), and land in a freshly-created `Workspace`. Provider-asserted MFA skips TOTP setup; password and unverified-OAuth paths still go through the existing `/2fa/setup` flow.

**Architecture:** New `invites/` Django app holds the `Invite` model, allauth adapters, and three DRF endpoints (`preflight`, `accept-password`, `oauth-start`). `core/` gains a `TermsVersion` model and a placeholder ToS markdown file seeded by data migration. `identity.User` gains two ToS fields. `django-allauth` ships the OAuth flows; a custom `SocialAccountAdapter` enforces the invite token + email match, creates the User+Workspace+Membership inside one transaction, and sets `request.session["oauth_mfa_satisfied"]` when the provider asserts MFA. `Require2FAMiddleware` honours that session flag. The frontend gets a new `/accept-invite/:token` route, and `Login.tsx` wires its previously-disabled OAuth buttons to allauth (existing-user-login mode).

**Tech Stack:**
- Backend: Django 6, DRF, `django-allauth ~= 65.0`, `django_otp` (existing), `audit.write_audit_event` (existing).
- Frontend: React 19, React Router 7, TanStack Query 5, TypeScript, Tailwind, `marked` (~12.0) for ToS markdown.
- Tests: pytest + pytest-django (backend, `responses` for HTTP mocks), Vitest + RTL (frontend), Playwright (e2e).

---

## Preconditions

- Worktree exists at `.worktrees/invite-oauth-signup` on branch `spec/invite-oauth-signup`, based on `main`. Spec is committed at `docs/superpowers/specs/2026-04-25-invite-oauth-signup-design.md`.
- Branch off the spec branch into a feature branch before implementation: `git checkout -b feat/invite-oauth-signup` from inside the worktree. Plan and spec land on this branch.
- `make install` passes from the worktree root (Python 3.14 available, Node 24, `backend/.venv` exists).

```bash
cd .worktrees/invite-oauth-signup
git checkout -b feat/invite-oauth-signup
make install
```

## File structure (what this plan creates or modifies)

**Create (backend):**
- `backend/invites/__init__.py`
- `backend/invites/apps.py` — `InvitesConfig`
- `backend/invites/models.py` — `Invite` model
- `backend/invites/admin.py` — `InviteAdmin` with revoke / resend actions, one-time URL flash
- `backend/invites/adapters.py` — `SlotflowAccountAdapter`, `SlotflowSocialAccountAdapter`
- `backend/invites/api.py` — DRF function-views: `preflight_view`, `accept_password_view`, `oauth_start_view`
- `backend/invites/services/__init__.py`
- `backend/invites/services/tokens.py` — `issue_token`, `hash_token`, `sha256_email`
- `backend/invites/services/oauth_mfa.py` — `check_oauth_mfa`
- `backend/invites/services/workspace_slug.py` — `unique_slug_from_email`
- `backend/invites/urls.py` — `/preflight/`, `/accept-password/`, `/oauth-start/` patterns
- `backend/invites/migrations/__init__.py`
- `backend/invites/migrations/0001_initial.py` — generated
- `backend/invites/tests/__init__.py`
- `backend/invites/tests/models/__init__.py`
- `backend/invites/tests/models/invite_test.py`
- `backend/invites/tests/services/__init__.py`
- `backend/invites/tests/services/tokens_test.py`
- `backend/invites/tests/services/oauth_mfa_test.py`
- `backend/invites/tests/services/workspace_slug_test.py`
- `backend/invites/tests/admin/__init__.py`
- `backend/invites/tests/admin/invite_admin_test.py`
- `backend/invites/tests/api/__init__.py`
- `backend/invites/tests/api/preflight_test.py`
- `backend/invites/tests/api/accept_password_test.py`
- `backend/invites/tests/api/oauth_start_test.py`
- `backend/invites/tests/views/__init__.py`
- `backend/invites/tests/views/social_adapter_test.py`
- `docs/legal/terms-v0.1.0.md`
- `docs/operations/oauth-setup.md`

**Modify (backend):**
- `backend/config/settings/base.py` — add allauth + invites apps, AUTHENTICATION_BACKENDS, adapter constants, SOCIALACCOUNT_PROVIDERS, ACCOUNT_EMAIL_VERIFICATION
- `backend/config/urls.py` — `path("accounts/", include("allauth.urls"))` and `path("api/invites/", include("invites.urls"))`
- `backend/core/models.py` — `TermsVersion` model
- `backend/core/migrations/00XX_terms_version.py` — schema migration
- `backend/core/migrations/00YY_seed_terms_v1.py` — data migration reading `docs/legal/terms-v0.1.0.md`
- `backend/core/middleware/require_2fa.py` — honour `request.session["oauth_mfa_satisfied"]`
- `backend/core/api_auth.py` — `_me_payload` accepts `request`, exposes `mfa_via_oauth`, extends `is_verified`
- `backend/identity/models.py` — `accepted_terms_version` FK + `accepted_terms_at`
- `backend/identity/migrations/00XX_user_terms_fields.py` — schema migration
- `backend/core/management/commands/seed_e2e_user.py` — also seed current `TermsVersion`
- `backend/core/tests/models/terms_version_test.py` — new
- `backend/core/tests/api/auth_me_test.py` — extend if exists, else create at this path
- `backend/identity/tests/models/user_terms_test.py` — new
- `backend/pyproject.toml` — add `django-allauth>=65,<66` and `responses>=0.25` (test-only) to deps
- `Makefile` (root) — no change required; existing `make install` runs `pip install -e backend[dev]`

**Create (frontend):**
- `frontend/src/screens/AcceptInvite.tsx`
- `frontend/src/screens/AcceptInvite.test.tsx`
- `frontend/src/lib/inviteHooks.ts` — TanStack Query hooks for the three endpoints
- `frontend/src/lib/inviteHooks.test.ts`
- `frontend/src/lib/markdown.ts` — thin `marked` wrapper with sanitisation defaults
- `frontend/src/lib/markdown.test.ts`

**Modify (frontend):**
- `frontend/src/router.tsx` — register `/accept-invite/:token`
- `frontend/src/screens/Login.tsx` — enable Google + GitHub buttons, render `?error=no_account` banner
- `frontend/src/screens/Login.test.tsx` — assert buttons enabled, assert error banner
- `frontend/src/screens/Landing.tsx` — "Get started" → "Request invite" `mailto:`
- `frontend/src/screens/Landing.test.tsx` — assert new copy + href
- `frontend/src/testIds.ts` — `ACCEPT_INVITE_*` ids
- `frontend/package.json` — add `marked@^12` and `@types/marked` if needed

**Create (e2e):**
- `e2e/tests/invite-password.spec.ts`
- `e2e/tests/invite-expired.spec.ts`
- `e2e/tests/invite-revoked.spec.ts`
- `e2e/support/invites.ts` — backend test-fixture helpers (issue invite, revoke, expire) hitting a new `/api/test/_seed_invite/` endpoint behind the existing bypass guard

**Modify (e2e):**
- `e2e/support/selectors.ts` — mirror new `ACCEPT_INVITE_*` ids
- `backend/core/api_test_reset.py` — add `_seed_invite_view` (DEBUG + bypass-gated, like `_reset`)
- `backend/core/tests/api/seed_invite_test.py` — coverage for the new test endpoint

## Out of scope (explicit deferrals)

- Plans / paywall enforcement, Polar.sh subscriptions, coupons, usage metering, referrals — separate spec cycles.
- Multi-workspace membership, workspace switcher updates beyond what already exists.
- Real legal-reviewed Terms of Service body.
- Email delivery (SMTP / SES / SendGrid).
- Productionised "Request invite" landing — `mailto:` placeholder only.
- E2E coverage of the OAuth callback paths — needs a Google + GitHub OIDC stub server; tracked as a follow-up.
- Password reset flow.

---

## Phase 1 — Foundation: app skeleton + models

### Task 1.1: Create `invites/` Django app skeleton

**Files:**
- Create: `backend/invites/__init__.py` (empty)
- Create: `backend/invites/apps.py`
- Create: `backend/invites/migrations/__init__.py` (empty)
- Create: `backend/invites/tests/__init__.py` (empty)
- Modify: `backend/config/settings/base.py:27-47`

- [ ] **Step 1: Create empty package files**

```bash
mkdir -p backend/invites/migrations backend/invites/tests/{models,services,admin,api,views}
: > backend/invites/__init__.py
: > backend/invites/migrations/__init__.py
: > backend/invites/tests/__init__.py
for d in models services admin api views; do
  : > "backend/invites/tests/$d/__init__.py"
done
```

- [ ] **Step 2: Write `backend/invites/apps.py`**

```python
from __future__ import annotations

from django.apps import AppConfig


class InvitesConfig(AppConfig):
    name = "invites"
    default_auto_field = "django.db.models.BigAutoField"
```

- [ ] **Step 3: Register in `INSTALLED_APPS`**

In `backend/config/settings/base.py`, append `"invites",` to the existing `INSTALLED_APPS` list (between `"audit",` and the closing `]`).

```python
INSTALLED_APPS = [
    "django.contrib.admin",
    # ... existing entries ...
    "audit",
    "invites",
]
```

- [ ] **Step 4: Confirm Django can import the app**

Run: `backend/.venv/bin/python -m django check --settings=config.settings.local`
Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Commit**

```bash
git add backend/invites/__init__.py backend/invites/apps.py backend/invites/migrations/__init__.py backend/invites/tests/ backend/config/settings/base.py
git commit -m "feat(invites): bootstrap Django app skeleton"
```

---

### Task 1.2: `TermsVersion` model in `core/`

**Files:**
- Modify: `backend/core/models.py`
- Create: `backend/core/migrations/00XX_terms_version.py` (auto-generated)
- Create: `backend/core/tests/models/terms_version_test.py`

- [ ] **Step 1: Write the failing test**

Create `backend/core/tests/models/terms_version_test.py`:

```python
from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from core.models import TermsVersion


@pytest.mark.django_db
def test_current_returns_latest_active_version():
    now = timezone.now()
    TermsVersion.objects.create(
        version="0.0.1", body="old", effective_at=now - timedelta(days=10)
    )
    latest = TermsVersion.objects.create(
        version="0.1.0", body="new", effective_at=now - timedelta(days=1)
    )
    TermsVersion.objects.create(
        version="0.2.0-future", body="future", effective_at=now + timedelta(days=1)
    )

    assert TermsVersion.current() == latest


@pytest.mark.django_db
def test_current_returns_none_when_nothing_effective():
    TermsVersion.objects.create(
        version="0.2.0-future",
        body="future",
        effective_at=timezone.now() + timedelta(hours=1),
    )

    assert TermsVersion.current() is None


@pytest.mark.django_db
def test_version_is_unique():
    now = timezone.now()
    TermsVersion.objects.create(version="1.0.0", body="a", effective_at=now)
    with pytest.raises(Exception):
        TermsVersion.objects.create(version="1.0.0", body="b", effective_at=now)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `make -C backend test ARGS="core/tests/models/terms_version_test.py -v"` (or `backend/.venv/bin/python -m pytest backend/core/tests/models/terms_version_test.py -v`)
Expected: FAIL — `ImportError: cannot import name 'TermsVersion' from 'core.models'`.

- [ ] **Step 3: Add the model to `backend/core/models.py`**

Append below `SoftDeleteModel`:

```python
from django.utils import timezone


class TermsVersion(TimeStampedModel):
    version = models.CharField(max_length=32, unique=True)
    body = models.TextField()
    effective_at = models.DateTimeField()

    class Meta:
        ordering = ("-effective_at",)

    def __str__(self) -> str:
        return self.version

    @classmethod
    def current(cls) -> "TermsVersion | None":
        return (
            cls.objects.filter(effective_at__lte=timezone.now())
            .order_by("-effective_at")
            .first()
        )
```

(Move the `from django.utils import timezone` import to the top of the file alongside the existing imports.)

- [ ] **Step 4: Generate + apply migration**

```bash
backend/.venv/bin/python -m django makemigrations core --settings=config.settings.local --name terms_version
backend/.venv/bin/python -m django migrate --settings=config.settings.local
```

Expected: a new file `backend/core/migrations/00XX_terms_version.py` is created. `migrate` reports `Applying core.00XX_terms_version... OK`.

- [ ] **Step 5: Run the test, expect pass, then commit**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/models/terms_version_test.py -v`
Expected: 3 passed.

```bash
git add backend/core/models.py backend/core/migrations/ backend/core/tests/models/__init__.py backend/core/tests/models/terms_version_test.py
git commit -m "feat(core): add TermsVersion model"
```

(`backend/core/tests/models/__init__.py` may already exist; `git add` is a no-op if so.)

---

### Task 1.3: `User` ToS field additions

**Files:**
- Modify: `backend/identity/models.py`
- Create: `backend/identity/migrations/00XX_user_terms_fields.py` (auto-generated)
- Create: `backend/identity/tests/models/user_terms_test.py`
- Create: `backend/identity/tests/models/__init__.py` (if missing)

- [ ] **Step 1: Write the failing test**

Create `backend/identity/tests/models/user_terms_test.py`:

```python
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from core.models import TermsVersion


@pytest.mark.django_db
def test_user_records_accepted_terms():
    User = get_user_model()
    now = timezone.now()
    terms = TermsVersion.objects.create(
        version="0.1.0", body="t", effective_at=now - timedelta(days=1)
    )
    user = User.objects.create_user(username="alice@x.com", email="alice@x.com")

    user.accepted_terms_version = terms
    user.accepted_terms_at = now
    user.save()
    user.refresh_from_db()

    assert user.accepted_terms_version_id == terms.id
    assert user.accepted_terms_at == now


@pytest.mark.django_db
def test_terms_version_with_acceptances_cannot_be_deleted():
    User = get_user_model()
    terms = TermsVersion.objects.create(
        version="0.1.0", body="t", effective_at=timezone.now()
    )
    user = User.objects.create_user(
        username="b@x.com", email="b@x.com",
        accepted_terms_version=terms, accepted_terms_at=timezone.now(),
    )

    with pytest.raises(Exception):
        terms.delete()  # PROTECT
    assert User.objects.filter(pk=user.pk).exists()
```

Also create `backend/identity/tests/models/__init__.py` if it does not yet exist (`: > backend/identity/tests/models/__init__.py`).

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/identity/tests/models/user_terms_test.py -v`
Expected: FAIL — `AttributeError: 'User' object has no attribute 'accepted_terms_version'` or similar.

- [ ] **Step 3: Add the fields to `backend/identity/models.py`**

```python
from __future__ import annotations

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Application user model (extension point for profile fields in later tracks)."""

    accepted_terms_version = models.ForeignKey(
        "core.TermsVersion",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="acceptances",
    )
    accepted_terms_at = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 4: Generate + apply migration**

```bash
backend/.venv/bin/python -m django makemigrations identity --settings=config.settings.local --name user_terms_fields
backend/.venv/bin/python -m django migrate --settings=config.settings.local
```

Expected: migration created and applied.

- [ ] **Step 5: Run tests, then commit**

Run: `backend/.venv/bin/python -m pytest backend/identity/tests/models/user_terms_test.py -v`
Expected: 2 passed.

```bash
git add backend/identity/models.py backend/identity/migrations/ backend/identity/tests/models/
git commit -m "feat(identity): add accepted_terms_version + accepted_terms_at on User"
```

---

### Task 1.4: `Invite` model

**Files:**
- Create: `backend/invites/models.py`
- Create: `backend/invites/migrations/0001_initial.py` (auto-generated)
- Create: `backend/invites/tests/models/invite_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/models/invite_test.py
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from invites.models import Invite


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin", email="admin@x.com", is_superuser=True, is_staff=True,
    )


@pytest.mark.django_db
def test_default_status_is_pending(admin):
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=7),
        created_by=admin,
    )
    assert inv.status == Invite.Status.PENDING


@pytest.mark.django_db
def test_is_consumable_when_pending_and_unexpired(admin):
    inv = Invite.objects.create(
        email="alice@x.com", token_hash="b" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=admin,
    )
    assert inv.is_consumable is True
    assert inv.is_expired is False


@pytest.mark.django_db
def test_is_not_consumable_when_expired(admin):
    inv = Invite.objects.create(
        email="alice@x.com", token_hash="c" * 64,
        expires_at=timezone.now() - timedelta(seconds=1), created_by=admin,
    )
    assert inv.is_expired is True
    assert inv.is_consumable is False


@pytest.mark.django_db
def test_is_not_consumable_when_revoked(admin):
    inv = Invite.objects.create(
        email="alice@x.com", token_hash="d" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=admin,
        status=Invite.Status.REVOKED,
    )
    assert inv.is_consumable is False


@pytest.mark.django_db
def test_token_hash_unique(admin):
    Invite.objects.create(
        email="a@x.com", token_hash="e" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=admin,
    )
    with pytest.raises(Exception):
        Invite.objects.create(
            email="b@x.com", token_hash="e" * 64,
            expires_at=timezone.now() + timedelta(days=1), created_by=admin,
        )


@pytest.mark.django_db
def test_mark_accepted_sets_fields(admin):
    from tenancy.models import Workspace

    inv = Invite.objects.create(
        email="alice@x.com", token_hash="f" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=admin,
    )
    user = get_user_model().objects.create_user(username="alice@x.com", email="alice@x.com")
    ws = Workspace.objects.create(name="Alice", slug="alice")

    inv.mark_accepted(user=user, workspace=ws)
    inv.refresh_from_db()

    assert inv.status == Invite.Status.ACCEPTED
    assert inv.accepted_by_id == user.pk
    assert inv.workspace_id == ws.id
    assert inv.accepted_at is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/models/invite_test.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'invites.models'` (the file doesn't exist yet).

- [ ] **Step 3: Write `backend/invites/models.py`**

```python
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class Invite(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        REVOKED = "revoked", "Revoked"

    email = models.EmailField(db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.PENDING,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="invites_issued",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="invite_accepted",
    )
    workspace = models.ForeignKey(
        "tenancy.Workspace",
        on_delete=models.SET_NULL, null=True, blank=True,
    )

    class Meta:
        indexes = [models.Index(fields=("status", "-created_at"))]
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"Invite<{self.email} {self.status}>"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    @property
    def is_consumable(self) -> bool:
        return self.status == self.Status.PENDING and not self.is_expired

    def mark_accepted(self, *, user, workspace) -> None:
        self.status = self.Status.ACCEPTED
        self.accepted_by = user
        self.workspace = workspace
        self.accepted_at = timezone.now()
        self.save(update_fields=("status", "accepted_by", "workspace", "accepted_at", "updated_at"))
```

- [ ] **Step 4: Generate + apply migration**

```bash
backend/.venv/bin/python -m django makemigrations invites --settings=config.settings.local --name initial
backend/.venv/bin/python -m django migrate --settings=config.settings.local
```

Expected: `backend/invites/migrations/0001_initial.py` created, applied OK.

- [ ] **Step 5: Run tests, commit**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/models/invite_test.py -v`
Expected: 6 passed.

```bash
git add backend/invites/models.py backend/invites/migrations/ backend/invites/tests/models/
git commit -m "feat(invites): add Invite model with status + consumable properties"
```

---

### Task 1.5: Token services (`issue_token`, `hash_token`, `sha256_email`)

**Files:**
- Create: `backend/invites/services/__init__.py` (empty)
- Create: `backend/invites/services/tokens.py`
- Create: `backend/invites/tests/services/tokens_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/services/tokens_test.py
from __future__ import annotations

import re

import pytest

from invites.services.tokens import hash_token, issue_token, sha256_email


def test_issue_token_returns_url_safe_string_and_hash():
    raw, hashed = issue_token()
    assert re.fullmatch(r"[A-Za-z0-9_\-]+", raw)
    assert len(raw) >= 40  # 32 bytes urlsafe → 43 chars
    assert len(hashed) == 64
    assert all(c in "0123456789abcdef" for c in hashed)


def test_issue_token_is_random_per_call():
    a, _ = issue_token()
    b, _ = issue_token()
    assert a != b


def test_hash_token_is_deterministic():
    assert hash_token("abc") == hash_token("abc")


def test_hash_token_changes_with_input():
    assert hash_token("abc") != hash_token("abd")


def test_issue_token_hash_matches_hash_token():
    raw, hashed = issue_token()
    assert hash_token(raw) == hashed


def test_sha256_email_is_lowercased_before_hashing():
    assert sha256_email("Alice@X.com") == sha256_email("alice@x.com")


def test_sha256_email_hex_length():
    assert len(sha256_email("alice@x.com")) == 64
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/services/tokens_test.py -v`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Write `backend/invites/services/tokens.py`**

```python
from __future__ import annotations

import hashlib
import secrets


def issue_token() -> tuple[str, str]:
    """Return (raw_token, sha256_hex_hash). Raw must only ever be shown once."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def sha256_email(email: str) -> str:
    """Forensic-correlation hash. Lowercase first so case differences collapse."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
```

Also write the empty package marker: `: > backend/invites/services/__init__.py`.

- [ ] **Step 4: Run test, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/services/tokens_test.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/services/ backend/invites/tests/services/__init__.py backend/invites/tests/services/tokens_test.py
git commit -m "feat(invites): add token issue/hash + email hash services"
```

---

### Task 1.6: Workspace-slug uniqueness helper

**Files:**
- Create: `backend/invites/services/workspace_slug.py`
- Create: `backend/invites/tests/services/workspace_slug_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/services/workspace_slug_test.py
from __future__ import annotations

import pytest

from invites.services.workspace_slug import unique_slug_from_email
from tenancy.models import Workspace


@pytest.mark.django_db
def test_unique_slug_from_email_uses_local_part():
    assert unique_slug_from_email("alice@x.com") == "alice"


@pytest.mark.django_db
def test_unique_slug_strips_unsafe_chars():
    assert unique_slug_from_email("Alice.Smith+tag@x.com") == "alice-smith-tag"


@pytest.mark.django_db
def test_unique_slug_appends_suffix_on_collision():
    Workspace.objects.create(name="x", slug="alice")
    Workspace.objects.create(name="x", slug="alice-2")

    assert unique_slug_from_email("alice@y.com") == "alice-3"


@pytest.mark.django_db
def test_unique_slug_falls_back_to_user_when_local_part_empty():
    # Pathological input — keep helper safe.
    assert unique_slug_from_email("@x.com").startswith("user")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/services/workspace_slug_test.py -v`
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Write `backend/invites/services/workspace_slug.py`**

```python
from __future__ import annotations

import re

from django.utils.text import slugify

from tenancy.models import Workspace


_LOCAL_PART_RE = re.compile(r"[^a-z0-9-]+")


def _base(email: str) -> str:
    local = (email or "").split("@", 1)[0].lower()
    cleaned = slugify(local) or _LOCAL_PART_RE.sub("-", local).strip("-")
    return cleaned or "user"


def unique_slug_from_email(email: str) -> str:
    """Return a Workspace slug derived from `email`'s local part, unique in DB."""
    base = _base(email)
    candidate = base
    n = 2
    while Workspace.objects.filter(slug=candidate).exists():
        candidate = f"{base}-{n}"
        n += 1
    return candidate
```

- [ ] **Step 4: Run test, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/services/workspace_slug_test.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/services/workspace_slug.py backend/invites/tests/services/workspace_slug_test.py
git commit -m "feat(invites): add unique_slug_from_email workspace helper"
```

---

### Task 1.7: ToS placeholder file + data migration

**Files:**
- Create: `docs/legal/terms-v0.1.0.md`
- Create: `backend/core/migrations/00YY_seed_terms_v1.py` (manual migration)

- [ ] **Step 1: Write the placeholder ToS file**

```markdown
<!-- docs/legal/terms-v0.1.0.md -->
> **NOT LEGAL ADVICE.** Placeholder ToS for invite-gated alpha. Replace with a lawyer-reviewed document before any public launch.

# Slotflow Terms of Service (alpha)

Version: 0.1.0-draft
Effective: 2026-04-25

## 1. Scope

Slotflow is currently distributed by invitation only. By accepting an invite and creating an account, you agree to use the service for personal job-search workflow management.

## 2. Account responsibilities

You are responsible for keeping your sign-in credentials and any linked OAuth identities secure. You will enable two-factor authentication unless your federated identity provider explicitly asserts MFA at sign-in.

## 3. Data we store

We persist the data you input — opportunities, resumes, interview cycles, insights, audit events tied to your account. We do not sell or share this data with third parties.

## 4. Acceptable use

Do not use Slotflow to harass others, attempt unauthorized access to other workspaces, or exfiltrate platform data via automated means beyond the documented MCP API quotas.

## 5. Termination

We may revoke an invite or suspend an account that violates these terms. You may delete your account at any time from the settings panel; we will purge associated data within 30 days, retaining only audit-event records as required for security forensics.

## 6. Changes

We may update these terms; you will be prompted to re-accept the latest version on next sign-in. Continued use after that prompt constitutes acceptance.

## 7. Contact

`hello@slotflow.app` (placeholder address; final contact details published before public launch).
```

- [ ] **Step 2: Write the data migration**

The migration number depends on what `makemigrations` produced for `TermsVersion` in Task 1.2. Use `ls backend/core/migrations/` to find the highest number; the seed migration goes one above.

```bash
ls backend/core/migrations/
```

Create `backend/core/migrations/00YY_seed_terms_v1.py` (substitute `YY` with the next available number, and `00XX` with the schema migration name from Task 1.2):

```python
from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.db import migrations
from django.utils import timezone


VERSION = "0.1.0-draft"
EFFECTIVE_AT_ISO = "2026-04-25T00:00:00Z"


def _terms_path() -> Path:
    # settings.BASE_DIR == backend/. Walk up one to repo root.
    return Path(settings.BASE_DIR).parent / "docs" / "legal" / "terms-v0.1.0.md"


def seed_terms_v1(apps, schema_editor):
    TermsVersion = apps.get_model("core", "TermsVersion")
    body = _terms_path().read_text(encoding="utf-8")
    TermsVersion.objects.update_or_create(
        version=VERSION,
        defaults={
            "body": body,
            "effective_at": timezone.datetime.fromisoformat(
                EFFECTIVE_AT_ISO.replace("Z", "+00:00"),
            ),
        },
    )


def unseed(apps, schema_editor):
    TermsVersion = apps.get_model("core", "TermsVersion")
    TermsVersion.objects.filter(version=VERSION).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "00XX_terms_version"),  # replace 00XX with the actual schema migration
    ]
    operations = [migrations.RunPython(seed_terms_v1, unseed)]
```

- [ ] **Step 3: Apply the migration**

```bash
backend/.venv/bin/python -m django migrate --settings=config.settings.local
```

Expected: `Applying core.00YY_seed_terms_v1... OK`.

- [ ] **Step 4: Smoke-test via Django shell**

```bash
backend/.venv/bin/python -m django shell --settings=config.settings.local <<'PY'
from core.models import TermsVersion
v = TermsVersion.current()
print(v.version, len(v.body))
PY
```

Expected: prints `0.1.0-draft <some_int>`.

- [ ] **Step 5: Commit**

```bash
git add docs/legal/terms-v0.1.0.md backend/core/migrations/00YY_seed_terms_v1.py
git commit -m "feat(core): seed initial TermsVersion 0.1.0-draft"
```

---

## Phase 2 — allauth integration

### Task 2.1: Install `django-allauth`

**Files:**
- Modify: `backend/pyproject.toml` (add to `[project] dependencies` and `[project.optional-dependencies] dev`)

- [ ] **Step 1: Add the dependency**

Open `backend/pyproject.toml`. Find the existing dependency list (look under `[project] dependencies = [...]`). Add:

```toml
"django-allauth>=65,<66",
```

Add to dev/test extras as well:

```toml
"responses>=0.25,<1",
```

If the file doesn't already use the `[project.optional-dependencies]` section for tests, add the dep wherever existing test deps live (`pytest-django`, etc.). Use `grep -n responses backend/pyproject.toml` to verify it's not already present.

- [ ] **Step 2: Reinstall**

```bash
make -C backend install-dev
```

Expected: `Successfully installed django-allauth-65.x.x ... responses-0.x.x ...`.

- [ ] **Step 3: Verify import works**

```bash
backend/.venv/bin/python -c "import allauth, allauth.socialaccount.providers.google, allauth.socialaccount.providers.github; print('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock 2>/dev/null || git add backend/pyproject.toml
git commit -m "build(backend): add django-allauth and responses (test) deps"
```

(Run `git status` after — if `uv.lock` or `requirements*.txt` changed, include those in the commit.)

---

### Task 2.2: Wire allauth into settings + URLs

**Files:**
- Modify: `backend/config/settings/base.py`
- Modify: `backend/config/urls.py`

- [ ] **Step 1: Add allauth apps + middleware to settings**

In `backend/config/settings/base.py`, extend `INSTALLED_APPS` (insert after `"audit"`, before `"invites"` from Task 1.1):

```python
INSTALLED_APPS = [
    # ... existing entries up to "audit" ...
    "audit",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.github",
    "invites",
]
```

Add `AccountMiddleware` to `MIDDLEWARE` directly after `AuthenticationMiddleware`:

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "core.middleware.correlation_id.CorrelationIdMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "django_otp.middleware.OTPMiddleware",
    "core.middleware.require_2fa.Require2FAMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
```

Add the auth backend (append, do not replace):

```python
AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
```

Add the allauth config block at the bottom of `base.py`:

```python
# --- allauth ---------------------------------------------------------------
ACCOUNT_ADAPTER = "invites.adapters.SlotflowAccountAdapter"
SOCIALACCOUNT_ADAPTER = "invites.adapters.SlotflowSocialAccountAdapter"
ACCOUNT_EMAIL_VERIFICATION = "none"  # invite + OAuth email act as proof
SOCIALACCOUNT_AUTO_SIGNUP = False
SOCIALACCOUNT_LOGIN_ON_GET = True  # /accounts/<provider>/login/ goes straight to provider
ACCOUNT_LOGIN_METHODS = {"username"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "username*", "password1*"]

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": ["openid", "email", "profile"],
        "AUTH_PARAMS": {"prompt": "select_account"},
    },
    "github": {
        "SCOPE": ["user:email", "read:user"],
    },
}
```

- [ ] **Step 2: Mount allauth URLs**

In `backend/config/urls.py`, add a single line inside `urlpatterns`, just after the existing `path("accounts/login/", ...)` and `path("accounts/logout/", ...)` rows:

```python
    path("accounts/", include("allauth.urls")),
```

allauth's `accounts/login/` clashes with the existing `auth_views.LoginView` mounted at `/accounts/login/`. Resolve the clash by **removing** the two existing lines:

```python
    path("accounts/login/", auth_views.LoginView.as_view(), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
```

allauth's `accounts/login/` and `accounts/logout/` take their place. The existing 2FA flow uses session auth via `core.api_auth`, not these template-based views, so removing them is safe. Drop the unused `from django.contrib.auth import views as auth_views` import.

- [ ] **Step 3: Run Django checks**

```bash
backend/.venv/bin/python -m django check --settings=config.settings.local
```

Expected: `System check identified no issues (0 silenced).`

If you see `(account.W001) settings.ACCOUNT_LOGIN_METHODS conflicts ...`, double-check that you removed `ACCOUNT_AUTHENTICATION_METHOD` if any older allauth setting was inherited — none should exist in this repo, but worth confirming with `grep ACCOUNT_AUTH backend/config/settings/`.

- [ ] **Step 4: Run existing test suite to confirm no regression**

```bash
make -C backend test
```

Expected: same pass count as before this task (allauth migrations applied automatically by pytest-django on first run).

- [ ] **Step 5: Commit**

```bash
git add backend/config/settings/base.py backend/config/urls.py
git commit -m "feat(backend): wire django-allauth (Google + GitHub) into settings + URLs"
```

---

### Task 2.3: Adapter scaffolding (SlotflowAccountAdapter, SlotflowSocialAccountAdapter)

**Files:**
- Create: `backend/invites/adapters.py`
- Create: `backend/invites/tests/views/social_adapter_test.py` (initial skeleton — extended in later tasks)

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/views/social_adapter_test.py
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from invites.adapters import SlotflowAccountAdapter, SlotflowSocialAccountAdapter


@pytest.mark.django_db
def test_account_adapter_blocks_open_signup():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    assert SlotflowAccountAdapter().is_open_for_signup(request) is False


@pytest.mark.django_db
def test_social_adapter_rejects_signup_when_no_invite_in_session():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    adapter = SlotflowSocialAccountAdapter()
    assert adapter.is_open_for_signup(request, sociallogin=None) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: `ModuleNotFoundError: No module named 'invites.adapters'`.

- [ ] **Step 3: Write `backend/invites/adapters.py` (skeleton — full logic added in Phase 4)**

```python
from __future__ import annotations

from django.utils import timezone

from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

from invites.models import Invite


class SlotflowAccountAdapter(DefaultAccountAdapter):
    """Block self-serve signup unconditionally — invite-only platform.

    Password signup goes through `invites.api.accept_password_view`, not
    allauth, so allauth itself never opens the signup gate.
    """

    def is_open_for_signup(self, request) -> bool:
        return False


class SlotflowSocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request, sociallogin) -> bool:
        token_hash = request.session.get("pending_invite_token_hash")
        if not token_hash:
            return False
        return Invite.objects.filter(
            token_hash=token_hash,
            status=Invite.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).exists()
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/adapters.py backend/invites/tests/views/__init__.py backend/invites/tests/views/social_adapter_test.py
git commit -m "feat(invites): adapter scaffolding (signup gated on session invite)"
```

---

### Task 2.4: OAuth-MFA detection service

**Files:**
- Create: `backend/invites/services/oauth_mfa.py`
- Create: `backend/invites/tests/services/oauth_mfa_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/services/oauth_mfa_test.py
from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
import responses

from invites.services.oauth_mfa import check_oauth_mfa


def _sociallogin(provider: str, *, extra_data: dict | None = None, token: str | None = None):
    return SimpleNamespace(
        account=SimpleNamespace(provider=provider, extra_data=extra_data or {}),
        token=SimpleNamespace(token=token or ""),
    )


def test_google_with_amr_mfa_returns_true():
    sl = _sociallogin("google", extra_data={"amr": ["pwd", "mfa"]})
    assert check_oauth_mfa(sl) is True


def test_google_without_amr_mfa_returns_false():
    sl = _sociallogin("google", extra_data={"amr": ["pwd"]})
    assert check_oauth_mfa(sl) is False


def test_google_missing_amr_returns_false():
    sl = _sociallogin("google", extra_data={})
    assert check_oauth_mfa(sl) is False


@responses.activate
def test_github_two_factor_true_returns_true():
    responses.add(
        responses.GET,
        "https://api.github.com/user",
        json={"two_factor_authentication": True},
        status=200,
    )
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is True


@responses.activate
def test_github_two_factor_false_returns_false():
    responses.add(
        responses.GET,
        "https://api.github.com/user",
        json={"two_factor_authentication": False},
        status=200,
    )
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is False


@responses.activate
def test_github_api_error_returns_false():
    responses.add(responses.GET, "https://api.github.com/user", status=500)
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is False


@responses.activate
def test_github_network_error_returns_false():
    # No `responses.add` → unmocked URL raises ConnectionError under @responses.activate.
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is False


def test_unknown_provider_returns_false():
    sl = _sociallogin("twitter")
    assert check_oauth_mfa(sl) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/services/oauth_mfa_test.py -v`
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Write `backend/invites/services/oauth_mfa.py`**

```python
from __future__ import annotations

import logging

import requests

logger = logging.getLogger("slotflow.invites.oauth_mfa")


def check_oauth_mfa(sociallogin) -> bool:
    """Return True iff the OAuth provider asserts the account has MFA enabled."""
    provider = getattr(sociallogin.account, "provider", "")
    if provider == "google":
        amr = sociallogin.account.extra_data.get("amr") or []
        return "mfa" in amr
    if provider == "github":
        token = getattr(sociallogin.token, "token", "") or ""
        if not token:
            return False
        try:
            resp = requests.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"token {token}",
                    "Accept": "application/vnd.github+json",
                },
                timeout=5,
            )
        except requests.RequestException as exc:
            logger.warning("github_user_fetch_failed", extra={"error": str(exc)})
            return False
        if resp.status_code != 200:
            logger.warning(
                "github_user_fetch_status",
                extra={"status_code": resp.status_code},
            )
            return False
        try:
            return bool(resp.json().get("two_factor_authentication"))
        except ValueError:
            return False
    return False
```

- [ ] **Step 4: Run test, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/services/oauth_mfa_test.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/services/oauth_mfa.py backend/invites/tests/services/oauth_mfa_test.py
git commit -m "feat(invites): add OAuth MFA detection (Google amr, GitHub /user)"
```

---

## Phase 3 — Public API endpoints

### Task 3.1: Preflight endpoint (`GET /api/invites/<token>/`)

**Files:**
- Create: `backend/invites/api.py`
- Create: `backend/invites/urls.py`
- Modify: `backend/config/urls.py` (mount `api/invites/`)
- Create: `backend/invites/tests/api/preflight_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/api/preflight_test.py
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import issue_token


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin", email="admin@x.com", is_superuser=True, is_staff=True,
    )


@pytest.fixture
def terms(db):
    return TermsVersion.objects.create(
        version="1.0", body="ToS body", effective_at=timezone.now(),
    )


@pytest.fixture
def client():
    return APIClient()


def _create_invite(admin, *, expires_delta=timedelta(days=7), status=Invite.Status.PENDING):
    raw, hashed = issue_token()
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash=hashed,
        expires_at=timezone.now() + expires_delta,
        status=status,
        created_by=admin,
    )
    return raw, inv


@pytest.mark.django_db
def test_preflight_returns_200_with_invite_payload(client, admin, terms):
    raw, inv = _create_invite(admin)

    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 200, resp.content
    data = resp.json()
    assert data["email"] == "alice@x.com"
    assert data["expires_at"]
    assert data["providers"] == ["google", "github"]
    assert data["terms_version"]["id"] == terms.id
    assert data["terms_version"]["version"] == "1.0"
    assert "ToS body" in data["terms_version"]["body_markdown"]


@pytest.mark.django_db
def test_preflight_404_for_unknown_token(client, terms):
    resp = client.get("/api/invites/no-such-token/")
    assert resp.status_code == 404
    assert resp.json() == {"error": "invalid_token"}


@pytest.mark.django_db
def test_preflight_410_for_expired(client, admin, terms):
    raw, _ = _create_invite(admin, expires_delta=timedelta(seconds=-1))
    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 410
    body = resp.json()
    assert body["error"] == "expired"
    assert "expires_at" in body


@pytest.mark.django_db
def test_preflight_410_for_revoked(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.REVOKED)
    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 410
    assert resp.json()["error"] == "revoked"


@pytest.mark.django_db
def test_preflight_410_for_already_used(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.ACCEPTED)
    resp = client.get(f"/api/invites/{raw}/")
    assert resp.status_code == 410
    assert resp.json()["error"] == "already_used"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/api/preflight_test.py -v`
Expected: 5 failures (URL not mounted yet).

- [ ] **Step 3: Write `backend/invites/api.py` (preflight only — accept/start added in 3.2 + 3.3)**

```python
from __future__ import annotations

from django.http import Http404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import hash_token


def _terms_payload(terms: TermsVersion | None) -> dict | None:
    if terms is None:
        return None
    return {"id": terms.id, "version": terms.version, "body_markdown": terms.body}


def _invite_state_response(invite: Invite) -> Response:
    if invite.status == Invite.Status.REVOKED:
        return Response({"error": "revoked"}, status=410)
    if invite.status == Invite.Status.ACCEPTED:
        return Response({"error": "already_used"}, status=410)
    if invite.is_expired:
        return Response(
            {"error": "expired", "expires_at": invite.expires_at.isoformat()},
            status=410,
        )
    return None  # consumable


@api_view(["GET"])
@permission_classes([AllowAny])
def preflight_view(request: Request, token: str) -> Response:
    try:
        invite = Invite.objects.get(token_hash=hash_token(token))
    except Invite.DoesNotExist:
        return Response({"error": "invalid_token"}, status=404)

    bad = _invite_state_response(invite)
    if bad is not None:
        return bad

    terms = TermsVersion.current()
    return Response(
        {
            "email": invite.email,
            "expires_at": invite.expires_at.isoformat(),
            "providers": ["google", "github"],
            "terms_version": _terms_payload(terms),
        }
    )
```

- [ ] **Step 4: Mount the URL**

Create `backend/invites/urls.py`:

```python
from __future__ import annotations

from django.urls import path

from invites.api import preflight_view

urlpatterns = [
    path("<str:token>/", preflight_view, name="invite_preflight"),
]
```

In `backend/config/urls.py`, add inside `urlpatterns` (before `api/test/` line):

```python
    path("api/invites/", include("invites.urls")),
```

Then extend `Require2FAMiddleware`'s allowlist (in `backend/core/middleware/require_2fa.py`) to include `/api/invites/`:

```python
        if (
            path.startswith("/healthz")
            or path.startswith("/static/")
            or path.startswith("/admin/")
            or path.startswith("/accounts/")
            or path.startswith("/2fa/")
            or path.startswith("/api/auth/")
            or path.startswith("/api/invites/")
            or path in ("/api/test/_reset", "/api/test/_reset/")
        ):
            return self.get_response(request)
```

- [ ] **Step 5: Run tests, commit**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/api/preflight_test.py -v`
Expected: 5 passed.

```bash
git add backend/invites/api.py backend/invites/urls.py backend/config/urls.py backend/core/middleware/require_2fa.py backend/invites/tests/api/__init__.py backend/invites/tests/api/preflight_test.py
git commit -m "feat(invites): add GET /api/invites/<token>/ preflight endpoint"
```

---

### Task 3.2: Accept-password endpoint

**Files:**
- Modify: `backend/invites/api.py` (add `accept_password_view` + audit calls)
- Modify: `backend/invites/urls.py`
- Create: `backend/invites/tests/api/accept_password_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/api/accept_password_test.py
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditEvent
from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import issue_token
from tenancy.models import Membership, MembershipRole, Workspace


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin", email="admin@x.com", is_superuser=True,
    )


@pytest.fixture
def terms(db):
    return TermsVersion.objects.create(
        version="1.0", body="t", effective_at=timezone.now(),
    )


@pytest.fixture
def client():
    return APIClient()


def _create_invite(admin, *, email="alice@x.com", expires_delta=timedelta(days=7),
                   status=Invite.Status.PENDING):
    raw, hashed = issue_token()
    inv = Invite.objects.create(
        email=email, token_hash=hashed,
        expires_at=timezone.now() + expires_delta,
        status=status, created_by=admin,
    )
    return raw, inv


def _payload(terms_id, **overrides):
    base = {
        "password": "Sup3r-Secret-Pw!",
        "workspace_name": "Alice's Workspace",
        "terms_version_id": terms_id,
    }
    base.update(overrides)
    return base


@pytest.mark.django_db
def test_accept_password_creates_user_workspace_membership(client, admin, terms):
    raw, inv = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id), format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json() == {"next": "/2fa/setup"}

    inv.refresh_from_db()
    assert inv.status == Invite.Status.ACCEPTED
    assert inv.accepted_by is not None
    assert inv.workspace is not None

    user = get_user_model().objects.get(email__iexact="alice@x.com")
    assert user.username == "alice@x.com"
    assert user.check_password("Sup3r-Secret-Pw!")
    assert user.accepted_terms_version_id == terms.id
    assert user.accepted_terms_at is not None

    ws = Workspace.objects.get(pk=inv.workspace_id)
    assert ws.name == "Alice's Workspace"
    assert Membership.objects.filter(
        user=user, workspace=ws, role=MembershipRole.OWNER,
    ).exists()


@pytest.mark.django_db
def test_accept_password_logs_user_in(client, admin, terms):
    raw, _ = _create_invite(admin)
    client.post(f"/api/invites/{raw}/accept-password/", _payload(terms.id), format="json")
    me = client.get("/api/auth/me/")
    assert me.status_code == 200
    assert me.json()["authenticated"] is True
    assert me.json()["username"] == "alice@x.com"


@pytest.mark.django_db
def test_accept_password_writes_audit_events(client, admin, terms):
    raw, inv = _create_invite(admin)
    client.post(f"/api/invites/{raw}/accept-password/", _payload(terms.id), format="json")

    actions = list(
        AuditEvent.objects.filter(entity_type__in=("invites.Invite", "identity.User"))
        .values_list("action", flat=True)
    )
    assert "invite.accepted" in actions
    assert "user.created" in actions
    assert "terms.accepted" in actions


@pytest.mark.django_db
def test_accept_password_410_when_expired(client, admin, terms):
    raw, _ = _create_invite(admin, expires_delta=timedelta(seconds=-1))
    resp = client.post(
        f"/api/invites/{raw}/accept-password/", _payload(terms.id), format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "expired"


@pytest.mark.django_db
def test_accept_password_410_when_already_accepted(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.ACCEPTED)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/", _payload(terms.id), format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "already_used"


@pytest.mark.django_db
def test_accept_password_410_when_revoked(client, admin, terms):
    raw, _ = _create_invite(admin, status=Invite.Status.REVOKED)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/", _payload(terms.id), format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "revoked"


@pytest.mark.django_db
def test_accept_password_409_when_user_with_email_exists(client, admin, terms):
    get_user_model().objects.create_user(
        username="alice@x.com", email="alice@x.com", password="x",
    )
    raw, _ = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/", _payload(terms.id), format="json",
    )
    assert resp.status_code == 409
    assert resp.json()["error"] == "user_exists"
    actions = list(
        AuditEvent.objects.filter(action="invite.rejected_user_exists")
        .values_list("action", flat=True)
    )
    assert actions == ["invite.rejected_user_exists"]


@pytest.mark.django_db
def test_accept_password_422_when_password_too_short(client, admin, terms):
    raw, _ = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id, password="x"), format="json",
    )
    assert resp.status_code == 422
    assert "password" in resp.json()


@pytest.mark.django_db
def test_accept_password_422_when_terms_version_stale(client, admin, terms):
    raw, _ = _create_invite(admin)
    # newer ToS rendered "current" by effective_at
    TermsVersion.objects.create(
        version="2.0", body="newer", effective_at=timezone.now(),
    )
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id), format="json",
    )
    assert resp.status_code == 422
    assert "terms_version_id" in resp.json()


@pytest.mark.django_db
def test_accept_password_422_when_workspace_name_invalid(client, admin, terms):
    raw, _ = _create_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/accept-password/",
        _payload(terms.id, workspace_name="!!"), format="json",
    )
    assert resp.status_code == 422
    assert "workspace_name" in resp.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/api/accept_password_test.py -v`
Expected: every test fails (URL not mounted, view not written).

- [ ] **Step 3: Extend `backend/invites/api.py`**

Append (and update imports at the top):

```python
import re

from django.contrib.auth import get_user_model
from django.contrib.auth import login as django_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from audit.services import write_audit_event
from invites.services.workspace_slug import unique_slug_from_email
from tenancy.models import Membership, MembershipRole, Workspace


WORKSPACE_NAME_RE = re.compile(r"^[A-Za-z0-9 '\-]{2,80}$")


def _validate_payload(data: dict) -> dict:
    errors: dict[str, list[str]] = {}

    password = (data.get("password") or "").strip()
    workspace_name = (data.get("workspace_name") or "").strip()
    terms_version_id = data.get("terms_version_id")

    if not password:
        errors.setdefault("password", []).append("Password is required.")
    else:
        try:
            validate_password(password)
        except ValidationError as exc:
            errors.setdefault("password", []).extend(list(exc.messages))

    if not WORKSPACE_NAME_RE.match(workspace_name):
        errors.setdefault("workspace_name", []).append(
            "2-80 chars; letters, numbers, spaces, apostrophes, or hyphens.",
        )

    current = TermsVersion.current()
    if current is None or current.id != terms_version_id:
        errors.setdefault("terms_version_id", []).append(
            "Stale or unknown ToS version. Reload the page.",
        )

    return errors


@api_view(["POST"])
@permission_classes([AllowAny])
def accept_password_view(request: Request, token: str) -> Response:
    try:
        invite = Invite.objects.select_for_update().get(token_hash=hash_token(token))
    except Invite.DoesNotExist:
        return Response({"error": "invalid_token"}, status=404)

    bad = _invite_state_response(invite)
    if bad is not None:
        if bad.data.get("error") == "expired":
            write_audit_event(actor=None, action="invite.rejected_expired", entity=invite)
        elif bad.data.get("error") == "revoked":
            write_audit_event(actor=None, action="invite.rejected_revoked", entity=invite)
        return bad

    User = get_user_model()
    if User.objects.filter(email__iexact=invite.email).exists():
        write_audit_event(
            actor=None, action="invite.rejected_user_exists",
            entity=invite, metadata={"path": "password"},
        )
        return Response({"error": "user_exists"}, status=409)

    errors = _validate_payload(request.data)
    if errors:
        return Response(errors, status=422)

    password = request.data["password"].strip()
    workspace_name = request.data["workspace_name"].strip()
    terms = TermsVersion.objects.get(pk=request.data["terms_version_id"])

    with transaction.atomic():
        user = User.objects.create_user(
            username=invite.email,
            email=invite.email,
            password=password,
        )
        user.accepted_terms_version = terms
        user.accepted_terms_at = timezone.now()
        user.save(update_fields=("accepted_terms_version", "accepted_terms_at"))

        workspace = Workspace.objects.create(
            name=workspace_name,
            slug=unique_slug_from_email(invite.email),
        )
        Membership.objects.create(
            user=user, workspace=workspace, role=MembershipRole.OWNER,
        )

        invite.mark_accepted(user=user, workspace=workspace)

        write_audit_event(
            actor=user, action="invite.accepted",
            entity=invite, metadata={"path": "password"},
        )
        write_audit_event(
            actor=user, action="user.created",
            entity=user, metadata={"path": "password", "workspace_id": str(workspace.id)},
        )
        write_audit_event(
            actor=user, action="terms.accepted",
            entity=user,
            metadata={"terms_version_id": terms.id, "version": terms.version},
        )

    django_login(request._request, user)
    return Response({"next": "/2fa/setup"})
```

- [ ] **Step 4: Add the URL pattern**

Edit `backend/invites/urls.py`:

```python
from __future__ import annotations

from django.urls import path

from invites.api import accept_password_view, preflight_view

urlpatterns = [
    path("<str:token>/", preflight_view, name="invite_preflight"),
    path("<str:token>/accept-password/", accept_password_view, name="invite_accept_password"),
]
```

- [ ] **Step 5: Run tests, commit**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/api/accept_password_test.py -v`
Expected: 9 passed.

```bash
git add backend/invites/api.py backend/invites/urls.py backend/invites/tests/api/accept_password_test.py
git commit -m "feat(invites): add POST /api/invites/<token>/accept-password/ endpoint"
```

---

### Task 3.3: OAuth-start endpoint

**Files:**
- Modify: `backend/invites/api.py` (add `oauth_start_view`)
- Modify: `backend/invites/urls.py`
- Create: `backend/invites/tests/api/oauth_start_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/api/oauth_start_test.py
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import hash_token, issue_token


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin", email="admin@x.com", is_superuser=True,
    )


@pytest.fixture
def terms(db):
    return TermsVersion.objects.create(
        version="1.0", body="t", effective_at=timezone.now(),
    )


@pytest.fixture
def client():
    return APIClient()


def _make_invite(admin):
    raw, hashed = issue_token()
    Invite.objects.create(
        email="alice@x.com", token_hash=hashed,
        expires_at=timezone.now() + timedelta(days=7),
        status=Invite.Status.PENDING, created_by=admin,
    )
    return raw, hashed


@pytest.mark.django_db
@pytest.mark.parametrize("provider", ["google", "github"])
def test_oauth_start_returns_redirect_url_and_stashes_session(client, admin, terms, provider):
    raw, hashed = _make_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/oauth-start/",
        {
            "provider": provider,
            "workspace_name": "Alice WS",
            "terms_version_id": terms.id,
        },
        format="json",
    )
    assert resp.status_code == 200, resp.content
    assert resp.json() == {"redirect_url": f"/accounts/{provider}/login/"}

    s = client.session
    assert s["pending_invite_token_hash"] == hashed
    assert s["pending_invite_raw_token"] == raw
    assert s["workspace_name"] == "Alice WS"
    assert s["accepted_terms_version_id"] == terms.id


@pytest.mark.django_db
def test_oauth_start_400_unknown_provider(client, admin, terms):
    raw, _ = _make_invite(admin)
    resp = client.post(
        f"/api/invites/{raw}/oauth-start/",
        {"provider": "twitter", "workspace_name": "X", "terms_version_id": terms.id},
        format="json",
    )
    assert resp.status_code == 422
    assert "provider" in resp.json()


@pytest.mark.django_db
def test_oauth_start_410_for_expired(client, admin, terms):
    raw, hashed = issue_token()
    Invite.objects.create(
        email="x@x.com", token_hash=hashed,
        expires_at=timezone.now() - timedelta(seconds=1),
        status=Invite.Status.PENDING, created_by=admin,
    )
    resp = client.post(
        f"/api/invites/{raw}/oauth-start/",
        {"provider": "google", "workspace_name": "X", "terms_version_id": terms.id},
        format="json",
    )
    assert resp.status_code == 410
    assert resp.json()["error"] == "expired"


@pytest.mark.django_db
def test_oauth_start_404_for_unknown_token(client, terms):
    resp = client.post(
        "/api/invites/no-such/oauth-start/",
        {"provider": "google", "workspace_name": "X", "terms_version_id": terms.id},
        format="json",
    )
    assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/api/oauth_start_test.py -v`
Expected: failures (URL not mounted).

- [ ] **Step 3: Extend `backend/invites/api.py`**

Append:

```python
ALLOWED_PROVIDERS = {"google", "github"}


@api_view(["POST"])
@permission_classes([AllowAny])
def oauth_start_view(request: Request, token: str) -> Response:
    try:
        invite = Invite.objects.get(token_hash=hash_token(token))
    except Invite.DoesNotExist:
        return Response({"error": "invalid_token"}, status=404)

    bad = _invite_state_response(invite)
    if bad is not None:
        return bad

    provider = (request.data.get("provider") or "").strip().lower()
    if provider not in ALLOWED_PROVIDERS:
        return Response(
            {"provider": ["Must be one of: google, github."]}, status=422,
        )

    errors = _validate_payload(
        {**request.data, "password": "placeholder-Pw1!"},  # password not used; bypass validator
    )
    # `password` validator was satisfied by the placeholder; remove that key
    # from any errors that bubbled up so callers see only their real problems.
    errors.pop("password", None)
    if errors:
        return Response(errors, status=422)

    request.session["pending_invite_token_hash"] = invite.token_hash
    request.session["pending_invite_raw_token"] = token
    request.session["workspace_name"] = request.data["workspace_name"].strip()
    request.session["accepted_terms_version_id"] = request.data["terms_version_id"]
    request.session.modified = True

    return Response({"redirect_url": f"/accounts/{provider}/login/"})
```

- [ ] **Step 4: Mount URL**

Edit `backend/invites/urls.py`:

```python
from __future__ import annotations

from django.urls import path

from invites.api import (
    accept_password_view,
    oauth_start_view,
    preflight_view,
)

urlpatterns = [
    path("<str:token>/", preflight_view, name="invite_preflight"),
    path("<str:token>/accept-password/", accept_password_view, name="invite_accept_password"),
    path("<str:token>/oauth-start/", oauth_start_view, name="invite_oauth_start"),
]
```

- [ ] **Step 5: Run tests, commit**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/api/oauth_start_test.py -v`
Expected: 6 passed (2 from parametrize + 4 others).

```bash
git add backend/invites/api.py backend/invites/urls.py backend/invites/tests/api/oauth_start_test.py
git commit -m "feat(invites): add POST /api/invites/<token>/oauth-start/ endpoint"
```

---

## Phase 4 — Complete the social adapter

### Task 4.1: Adapter `pre_social_login` — email match + user_exists guard

**Files:**
- Modify: `backend/invites/adapters.py`
- Modify: `backend/invites/tests/views/social_adapter_test.py`

- [ ] **Step 1: Extend the test**

Append to `backend/invites/tests/views/social_adapter_test.py`:

```python
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from allauth.exceptions import ImmediateHttpResponse
from django.contrib.auth import get_user_model
from django.utils import timezone

from audit.models import AuditEvent
from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import issue_token


def _stub_sociallogin(*, email, provider="google", amr=None):
    return SimpleNamespace(
        user=SimpleNamespace(email=email),
        account=SimpleNamespace(provider=provider, extra_data={"amr": amr or []}),
        token=SimpleNamespace(token=""),
        is_existing=False,
    )


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin", email="admin@x.com", is_superuser=True,
    )


@pytest.fixture
def invite_in_session(admin, db):
    raw, hashed = issue_token()
    inv = Invite.objects.create(
        email="alice@x.com", token_hash=hashed,
        expires_at=timezone.now() + timedelta(days=7),
        status=Invite.Status.PENDING, created_by=admin,
    )
    return raw, hashed, inv


@pytest.mark.django_db
def test_pre_social_login_redirects_on_email_mismatch(invite_in_session):
    raw, hashed, invite = invite_in_session
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
    }

    sociallogin = _stub_sociallogin(email="MALLORY@x.com")
    adapter = SlotflowSocialAccountAdapter()

    with pytest.raises(ImmediateHttpResponse) as exc_info:
        adapter.pre_social_login(request, sociallogin)
    response = exc_info.value.response
    assert response.status_code in (301, 302)
    assert f"/accept-invite/{raw}/?error=email_mismatch" in response["Location"]
    assert AuditEvent.objects.filter(action="invite.rejected_email_mismatch").count() == 1


@pytest.mark.django_db
def test_pre_social_login_redirects_when_user_with_email_already_exists(invite_in_session):
    raw, hashed, _ = invite_in_session
    get_user_model().objects.create_user(
        username="alice@x.com", email="alice@x.com", password="x",
    )
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
    }

    sociallogin = _stub_sociallogin(email="alice@x.com")
    adapter = SlotflowSocialAccountAdapter()

    with pytest.raises(ImmediateHttpResponse) as exc_info:
        adapter.pre_social_login(request, sociallogin)
    assert "?error=user_exists" in exc_info.value.response["Location"]
    assert AuditEvent.objects.filter(action="invite.rejected_user_exists").count() == 1


@pytest.mark.django_db
def test_pre_social_login_passes_when_email_matches_and_user_new(invite_in_session):
    raw, hashed, _ = invite_in_session
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
    }

    sociallogin = _stub_sociallogin(email="alice@x.com")
    adapter = SlotflowSocialAccountAdapter()
    adapter.pre_social_login(request, sociallogin)  # no exception


@pytest.mark.django_db
def test_pre_social_login_redirects_unknown_oauth_user_when_no_invite():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    sociallogin = _stub_sociallogin(email="stranger@x.com")
    sociallogin.is_existing = False  # unknown account

    adapter = SlotflowSocialAccountAdapter()
    with pytest.raises(ImmediateHttpResponse) as exc_info:
        adapter.pre_social_login(request, sociallogin)
    assert "/login?error=no_account" in exc_info.value.response["Location"]


@pytest.mark.django_db
def test_pre_social_login_passes_existing_user_login_with_no_invite():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    sociallogin = _stub_sociallogin(email="alice@x.com")
    sociallogin.is_existing = True  # SocialAccount → User link exists

    adapter = SlotflowSocialAccountAdapter()
    adapter.pre_social_login(request, sociallogin)  # no exception
```

- [ ] **Step 2: Run tests, expect failures**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: failures (`pre_social_login` not yet implemented).

- [ ] **Step 3: Extend `backend/invites/adapters.py`**

Replace the file contents with:

```python
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.shortcuts import redirect
from django.utils import timezone

from allauth.account.adapter import DefaultAccountAdapter
from allauth.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

from audit.services import write_audit_event
from invites.models import Invite
from invites.services.tokens import sha256_email


class SlotflowAccountAdapter(DefaultAccountAdapter):
    """Block self-serve signup unconditionally — invite-only platform."""

    def is_open_for_signup(self, request) -> bool:
        return False


class SlotflowSocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request, sociallogin) -> bool:
        token_hash = request.session.get("pending_invite_token_hash")
        if not token_hash:
            return False
        return Invite.objects.filter(
            token_hash=token_hash,
            status=Invite.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).exists()

    def pre_social_login(self, request, sociallogin):
        token_hash = request.session.get("pending_invite_token_hash")
        raw_token = request.session.get("pending_invite_raw_token", "")

        if not token_hash:
            # Existing-user login mode. Require a known SocialAccount link.
            if getattr(sociallogin, "is_existing", False):
                return
            raise ImmediateHttpResponse(redirect("/login?error=no_account"))

        invite = Invite.objects.get(token_hash=token_hash)
        oauth_email = (sociallogin.user.email or "").strip().lower()
        if oauth_email != invite.email.lower():
            write_audit_event(
                actor=None,
                action="invite.rejected_email_mismatch",
                entity=invite,
                metadata={
                    "provider": sociallogin.account.provider,
                    "oauth_email_hash": sha256_email(oauth_email),
                },
            )
            raise ImmediateHttpResponse(
                redirect(f"/accept-invite/{raw_token}/?error=email_mismatch"),
            )

        User = get_user_model()
        if User.objects.filter(email__iexact=invite.email).exists():
            write_audit_event(
                actor=None,
                action="invite.rejected_user_exists",
                entity=invite,
                metadata={"path": sociallogin.account.provider},
            )
            raise ImmediateHttpResponse(
                redirect(f"/accept-invite/{raw_token}/?error=user_exists"),
            )
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: 7 passed (2 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add backend/invites/adapters.py backend/invites/tests/views/social_adapter_test.py
git commit -m "feat(invites): adapter pre_social_login — email match + user_exists guards"
```

---

### Task 4.2: Adapter `save_user` — full success path

**Files:**
- Modify: `backend/invites/adapters.py`
- Modify: `backend/invites/tests/views/social_adapter_test.py`

- [ ] **Step 1: Extend the test**

Append to `backend/invites/tests/views/social_adapter_test.py`:

```python
@pytest.mark.django_db
def test_save_user_creates_user_workspace_membership_and_audit(invite_in_session):
    raw, hashed, invite = invite_in_session
    terms = TermsVersion.objects.create(
        version="1.0", body="t", effective_at=timezone.now(),
    )

    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
        "workspace_name": "Alice's WS",
        "accepted_terms_version_id": terms.id,
    }

    User = get_user_model()
    new_user = User(username="alice@x.com", email="alice@x.com")
    sociallogin = SimpleNamespace(
        user=new_user,
        account=SimpleNamespace(provider="google", extra_data={"amr": ["pwd"]}),
        token=SimpleNamespace(token=""),
        is_existing=False,
    )
    saved_links: list = []
    sociallogin.connect = lambda req, user: saved_links.append(user)

    adapter = SlotflowSocialAccountAdapter()
    saved = adapter.save_user(request, sociallogin, form=None)

    assert saved.pk is not None
    assert saved.email == "alice@x.com"
    assert saved.username == "alice@x.com"
    assert saved.has_usable_password() is False
    assert saved.accepted_terms_version_id == terms.id

    invite.refresh_from_db()
    assert invite.status == Invite.Status.ACCEPTED
    assert invite.accepted_by_id == saved.pk

    from tenancy.models import Membership, MembershipRole, Workspace
    ws = Workspace.objects.get(pk=invite.workspace_id)
    assert ws.name == "Alice's WS"
    assert Membership.objects.filter(user=saved, workspace=ws, role=MembershipRole.OWNER).exists()

    actions = set(AuditEvent.objects.values_list("action", flat=True))
    assert {"invite.accepted", "user.created", "terms.accepted"}.issubset(actions)
    assert saved_links == [saved]


@pytest.mark.django_db
def test_save_user_sets_oauth_mfa_when_amr_includes_mfa(invite_in_session):
    raw, hashed, _ = invite_in_session
    terms = TermsVersion.objects.create(
        version="1.0", body="t", effective_at=timezone.now(),
    )
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
        "workspace_name": "Alice's WS",
        "accepted_terms_version_id": terms.id,
    }

    User = get_user_model()
    sociallogin = SimpleNamespace(
        user=User(username="alice@x.com", email="alice@x.com"),
        account=SimpleNamespace(provider="google", extra_data={"amr": ["mfa"]}),
        token=SimpleNamespace(token=""),
        is_existing=False,
        connect=lambda req, u: None,
    )

    SlotflowSocialAccountAdapter().save_user(request, sociallogin, form=None)
    assert request.session["oauth_mfa_satisfied"] is True
    assert AuditEvent.objects.filter(action="oauth.mfa_satisfied").count() == 1


@pytest.mark.django_db
def test_save_user_skips_mfa_session_flag_when_amr_missing(invite_in_session):
    raw, hashed, _ = invite_in_session
    terms = TermsVersion.objects.create(
        version="1.0", body="t", effective_at=timezone.now(),
    )
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
        "workspace_name": "Alice's WS",
        "accepted_terms_version_id": terms.id,
    }

    User = get_user_model()
    sociallogin = SimpleNamespace(
        user=User(username="alice@x.com", email="alice@x.com"),
        account=SimpleNamespace(provider="google", extra_data={"amr": ["pwd"]}),
        token=SimpleNamespace(token=""),
        is_existing=False,
        connect=lambda req, u: None,
    )

    SlotflowSocialAccountAdapter().save_user(request, sociallogin, form=None)
    assert "oauth_mfa_satisfied" not in request.session
    assert AuditEvent.objects.filter(action="oauth.mfa_satisfied").count() == 0
```

- [ ] **Step 2: Run tests, expect failures**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: 3 new failures (no `save_user` yet).

- [ ] **Step 3: Extend `backend/invites/adapters.py`**

Add the following imports near the top (alongside existing imports):

```python
from django.db import transaction

from core.models import TermsVersion
from invites.services.oauth_mfa import check_oauth_mfa
from invites.services.workspace_slug import unique_slug_from_email
from mcp.auth import mark_otp_session_fresh
from tenancy.models import Membership, MembershipRole, Workspace
```

Inside `SlotflowSocialAccountAdapter`, add `save_user`:

```python
    def save_user(self, request, sociallogin, form=None):
        token_hash = request.session["pending_invite_token_hash"]
        invite = Invite.objects.select_for_update().get(token_hash=token_hash)
        if not invite.is_consumable:
            raise ImmediateHttpResponse(
                redirect(
                    f"/accept-invite/{request.session.get('pending_invite_raw_token','')}/?error=oauth_failed"
                ),
            )

        terms = TermsVersion.objects.get(pk=request.session["accepted_terms_version_id"])
        workspace_name = request.session["workspace_name"]

        with transaction.atomic():
            user = sociallogin.user
            user.username = user.email
            user.set_unusable_password()
            user.accepted_terms_version = terms
            user.accepted_terms_at = timezone.now()
            user.save()

            sociallogin.connect(request, user)

            workspace = Workspace.objects.create(
                name=workspace_name,
                slug=unique_slug_from_email(invite.email),
            )
            Membership.objects.create(
                user=user, workspace=workspace, role=MembershipRole.OWNER,
            )
            invite.mark_accepted(user=user, workspace=workspace)

            mfa_ok = check_oauth_mfa(sociallogin)
            if mfa_ok:
                request.session["oauth_mfa_satisfied"] = True
                mark_otp_session_fresh(request)
                write_audit_event(
                    actor=user,
                    action="oauth.mfa_satisfied",
                    entity=user,
                    metadata={
                        "provider": sociallogin.account.provider,
                        "claim_source": (
                            "amr" if sociallogin.account.provider == "google" else "github_api"
                        ),
                    },
                )

            write_audit_event(
                actor=user, action="invite.accepted",
                entity=invite, metadata={"path": sociallogin.account.provider},
            )
            write_audit_event(
                actor=user, action="user.created",
                entity=user,
                metadata={
                    "path": sociallogin.account.provider,
                    "workspace_id": str(workspace.id),
                },
            )
            write_audit_event(
                actor=user, action="terms.accepted",
                entity=user,
                metadata={"terms_version_id": terms.id, "version": terms.version},
            )

        return user
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/adapters.py backend/invites/tests/views/social_adapter_test.py
git commit -m "feat(invites): adapter save_user creates User+Workspace+Membership+audit"
```

---

### Task 4.3: Adapter session cleanup + `authentication_error`

**Files:**
- Modify: `backend/invites/adapters.py`
- Modify: `backend/invites/tests/views/social_adapter_test.py`

- [ ] **Step 1: Extend the test**

Append:

```python
@pytest.mark.django_db
def test_save_user_pops_session_keys(invite_in_session):
    raw, hashed, _ = invite_in_session
    terms = TermsVersion.objects.create(
        version="1.0", body="t", effective_at=timezone.now(),
    )
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
        "workspace_name": "WS",
        "accepted_terms_version_id": terms.id,
    }
    User = get_user_model()
    sociallogin = SimpleNamespace(
        user=User(username="alice@x.com", email="alice@x.com"),
        account=SimpleNamespace(provider="google", extra_data={}),
        token=SimpleNamespace(token=""),
        is_existing=False,
        connect=lambda req, u: None,
    )

    SlotflowSocialAccountAdapter().save_user(request, sociallogin, form=None)
    for key in (
        "pending_invite_token_hash",
        "pending_invite_raw_token",
        "workspace_name",
        "accepted_terms_version_id",
    ):
        assert key not in request.session


@pytest.mark.django_db
def test_authentication_error_redirects_to_accept_invite_when_token_in_session():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {"pending_invite_raw_token": "raw-tok"}
    adapter = SlotflowSocialAccountAdapter()

    response = adapter.authentication_error(
        request, provider_id="google", error=None, exception=None, extra_context=None,
    )
    assert response.status_code in (301, 302)
    assert "/accept-invite/raw-tok/?error=oauth_failed" in response["Location"]


@pytest.mark.django_db
def test_authentication_error_redirects_to_login_when_no_invite():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    adapter = SlotflowSocialAccountAdapter()

    response = adapter.authentication_error(
        request, provider_id="google", error=None, exception=None, extra_context=None,
    )
    assert response.status_code in (301, 302)
    assert "/login?error=oauth_failed" in response["Location"]
```

- [ ] **Step 2: Run tests, expect failures**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: 3 new failures.

- [ ] **Step 3: Extend `backend/invites/adapters.py`**

Add a helper at module top:

```python
_SESSION_KEYS = (
    "pending_invite_token_hash",
    "pending_invite_raw_token",
    "workspace_name",
    "accepted_terms_version_id",
)


def _clear_invite_session(request) -> None:
    for k in _SESSION_KEYS:
        request.session.pop(k, None)
```

Append a final session-cleanup line to `save_user` (after the `with transaction.atomic():` block, indented to method body):

```python
        _clear_invite_session(request)
        return user
```

(Replace the existing `return user` with this two-line pair.)

Add `authentication_error` to `SlotflowSocialAccountAdapter`:

```python
    def authentication_error(
        self, request, provider_id, error=None, exception=None, extra_context=None,
    ):
        raw = request.session.get("pending_invite_raw_token")
        _clear_invite_session(request)
        if raw:
            return redirect(f"/accept-invite/{raw}/?error=oauth_failed")
        return redirect("/login?error=oauth_failed")
```

Note: allauth normally calls `authentication_error` and then renders a template; returning a redirect short-circuits that. In some allauth versions the contract is to *raise* `ImmediateHttpResponse`. The TestRunner test above expects a returned redirect; if allauth raises instead in production, swap the two `return` statements for `raise ImmediateHttpResponse(redirect(...))` and update the assertions accordingly.

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/views/social_adapter_test.py -v`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/adapters.py backend/invites/tests/views/social_adapter_test.py
git commit -m "feat(invites): adapter session cleanup + authentication_error redirect"
```

---

## Phase 5 — Middleware + `/api/auth/me/` extension

### Task 5.1: `Require2FAMiddleware` honours `oauth_mfa_satisfied`

**Files:**
- Modify: `backend/core/middleware/require_2fa.py`
- Create: `backend/core/tests/services/require_2fa_test.py` (or extend existing test for the file)

- [ ] **Step 1: Write the failing test**

```python
# backend/core/tests/services/require_2fa_test.py
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        username="alice", email="alice@x.com", password="Sup3r-Secret-Pw!",
    )


@pytest.mark.django_db
def test_authenticated_user_without_oauth_mfa_redirected_to_2fa_setup(user, client: Client):
    client.force_login(user)
    resp = client.get("/dashboard/", follow=False)
    # No TOTP device, no oauth_mfa_satisfied → middleware redirects.
    assert resp.status_code in (301, 302)
    assert "/2fa/setup/" in resp["Location"]


@pytest.mark.django_db
def test_session_oauth_mfa_satisfied_skips_redirect(user, client: Client):
    client.force_login(user)
    session = client.session
    session["oauth_mfa_satisfied"] = True
    session.save()
    resp = client.get("/dashboard/", follow=False)
    assert "/2fa/" not in resp.get("Location", "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/services/require_2fa_test.py -v`
Expected: second test fails (middleware ignores the session flag today).

- [ ] **Step 3: Update `backend/core/middleware/require_2fa.py`**

```python
from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django_otp.plugins.otp_totp.models import TOTPDevice

from core.auth_bypass import is_2fa_bypass_active


class Require2FAMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        path = request.path

        if (
            path.startswith("/healthz")
            or path.startswith("/static/")
            or path.startswith("/admin/")
            or path.startswith("/accounts/")
            or path.startswith("/2fa/")
            or path.startswith("/api/auth/")
            or path.startswith("/api/invites/")
            or path in ("/api/test/_reset", "/api/test/_reset/")
        ):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return self.get_response(request)

        if is_2fa_bypass_active():
            return self.get_response(request)

        session = getattr(request, "session", None)
        if session is not None and session.get("oauth_mfa_satisfied"):
            return self.get_response(request)

        if user.is_verified():
            return self.get_response(request)

        has_confirmed_device = TOTPDevice.objects.filter(user=user, confirmed=True).exists()
        if not has_confirmed_device:
            return redirect("/2fa/setup/")

        return redirect("/2fa/verify/")
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/services/require_2fa_test.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/middleware/require_2fa.py backend/core/tests/services/require_2fa_test.py
git commit -m "feat(core): Require2FAMiddleware honours oauth_mfa_satisfied session flag"
```

---

### Task 5.2: `/api/auth/me/` exposes `mfa_via_oauth`, extends `is_verified`

**Files:**
- Modify: `backend/core/api_auth.py`
- Modify or create: `backend/core/tests/api/auth_me_test.py`

- [ ] **Step 1: Write the failing test**

Search for any existing `_me_payload` test (`grep -rn _me_payload backend/core/tests/`). If one exists in an `auth_test.py`, prefer extending it; otherwise create the file below.

```python
# backend/core/tests/api/auth_me_test.py
from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        username="alice", email="alice@x.com", password="Sup3r-Secret-Pw!",
    )


@pytest.mark.django_db
def test_me_includes_mfa_via_oauth_false_by_default(user):
    client = APIClient()
    client.force_login(user)
    body = client.get("/api/auth/me/").json()
    assert body["mfa_via_oauth"] is False
    assert body["is_verified"] is False


@pytest.mark.django_db
def test_me_marks_oauth_mfa_session_as_verified(user):
    client = APIClient()
    client.force_login(user)
    session = client.session
    session["oauth_mfa_satisfied"] = True
    session.save()
    body = client.get("/api/auth/me/").json()
    assert body["mfa_via_oauth"] is True
    assert body["is_verified"] is True
```

- [ ] **Step 2: Run test, expect failures**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/api/auth_me_test.py -v`
Expected: failures (`mfa_via_oauth` not in payload).

- [ ] **Step 3: Update `_me_payload` and `me_view` in `backend/core/api_auth.py`**

```python
def _me_payload(user, request=None) -> dict:
    if not user.is_authenticated:
        return {
            "authenticated": False,
            "username": None,
            "has_totp_device": False,
            "is_verified": False,
            "mfa_via_oauth": False,
        }
    has_device = TOTPDevice.objects.filter(user=user, confirmed=True).exists()
    session = getattr(request, "session", None) if request is not None else None
    mfa_via_oauth = bool(session.get("oauth_mfa_satisfied")) if session else False
    return {
        "authenticated": True,
        "username": user.username,
        "has_totp_device": has_device,
        "is_verified": (
            _user_is_verified(user) or is_2fa_bypass_active() or mfa_via_oauth
        ),
        "mfa_via_oauth": mfa_via_oauth,
    }
```

Update every caller to thread `request`:

```python
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def me_view(request: Request) -> Response:
    return Response(_me_payload(request.user, request._request))


# login_view: replace `_me_payload(user)` → `_me_payload(user, request._request)`
# totp_confirm_view, totp_verify_view: same swap.
```

- [ ] **Step 4: Run tests, expect pass + ensure existing auth tests still pass**

```bash
backend/.venv/bin/python -m pytest backend/core/tests/api/ -v
```

Expected: all green; new file shows 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/api_auth.py backend/core/tests/api/auth_me_test.py
git commit -m "feat(core): /api/auth/me/ exposes mfa_via_oauth + extends is_verified"
```

---

## Phase 6 — Admin invitee CRUD

### Task 6.1: `InviteAdmin` list, search, filters, permissions

**Files:**
- Create: `backend/invites/admin.py`
- Create: `backend/invites/tests/admin/invite_admin_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/invites/tests/admin/invite_admin_test.py
from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone

from invites.models import Invite


@pytest.fixture
def superuser(db):
    return get_user_model().objects.create_superuser(
        username="root", email="root@x.com", password="x",
    )


@pytest.fixture
def staff_not_super(db):
    return get_user_model().objects.create_user(
        username="staff", email="staff@x.com", password="x",
        is_staff=True, is_superuser=False,
    )


@pytest.mark.django_db
def test_changelist_visible_to_superuser(client, superuser):
    client.force_login(superuser)
    resp = client.get(reverse("admin:invites_invite_changelist"))
    assert resp.status_code == 200


@pytest.mark.django_db
def test_changelist_forbidden_for_non_superuser(client, staff_not_super):
    client.force_login(staff_not_super)
    resp = client.get(reverse("admin:invites_invite_changelist"))
    assert resp.status_code in (302, 403)


@pytest.mark.django_db
def test_expired_filter_includes_expired_pending_invites(client, superuser):
    Invite.objects.create(
        email="a@x.com", token_hash="a" * 64,
        expires_at=timezone.now() - timedelta(seconds=1), created_by=superuser,
    )
    Invite.objects.create(
        email="b@x.com", token_hash="b" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=superuser,
    )
    client.force_login(superuser)
    resp = client.get(
        reverse("admin:invites_invite_changelist") + "?expired=expired",
    )
    assert resp.status_code == 200
    assert b"a@x.com" in resp.content
    assert b"b@x.com" not in resp.content
```

- [ ] **Step 2: Run test to verify it fails**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py -v`
Expected: failures (`InviteAdmin` not registered).

- [ ] **Step 3: Write `backend/invites/admin.py`**

```python
from __future__ import annotations

from django.contrib import admin
from django.utils import timezone

from invites.models import Invite


class ExpiredFilter(admin.SimpleListFilter):
    title = "expiry"
    parameter_name = "expired"

    def lookups(self, request, model_admin):
        return (("active", "Active"), ("expired", "Expired"))

    def queryset(self, request, queryset):
        now = timezone.now()
        if self.value() == "active":
            return queryset.filter(status=Invite.Status.PENDING, expires_at__gt=now)
        if self.value() == "expired":
            return queryset.filter(status=Invite.Status.PENDING, expires_at__lte=now)
        return queryset


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = (
        "email", "computed_status", "expires_at", "accepted_at",
        "accepted_by", "created_by", "created_at",
    )
    list_filter = ("status", ExpiredFilter)
    search_fields = ("email",)
    ordering = ("-created_at",)
    readonly_fields = (
        "token_hash", "accepted_at", "accepted_by", "workspace",
        "created_by", "created_at", "updated_at",
    )

    fieldsets = (
        (None, {"fields": ("email", "expires_at")}),
        ("Lifecycle", {
            "fields": (
                "status", "token_hash", "accepted_at", "accepted_by",
                "workspace", "created_by", "created_at", "updated_at",
            )
        }),
    )

    @admin.display(description="status", ordering="status")
    def computed_status(self, obj: Invite) -> str:
        if obj.status == Invite.Status.PENDING and obj.is_expired:
            return "expired"
        return obj.status

    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if obj and obj.status != Invite.Status.PENDING:
            ro = [f.name for f in obj._meta.fields]  # full lock-down
        elif obj is not None:
            ro.append("email")  # immutable post-create
        return ro

    # Permissions: superuser only.
    def _is_super(self, request) -> bool:
        return bool(request.user.is_authenticated and request.user.is_superuser)

    def has_module_permission(self, request): return self._is_super(request)
    def has_view_permission(self, request, obj=None): return self._is_super(request)
    def has_add_permission(self, request): return self._is_super(request)
    def has_change_permission(self, request, obj=None): return self._is_super(request)
    def has_delete_permission(self, request, obj=None): return self._is_super(request)
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/admin.py backend/invites/tests/admin/invite_admin_test.py
git commit -m "feat(invites): InviteAdmin list view + filters + superuser-only perms"
```

---

### Task 6.2: One-time invite URL flash on add

**Files:**
- Modify: `backend/invites/admin.py`
- Modify: `backend/invites/tests/admin/invite_admin_test.py`

- [ ] **Step 1: Extend the test**

Append:

```python
from audit.models import AuditEvent
from invites.services.tokens import hash_token


@pytest.mark.django_db
def test_add_view_creates_invite_with_hashed_token_and_flash(client, superuser):
    client.force_login(superuser)
    response = client.post(
        reverse("admin:invites_invite_add"),
        {
            "email": "alice@x.com",
            "expires_at_0": "2026-12-31",
            "expires_at_1": "00:00:00",
            "status": Invite.Status.PENDING,
        },
        follow=True,
    )
    assert response.status_code == 200

    invite = Invite.objects.get(email="alice@x.com")
    assert invite.token_hash and len(invite.token_hash) == 64
    assert invite.created_by_id == superuser.pk

    messages = [str(m) for m in response.context["messages"]]
    assert any("/accept-invite/" in m for m in messages)
    assert any("copy now" in m.lower() or "will not be shown again" in m.lower() for m in messages)

    assert AuditEvent.objects.filter(action="invite.issued").count() == 1
```

- [ ] **Step 2: Run test, expect failures**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py::test_add_view_creates_invite_with_hashed_token_and_flash -v`
Expected: failure (no `save_model` override yet, no token generation).

- [ ] **Step 3: Override `save_model` and form fields in `InviteAdmin`**

Add at the top of `backend/invites/admin.py`:

```python
from django.contrib import messages
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from audit.services import write_audit_event
from invites.services.tokens import issue_token
```

Inside `InviteAdmin`:

```python
    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request, obj, change=change, **kwargs)
        if not change and "token_hash" in form.base_fields:
            # Hide token_hash on add — it's auto-generated.
            del form.base_fields["token_hash"]
        return form

    def save_model(self, request, obj: Invite, form, change: bool) -> None:
        if not change:
            raw, hashed = issue_token()
            obj.token_hash = hashed
            obj.created_by = request.user
            super().save_model(request, obj, form, change)
            url = request.build_absolute_uri(f"/accept-invite/{raw}/")
            messages.success(
                request,
                format_html(
                    "Invite URL: <code>{}</code> &mdash; copy now, will not be shown again.",
                    url,
                ),
            )
            write_audit_event(
                actor=request.user, action="invite.issued",
                entity=obj,
                metadata={"email": obj.email, "expires_at": obj.expires_at.isoformat()},
            )
        else:
            super().save_model(request, obj, form, change)
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/admin.py backend/invites/tests/admin/invite_admin_test.py
git commit -m "feat(invites): admin add-view generates token, flashes URL once, audits issued"
```

---

### Task 6.3: Revoke + resend bulk actions

**Files:**
- Modify: `backend/invites/admin.py`
- Modify: `backend/invites/tests/admin/invite_admin_test.py`

- [ ] **Step 1: Extend the test**

```python
@pytest.mark.django_db
def test_revoke_action_marks_pending_invites_revoked(client, superuser):
    inv1 = Invite.objects.create(
        email="a@x.com", token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=superuser,
    )
    inv2 = Invite.objects.create(
        email="b@x.com", token_hash="b" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=superuser,
        status=Invite.Status.ACCEPTED,  # already accepted — should be skipped
    )
    client.force_login(superuser)
    client.post(
        reverse("admin:invites_invite_changelist"),
        {
            "action": "revoke_selected",
            "_selected_action": [str(inv1.pk), str(inv2.pk)],
            "index": "0",
        },
        follow=True,
    )

    inv1.refresh_from_db(); inv2.refresh_from_db()
    assert inv1.status == Invite.Status.REVOKED
    assert inv2.status == Invite.Status.ACCEPTED
    assert AuditEvent.objects.filter(action="invite.revoked").count() == 1


@pytest.mark.django_db
def test_resend_action_rotates_token_and_extends_expiry(client, superuser):
    inv = Invite.objects.create(
        email="a@x.com", token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=1), created_by=superuser,
    )
    old_hash = inv.token_hash
    old_expiry = inv.expires_at

    client.force_login(superuser)
    response = client.post(
        reverse("admin:invites_invite_changelist"),
        {
            "action": "resend_selected",
            "_selected_action": [str(inv.pk)],
            "index": "0",
        },
        follow=True,
    )
    inv.refresh_from_db()
    assert inv.token_hash != old_hash
    assert inv.expires_at > old_expiry

    messages_text = " ".join(str(m) for m in response.context["messages"])
    assert "/accept-invite/" in messages_text
    assert AuditEvent.objects.filter(action="invite.resent").count() == 1
```

- [ ] **Step 2: Run test, expect failures**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py::test_revoke_action_marks_pending_invites_revoked backend/invites/tests/admin/invite_admin_test.py::test_resend_action_rotates_token_and_extends_expiry -v`
Expected: failures (actions not yet defined).

- [ ] **Step 3: Add actions to `InviteAdmin`**

```python
from datetime import timedelta


    actions = ("revoke_selected", "resend_selected")

    @admin.action(description="Revoke selected invites")
    def revoke_selected(self, request, queryset):
        revoked = 0
        for invite in queryset.filter(status=Invite.Status.PENDING):
            invite.status = Invite.Status.REVOKED
            invite.save(update_fields=("status", "updated_at"))
            write_audit_event(
                actor=request.user, action="invite.revoked", entity=invite,
            )
            revoked += 1
        skipped = queryset.exclude(status=Invite.Status.PENDING).count()
        messages.success(request, f"Revoked {revoked} invite(s).")
        if skipped:
            messages.warning(request, f"Skipped {skipped} non-pending invite(s).")

    @admin.action(description="Resend selected invites (rotates token, extends expiry by 7 days)")
    def resend_selected(self, request, queryset):
        for invite in queryset.filter(status=Invite.Status.PENDING):
            old_expiry = invite.expires_at
            raw, hashed = issue_token()
            invite.token_hash = hashed
            invite.expires_at = timezone.now() + timedelta(days=7)
            invite.save(update_fields=("token_hash", "expires_at", "updated_at"))
            url = request.build_absolute_uri(f"/accept-invite/{raw}/")
            messages.success(
                request,
                format_html(
                    "{}: <code>{}</code> &mdash; copy now, will not be shown again.",
                    invite.email, url,
                ),
            )
            write_audit_event(
                actor=request.user, action="invite.resent", entity=invite,
                metadata={
                    "old_expires_at": old_expiry.isoformat(),
                    "new_expires_at": invite.expires_at.isoformat(),
                },
            )

        skipped = queryset.exclude(status=Invite.Status.PENDING).count()
        if skipped:
            messages.warning(request, f"Skipped {skipped} non-pending invite(s).")
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/admin.py backend/invites/tests/admin/invite_admin_test.py
git commit -m "feat(invites): admin revoke + resend bulk actions with one-time URL flash"
```

---

### Task 6.4: Delete audit hook

**Files:**
- Modify: `backend/invites/admin.py`
- Modify: `backend/invites/tests/admin/invite_admin_test.py`

- [ ] **Step 1: Extend the test**

```python
@pytest.mark.django_db
def test_delete_writes_audit_with_email_and_status_snapshot(client, superuser):
    inv = Invite.objects.create(
        email="a@x.com", token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        status=Invite.Status.PENDING, created_by=superuser,
    )
    client.force_login(superuser)
    client.post(
        reverse("admin:invites_invite_delete", args=[inv.pk]),
        {"post": "yes"}, follow=True,
    )
    assert not Invite.objects.filter(pk=inv.pk).exists()
    audit = AuditEvent.objects.get(action="invite.deleted")
    assert audit.metadata == {"email": "a@x.com", "status": "pending"}
```

- [ ] **Step 2: Run test, expect failure**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py::test_delete_writes_audit_with_email_and_status_snapshot -v`
Expected: failure (no `delete_model` override).

- [ ] **Step 3: Override `delete_model` and `delete_queryset`**

```python
    def _audit_delete(self, request, invite: Invite) -> None:
        write_audit_event(
            actor=request.user, action="invite.deleted",
            entity=invite,
            metadata={"email": invite.email, "status": invite.status},
        )

    def delete_model(self, request, obj: Invite) -> None:
        self._audit_delete(request, obj)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset) -> None:
        for invite in queryset:
            self._audit_delete(request, invite)
        super().delete_queryset(request, queryset)
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/invites/tests/admin/invite_admin_test.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/invites/admin.py backend/invites/tests/admin/invite_admin_test.py
git commit -m "feat(invites): admin delete writes invite.deleted audit with snapshot"
```

---

## Phase 7 — Frontend

### Task 7.1: Add `marked` dependency + sanitised markdown wrapper

**Files:**
- Modify: `frontend/package.json` (add `marked@^12`, optionally `dompurify@^3` for HTML sanitisation)
- Create: `frontend/src/lib/markdown.ts`
- Create: `frontend/src/lib/markdown.test.ts`

- [ ] **Step 1: Install the dep**

```bash
(cd frontend && npm install marked@^12 dompurify@^3 && npm install --save-dev @types/dompurify)
```

Expected: `package.json` and `package-lock.json` updated. `node_modules/marked/` exists.

- [ ] **Step 2: Write the failing test**

```ts
// frontend/src/lib/markdown.test.ts
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders headings and paragraphs", () => {
    const html = renderMarkdown("# Hi\n\nbody");
    expect(html).toContain("<h1>");
    expect(html).toContain("<p>");
  });

  it("strips raw <script> tags", () => {
    const html = renderMarkdown("safe\n\n<script>alert(1)</script>");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("strips javascript: URLs", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });
});
```

- [ ] **Step 3: Run test, expect failure**

Run: `(cd frontend && npx vitest run src/lib/markdown.test.ts)`
Expected: fails — `renderMarkdown` not exported.

- [ ] **Step 4: Write `frontend/src/lib/markdown.ts`**

```ts
import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/[^/]?)/i,
  });
}
```

- [ ] **Step 5: Run test + commit**

```bash
(cd frontend && npx vitest run src/lib/markdown.test.ts)
```

Expected: 3 passed.

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/markdown.ts frontend/src/lib/markdown.test.ts
git commit -m "feat(frontend): add sanitised markdown renderer wrapper"
```

---

### Task 7.2: Invite TanStack Query hooks

**Files:**
- Create: `frontend/src/lib/inviteHooks.ts`
- Create: `frontend/src/lib/inviteHooks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/inviteHooks.test.ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAcceptPassword, useInvitePreflight, useOauthStart } from "./inviteHooks";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/invites/abc/")) {
        return new Response(JSON.stringify({ email: "alice@x.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/invites/abc/accept-password/")) {
        return new Response(JSON.stringify({ next: "/2fa/setup" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/invites/abc/oauth-start/")) {
        return new Response(JSON.stringify({ redirect_url: "/accounts/google/login/" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("useInvitePreflight", () => {
  it("fetches preflight payload", async () => {
    const { result } = renderHook(() => useInvitePreflight("abc"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data?.email).toBe("alice@x.com"));
  });
});

describe("useAcceptPassword", () => {
  it("posts and resolves with next path", async () => {
    const { result } = renderHook(() => useAcceptPassword("abc"), { wrapper: wrap() });
    let value: { next: string } | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        password: "Sup3r-Secret-Pw!",
        workspace_name: "WS",
        terms_version_id: 1,
      });
    });
    expect(value?.next).toBe("/2fa/setup");
  });
});

describe("useOauthStart", () => {
  it("posts and resolves with redirect URL", async () => {
    const { result } = renderHook(() => useOauthStart("abc"), { wrapper: wrap() });
    let value: { redirect_url: string } | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        provider: "google",
        workspace_name: "WS",
        terms_version_id: 1,
      });
    });
    expect(value?.redirect_url).toBe("/accounts/google/login/");
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `(cd frontend && npx vitest run src/lib/inviteHooks.test.ts)`
Expected: fails — module not found.

- [ ] **Step 3: Write `frontend/src/lib/inviteHooks.ts`**

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface InvitePreflight {
  email: string;
  expires_at: string;
  providers: ("google" | "github")[];
  terms_version: { id: number; version: string; body_markdown: string } | null;
}

export interface AcceptPasswordPayload {
  password: string;
  workspace_name: string;
  terms_version_id: number;
}

export interface OauthStartPayload {
  provider: "google" | "github";
  workspace_name: string;
  terms_version_id: number;
}

export function useInvitePreflight(token: string) {
  return useQuery<InvitePreflight>({
    queryKey: ["invite", token],
    queryFn: () => apiFetch<InvitePreflight>(`/api/invites/${token}/`),
    retry: false,
  });
}

export function useAcceptPassword(token: string) {
  return useMutation<{ next: string }, Error, AcceptPasswordPayload>({
    mutationFn: (body) =>
      apiFetch<{ next: string }>(`/api/invites/${token}/accept-password/`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useOauthStart(token: string) {
  return useMutation<{ redirect_url: string }, Error, OauthStartPayload>({
    mutationFn: (body) =>
      apiFetch<{ redirect_url: string }>(`/api/invites/${token}/oauth-start/`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `(cd frontend && npx vitest run src/lib/inviteHooks.test.ts)`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/inviteHooks.ts frontend/src/lib/inviteHooks.test.ts
git commit -m "feat(frontend): TanStack Query hooks for invite endpoints"
```

---

### Task 7.3: TestId additions

**Files:**
- Modify: `frontend/src/testIds.ts`
- Modify: `e2e/support/selectors.ts` (mirror)

- [ ] **Step 1: Add invite TestIds**

In `frontend/src/testIds.ts`, append before the closing `} as const;`:

```ts
  ACCEPT_INVITE_PAGE: "accept-invite-page",
  ACCEPT_INVITE_EMAIL: "accept-invite-email",
  ACCEPT_INVITE_WORKSPACE: "accept-invite-workspace",
  ACCEPT_INVITE_PASSWORD: "accept-invite-password",
  ACCEPT_INVITE_TOS_BODY: "accept-invite-tos-body",
  ACCEPT_INVITE_TOS_SCROLL: "accept-invite-tos-scroll",
  ACCEPT_INVITE_TOS_CHECKBOX: "accept-invite-tos-checkbox",
  ACCEPT_INVITE_TOS_CAPTION: "accept-invite-tos-caption",
  ACCEPT_INVITE_SUBMIT: "accept-invite-submit",
  ACCEPT_INVITE_GOOGLE: "accept-invite-google",
  ACCEPT_INVITE_GITHUB: "accept-invite-github",
  ACCEPT_INVITE_ERROR_BANNER: "accept-invite-error-banner",
  ACCEPT_INVITE_FIELD_ERROR: "accept-invite-field-error",
  ACCEPT_INVITE_INVALID: "accept-invite-invalid",
  ACCEPT_INVITE_EXPIRED: "accept-invite-expired",
  ACCEPT_INVITE_REVOKED: "accept-invite-revoked",
  ACCEPT_INVITE_ALREADY_USED: "accept-invite-already-used",
  LOGIN_GOOGLE: "login-google",
  LOGIN_GITHUB: "login-github",
  LOGIN_NO_ACCOUNT_BANNER: "login-no-account-banner",
  LANDING_REQUEST_INVITE: "landing-request-invite",
```

- [ ] **Step 2: Mirror to e2e**

Look at `e2e/support/selectors.ts`. Add the same string-constant rows (mirror format used in that file). Run `(cd frontend && npx tsc --noEmit)` to confirm typing still passes.

- [ ] **Step 3: No tests yet — commit**

```bash
git add frontend/src/testIds.ts e2e/support/selectors.ts
git commit -m "chore(frontend,e2e): add invite + OAuth TestIds"
```

---

### Task 7.4: `AcceptInvite` shell — preflight + error variants + route

**Files:**
- Create: `frontend/src/screens/AcceptInvite.tsx`
- Create: `frontend/src/screens/AcceptInvite.test.tsx`
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Write the failing tests (preflight states only)**

```tsx
// frontend/src/screens/AcceptInvite.test.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestIds } from "../testIds";
import { AcceptInvite } from "./AcceptInvite";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

function mockResponse(status: number, body: unknown) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("AcceptInvite preflight states", () => {
  it("renders the form when preflight returns 200", async () => {
    mockResponse(200, {
      email: "alice@x.com",
      expires_at: "2030-01-01T00:00:00Z",
      providers: ["google", "github"],
      terms_version: { id: 1, version: "1.0", body_markdown: "# ToS\n\nbody" },
    });
    renderAt("/accept-invite/tok123");
    expect(await screen.findByTestId(TestIds.ACCEPT_INVITE_PAGE)).toBeInTheDocument();
    expect(screen.getByTestId(TestIds.ACCEPT_INVITE_EMAIL)).toHaveTextContent("alice@x.com");
  });

  it("renders invalid screen on 404", async () => {
    mockResponse(404, { error: "invalid_token" });
    renderAt("/accept-invite/bogus");
    expect(await screen.findByTestId(TestIds.ACCEPT_INVITE_INVALID)).toBeInTheDocument();
  });

  it("renders expired screen on 410 expired", async () => {
    mockResponse(410, { error: "expired", expires_at: "2020-01-01T00:00:00Z" });
    renderAt("/accept-invite/expired");
    expect(await screen.findByTestId(TestIds.ACCEPT_INVITE_EXPIRED)).toBeInTheDocument();
  });

  it("renders revoked screen on 410 revoked", async () => {
    mockResponse(410, { error: "revoked" });
    renderAt("/accept-invite/rev");
    expect(await screen.findByTestId(TestIds.ACCEPT_INVITE_REVOKED)).toBeInTheDocument();
  });

  it("renders already-used screen on 410 already_used", async () => {
    mockResponse(410, { error: "already_used" });
    renderAt("/accept-invite/used");
    expect(await screen.findByTestId(TestIds.ACCEPT_INVITE_ALREADY_USED)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `(cd frontend && npx vitest run src/screens/AcceptInvite.test.tsx)`
Expected: fails — module not found.

- [ ] **Step 3: Write `frontend/src/screens/AcceptInvite.tsx` (shell only — form added in next task)**

```tsx
import { useParams } from "react-router";
import { ApiError } from "../lib/api";
import { useInvitePreflight } from "../lib/inviteHooks";
import { TestIds } from "../testIds";
import lockup from "../assets/brand/lockup.svg";

function ErrorScreen({ testId, title, body }: { testId: string; title: string; body: string }) {
  return (
    <main data-testid={testId} className="min-h-full flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <img src={lockup} alt="Slotflow" height={22} className="mx-auto mb-8" />
        <h1 className="text-[24px] font-semibold text-ink mb-3">{title}</h1>
        <p className="text-ink-secondary">{body}</p>
      </div>
    </main>
  );
}

export function AcceptInvite() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, error, isLoading } = useInvitePreflight(token);

  if (isLoading) return <div className="px-8 py-12 text-ink-secondary">Loading invite…</div>;

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
      const reason = (error.message || "").toLowerCase();
      if (reason.includes("revoke")) {
        return (
          <ErrorScreen
            testId={TestIds.ACCEPT_INVITE_REVOKED}
            title="Invite revoked"
            body="This invite has been revoked. Contact your administrator to request a new one."
          />
        );
      }
      if (reason.includes("already") || reason.includes("used")) {
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

  if (!data) return null;

  return (
    <main data-testid={TestIds.ACCEPT_INVITE_PAGE} className="min-h-full grid grid-cols-1 md:grid-cols-2">
      <section className="flex flex-col justify-center px-8 md:px-16 py-12">
        <img src={lockup} alt="Slotflow" height={22} className="mb-12" />
        <h1 className="text-[32px] font-semibold tracking-[-0.64px] text-ink mb-3">
          You're invited to Slotflow
        </h1>
        <p className="text-ink-secondary mb-2">Email:</p>
        <p data-testid={TestIds.ACCEPT_INVITE_EMAIL} className="text-ink mb-6">
          {data.email}
        </p>
        {/* Form added in Task 7.5 */}
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
```

- [ ] **Step 4: Register the route**

In `frontend/src/router.tsx`, add the import:

```tsx
import { AcceptInvite } from "./screens/AcceptInvite";
```

And insert into the `routes` array next to `/login`:

```tsx
  { path: "/accept-invite/:token", element: <AcceptInvite /> },
```

- [ ] **Step 5: Run tests + commit**

```bash
(cd frontend && npx vitest run src/screens/AcceptInvite.test.tsx)
```

Expected: 5 passed.

```bash
git add frontend/src/screens/AcceptInvite.tsx frontend/src/screens/AcceptInvite.test.tsx frontend/src/router.tsx
git commit -m "feat(frontend): AcceptInvite shell + preflight error variants + route"
```

---

### Task 7.5: AcceptInvite form — workspace + password + ToS scroll gate

**Files:**
- Modify: `frontend/src/screens/AcceptInvite.tsx`
- Modify: `frontend/src/screens/AcceptInvite.test.tsx`

- [ ] **Step 1: Extend the test**

Append:

```tsx
import { fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

function preflightOnce() {
  mockResponse(200, {
    email: "alice@x.com",
    expires_at: "2030-01-01T00:00:00Z",
    providers: ["google", "github"],
    terms_version: { id: 7, version: "1.0", body_markdown: "# ToS\n\nLorem ipsum.\n" },
  });
}

describe("AcceptInvite form", () => {
  it("defaults workspace name to '<local>'s workspace'", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok");
    const ws = (await screen.findByTestId(TestIds.ACCEPT_INVITE_WORKSPACE)) as HTMLInputElement;
    expect(ws.value).toBe("alice's workspace");
  });

  it("disables submit until ToS scrolled and submits payload to accept-password", async () => {
    preflightOnce();
    mockResponse(200, { next: "/2fa/setup" });

    renderAt("/accept-invite/tok");
    const submit = await screen.findByTestId<HTMLButtonElement>(TestIds.ACCEPT_INVITE_SUBMIT);
    expect(submit).toBeDisabled();

    // Force scrollHeight/clientHeight properties so the test environment can
    // reach the scroll-to-bottom branch.
    const scroll = screen.getByTestId(TestIds.ACCEPT_INVITE_TOS_SCROLL);
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 200 });
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(scroll, "scrollTop", { configurable: true, writable: true, value: 0 });
    fireEvent.scroll(scroll, { target: { scrollTop: 100 } });

    const checkbox = screen.getByTestId<HTMLInputElement>(TestIds.ACCEPT_INVITE_TOS_CHECKBOX);
    await waitFor(() => expect(checkbox).not.toBeDisabled());

    const user = userEvent.setup();
    await user.click(checkbox);
    await user.type(
      screen.getByTestId(TestIds.ACCEPT_INVITE_PASSWORD),
      "Sup3r-Secret-Pw!",
    );

    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const post = calls.find((c) => String(c[0]).endsWith("/accept-password/"));
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toEqual({
        password: "Sup3r-Secret-Pw!",
        workspace_name: "alice's workspace",
        terms_version_id: 7,
      });
    });
  });

  it("auto-enables ToS checkbox if body shorter than container", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok");
    const scroll = await screen.findByTestId(TestIds.ACCEPT_INVITE_TOS_SCROLL);
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 50 });
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 100 });
    // Trigger the layout-effect calculation by dispatching a resize.
    fireEvent.scroll(scroll);
    const checkbox = screen.getByTestId<HTMLInputElement>(TestIds.ACCEPT_INVITE_TOS_CHECKBOX);
    await waitFor(() => expect(checkbox).not.toBeDisabled());
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `(cd frontend && npx vitest run src/screens/AcceptInvite.test.tsx)`
Expected: new tests fail (form not implemented).

- [ ] **Step 3: Replace the rendered form section in `AcceptInvite.tsx`**

Replace the `{/* Form added in Task 7.5 */}` placeholder (and the surrounding `<section>` body) with the full form. Update the file to:

```tsx
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiError } from "../lib/api";
import { useAcceptPassword, useInvitePreflight } from "../lib/inviteHooks";
import { renderMarkdown } from "../lib/markdown";
import { TestIds } from "../testIds";
import lockup from "../assets/brand/lockup.svg";

// ... ErrorScreen unchanged from Task 7.4 ...

function defaultWorkspaceName(email: string): string {
  const local = (email.split("@")[0] || "").toLowerCase();
  return local ? `${local}'s workspace` : "my workspace";
}

export function AcceptInvite() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, error, isLoading } = useInvitePreflight(token);
  const navigate = useNavigate();

  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [hasReadToS, setHasReadToS] = useState(false);
  const [tosAgreed, setTosAgreed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const accept = useAcceptPassword(token);

  useEffect(() => {
    if (data?.email) setWorkspaceName(defaultWorkspaceName(data.email));
  }, [data?.email]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) setHasReadToS(true);
  }, [data?.terms_version?.body_markdown]);

  const tosHtml = useMemo(
    () => (data?.terms_version ? renderMarkdown(data.terms_version.body_markdown) : ""),
    [data?.terms_version],
  );

  if (isLoading) return <div className="px-8 py-12 text-ink-secondary">Loading invite…</div>;

  if (error instanceof ApiError) {
    // ... unchanged error-screen branches from Task 7.4 ...
  }
  if (!data || !data.terms_version) return null;
  const terms = data.terms_version;

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setHasReadToS(true);
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
      if (err instanceof ApiError && err.status === 422) {
        // Server returns {field: ["msg"]} — surface inline.
        try {
          const data = JSON.parse(err.message);
          if (data && typeof data === "object") setFieldErrors(data);
        } catch {
          setFieldErrors({ password: [err.message] });
        }
        return;
      }
      setFieldErrors({ password: [err instanceof Error ? err.message : "Sign-up failed."] });
    }
  }

  const submitDisabled = !hasReadToS || !tosAgreed || !password || accept.isPending;

  return (
    <main data-testid={TestIds.ACCEPT_INVITE_PAGE} className="min-h-full grid grid-cols-1 md:grid-cols-2">
      <section className="flex flex-col justify-center px-8 md:px-16 py-12">
        <img src={lockup} alt="Slotflow" height={22} className="mb-12" />
        <h1 className="text-[32px] font-semibold tracking-[-0.64px] text-ink mb-3">
          You're invited to Slotflow
        </h1>
        <p className="text-ink-secondary mb-2">Email:</p>
        <p data-testid={TestIds.ACCEPT_INVITE_EMAIL} className="text-ink mb-6">
          {data.email}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <label className="block">
            <span className="text-sm text-ink-secondary mb-1 block">Workspace name</span>
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

          {/* OAuth buttons added in Task 7.6 */}

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
```

Notes for the engineer:
- `apiFetch` throws an `ApiError` with `message=string`. The 422 body comes through as the JSON-stringified field-errors map; `JSON.parse(err.message)` recovers it. If `apiFetch` ever changes to surface `body` directly, simplify here.
- The `prose` class is from the existing tailwind preset (used elsewhere for markdown). If unavailable, swap for plain typography classes.

- [ ] **Step 4: Run tests, expect pass**

Run: `(cd frontend && npx vitest run src/screens/AcceptInvite.test.tsx)`
Expected: 8 passed (5 from Task 7.4 + 3 form tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/AcceptInvite.tsx frontend/src/screens/AcceptInvite.test.tsx
git commit -m "feat(frontend): AcceptInvite form (workspace + password + ToS scroll gate)"
```

---

### Task 7.6: AcceptInvite OAuth buttons + error banners

**Files:**
- Modify: `frontend/src/screens/AcceptInvite.tsx`
- Modify: `frontend/src/screens/AcceptInvite.test.tsx`

- [ ] **Step 1: Extend the test**

```tsx
describe("AcceptInvite OAuth", () => {
  it("clicking Google triggers oauth-start and redirects window", async () => {
    preflightOnce();
    mockResponse(200, { redirect_url: "/accounts/google/login/" });

    const original = window.location;
    delete (window as unknown as { location: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: "" };

    renderAt("/accept-invite/tok");
    const googleBtn = await screen.findByTestId(TestIds.ACCEPT_INVITE_GOOGLE);
    await userEvent.setup().click(googleBtn);
    await waitFor(() => expect(window.location.href).toBe("/accounts/google/login/"));

    (window as unknown as { location: typeof original }).location = original;
  });

  it("renders email_mismatch banner from query string", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok?error=email_mismatch");
    const banner = await screen.findByTestId(TestIds.ACCEPT_INVITE_ERROR_BANNER);
    expect(banner).toHaveTextContent(/oauth email did not match/i);
  });

  it("renders user_exists banner from query string", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok?error=user_exists");
    const banner = await screen.findByTestId(TestIds.ACCEPT_INVITE_ERROR_BANNER);
    expect(banner).toHaveTextContent(/account already exists/i);
  });

  it("renders oauth_failed banner from query string", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok?error=oauth_failed");
    const banner = await screen.findByTestId(TestIds.ACCEPT_INVITE_ERROR_BANNER);
    expect(banner).toHaveTextContent(/sign-in cancelled or failed/i);
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `(cd frontend && npx vitest run src/screens/AcceptInvite.test.tsx)`
Expected: 4 new failures.

- [ ] **Step 3: Add OAuth buttons + banner to `AcceptInvite.tsx`**

Add at top:

```tsx
import { useSearchParams } from "react-router";
import { useOauthStart } from "../lib/inviteHooks";
```

Inside `AcceptInvite`, near the top of the function body:

```tsx
  const oauthStart = useOauthStart(token);
  const [searchParams] = useSearchParams();
  const errorCode = searchParams.get("error");
```

Helper above the return:

```tsx
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

  async function startOauth(provider: "google" | "github") {
    try {
      const result = await oauthStart.mutateAsync({
        provider,
        workspace_name: workspaceName,
        terms_version_id: terms.id,
      });
      window.location.href = result.redirect_url;
    } catch {
      // Errors surface as banner via re-render of the page after backend redirect.
    }
  }
```

Replace the `{/* OAuth buttons added in Task 7.6 */}` placeholder with:

```tsx
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => startOauth("google")}
              data-testid={TestIds.ACCEPT_INVITE_GOOGLE}
              disabled={oauthStart.isPending || !tosAgreed || !hasReadToS}
              className="w-full border border-border-subtle rounded-md py-2 text-ink hover:bg-surface-card disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => startOauth("github")}
              data-testid={TestIds.ACCEPT_INVITE_GITHUB}
              disabled={oauthStart.isPending || !tosAgreed || !hasReadToS}
              className="w-full border border-border-subtle rounded-md py-2 text-ink hover:bg-surface-card disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Continue with GitHub
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border-subtle" />
            <span className="text-xs text-ink-muted uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border-subtle" />
          </div>
```

And insert the error banner immediately after the `<h1>` heading:

```tsx
        {(() => {
          const text = bannerText(errorCode);
          return text ? (
            <p
              role="alert"
              data-testid={TestIds.ACCEPT_INVITE_ERROR_BANNER}
              className="mb-6 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {text}
            </p>
          ) : null;
        })()}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `(cd frontend && npx vitest run src/screens/AcceptInvite.test.tsx)`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/AcceptInvite.tsx frontend/src/screens/AcceptInvite.test.tsx
git commit -m "feat(frontend): AcceptInvite OAuth buttons + error banner"
```

---

### Task 7.7: Login.tsx — enable OAuth buttons + no_account banner

**Files:**
- Modify: `frontend/src/screens/Login.tsx`
- Modify: `frontend/src/screens/Login.test.tsx`

- [ ] **Step 1: Update tests**

Replace the existing assertions that expect the buttons to be disabled. Search the test file for `disabled` and update those to:

```tsx
expect(screen.getByRole("button", { name: /continue with google/i })).not.toBeDisabled();
expect(screen.getByRole("button", { name: /continue with github/i })).not.toBeDisabled();
```

Add a new test:

```tsx
import { MemoryRouter, Route, Routes } from "react-router";
import { TestIds } from "../testIds";

it("renders no_account banner when ?error=no_account", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/login?error=no_account"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByTestId(TestIds.LOGIN_NO_ACCOUNT_BANNER)).toHaveTextContent(/account not found/i);
});

it("clicking Google sets window.location.href to /accounts/google/login/", async () => {
  const original = window.location;
  delete (window as unknown as { location: unknown }).location;
  (window as unknown as { location: { href: string } }).location = { href: "" };

  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.setup().click(screen.getByTestId(TestIds.LOGIN_GOOGLE));
  expect(window.location.href).toBe("/accounts/google/login/");

  (window as unknown as { location: typeof original }).location = original;
});
```

- [ ] **Step 2: Run tests, expect failures**

Run: `(cd frontend && npx vitest run src/screens/Login.test.tsx)`
Expected: failures.

- [ ] **Step 3: Update `frontend/src/screens/Login.tsx`**

Replace the existing OAuth button block with:

```tsx
        <div className="space-y-3 mb-6">
          <button
            type="button"
            onClick={() => { window.location.href = "/accounts/google/login/"; }}
            data-testid={TestIds.LOGIN_GOOGLE}
            aria-label="Continue with Google"
            className="w-full border border-border-subtle rounded-md py-2 text-ink hover:bg-surface-card"
          >
            Continue with Google
          </button>
          <button
            type="button"
            onClick={() => { window.location.href = "/accounts/github/login/"; }}
            data-testid={TestIds.LOGIN_GITHUB}
            aria-label="Continue with GitHub"
            className="w-full border border-border-subtle rounded-md py-2 text-ink hover:bg-surface-card"
          >
            Continue with GitHub
          </button>
        </div>
```

Add a `useSearchParams` reading near the top of `Login`:

```tsx
import { useSearchParams } from "react-router";

// inside component:
const [searchParams] = useSearchParams();
const errorCode = searchParams.get("error");
const noAccountBanner = errorCode === "no_account";
```

And render before the form:

```tsx
{noAccountBanner && (
  <p
    role="alert"
    data-testid={TestIds.LOGIN_NO_ACCOUNT_BANNER}
    className="mb-6 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
  >
    Account not found. You need an invite to sign up.
  </p>
)}
```

(Also add the `oauth_failed` variant if you want — same banner, message "Sign-in cancelled or failed. Try again." Update the test accordingly.)

- [ ] **Step 4: Run tests, expect pass**

```bash
(cd frontend && npx vitest run src/screens/Login.test.tsx)
```

Expected: all pass (existing tests + new ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/Login.tsx frontend/src/screens/Login.test.tsx
git commit -m "feat(frontend): wire Google/GitHub login buttons + no_account error banner"
```

---

### Task 7.8: Landing.tsx — "Request invite" mailto

**Files:**
- Modify: `frontend/src/screens/Landing.tsx`
- Modify: `frontend/src/screens/Landing.test.tsx`

- [ ] **Step 1: Update test**

```tsx
it("Request-invite link is a mailto", () => {
  render(/* ... existing wrapper ... */);
  const link = screen.getByTestId(TestIds.LANDING_REQUEST_INVITE);
  expect(link).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
  expect(link).toHaveTextContent(/request invite/i);
});
```

Remove or update any existing test that asserts a `/login?signup=1` href.

- [ ] **Step 2: Run, expect failure**

Run: `(cd frontend && npx vitest run src/screens/Landing.test.tsx)`
Expected: failure.

- [ ] **Step 3: Update `frontend/src/screens/Landing.tsx`**

Replace the `<a href="/login?signup=1">…</a>` on line 39 with:

```tsx
<a
  href="mailto:hello@slotflow.app?subject=Slotflow%20invite%20request"
  data-testid={TestIds.LANDING_REQUEST_INVITE}
  className="..."  // keep existing classes
>
  Request invite
</a>
```

- [ ] **Step 4: Run tests, expect pass**

Run: `(cd frontend && npx vitest run src/screens/Landing.test.tsx)`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/Landing.tsx frontend/src/screens/Landing.test.tsx
git commit -m "feat(frontend): Landing 'Get started' becomes 'Request invite' (mailto)"
```

---

## Phase 8 — E2E

### Task 8.1: Extend `seed_e2e_user` to seed `TermsVersion`

**Files:**
- Modify: `backend/core/management/commands/seed_e2e_user.py`
- Modify: `backend/core/tests/services/seed_e2e_user_test.py`

- [ ] **Step 1: Extend the test**

```python
@pytest.mark.django_db
def test_seed_e2e_user_creates_terms_version(settings):
    settings.DEBUG = True
    from io import StringIO
    from django.core.management import call_command
    from core.models import TermsVersion

    out = StringIO()
    call_command("seed_e2e_user", stdout=out)
    assert TermsVersion.current() is not None
```

- [ ] **Step 2: Run, expect failure**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/services/seed_e2e_user_test.py -v`
Expected: failure (no TermsVersion seeded).

- [ ] **Step 3: Extend `seed_e2e_user.py`**

Append at the bottom of `handle`:

```python
        from core.models import TermsVersion
        terms_path = settings.BASE_DIR.parent / "docs" / "legal" / "terms-v0.1.0.md"
        body = terms_path.read_text(encoding="utf-8") if terms_path.exists() else "Placeholder"
        from django.utils import timezone
        TermsVersion.objects.update_or_create(
            version="0.1.0-draft",
            defaults={"body": body, "effective_at": timezone.now()},
        )
        self.stdout.write(self.style.SUCCESS("Seeded TermsVersion 0.1.0-draft."))
```

(Adjust the existing `from django.conf import settings` import — already present.)

- [ ] **Step 4: Run, commit**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/services/seed_e2e_user_test.py -v`
Expected: pass.

```bash
git add backend/core/management/commands/seed_e2e_user.py backend/core/tests/services/seed_e2e_user_test.py
git commit -m "feat(core): seed_e2e_user also seeds current TermsVersion"
```

---

### Task 8.2: `/api/test/_seed_invite/` endpoint (DEBUG + bypass-gated)

**Files:**
- Modify: `backend/core/api_test_reset.py`
- Create: `backend/core/tests/api/seed_invite_test.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/core/tests/api/seed_invite_test.py
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from core.auth_bypass import is_2fa_bypass_active
from invites.models import Invite


@pytest.fixture
def bypass_active(settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.setenv("SLOTFLOW_BYPASS_2FA", "1")
    assert is_2fa_bypass_active()


@pytest.mark.django_db
def test_seed_invite_creates_pending_by_default(bypass_active):
    client = APIClient()
    resp = client.post(
        "/api/test/_seed_invite/", {"email": "alice@x.com"}, format="json",
    )
    assert resp.status_code == 200, resp.content
    body = resp.json()
    assert body["email"] == "alice@x.com"
    assert body["raw_token"]
    assert body["accept_url"].endswith(f"/accept-invite/{body['raw_token']}/")

    inv = Invite.objects.get(email="alice@x.com")
    assert inv.status == Invite.Status.PENDING


@pytest.mark.django_db
def test_seed_invite_status_param_creates_revoked(bypass_active):
    client = APIClient()
    resp = client.post(
        "/api/test/_seed_invite/",
        {"email": "alice@x.com", "status": "revoked"}, format="json",
    )
    assert resp.status_code == 200
    inv = Invite.objects.get(email="alice@x.com")
    assert inv.status == Invite.Status.REVOKED


@pytest.mark.django_db
def test_seed_invite_expired_param_sets_past_expiry(bypass_active):
    client = APIClient()
    resp = client.post(
        "/api/test/_seed_invite/",
        {"email": "alice@x.com", "expired": True}, format="json",
    )
    assert resp.status_code == 200
    inv = Invite.objects.get(email="alice@x.com")
    assert inv.is_expired


@pytest.mark.django_db
def test_seed_invite_404_when_bypass_inactive(settings):
    settings.DEBUG = False  # bypass cannot activate
    client = APIClient()
    resp = client.post("/api/test/_seed_invite/", {"email": "x@x.com"}, format="json")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run, expect failures**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/api/seed_invite_test.py -v`
Expected: 4 failures (URL not registered).

- [ ] **Step 3: Add the view**

In `backend/core/api_test_reset.py` add:

```python
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny

from invites.models import Invite
from invites.services.tokens import issue_token


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def seed_invite_view(request):
    if not is_2fa_bypass_active():
        from django.http import Http404
        raise Http404

    email = (request.data.get("email") or "").strip()
    status = request.data.get("status") or "pending"
    expired = bool(request.data.get("expired"))

    User = get_user_model()
    admin, _ = User.objects.get_or_create(
        username="e2e-admin", defaults={"email": "e2e-admin@slotflow.test", "is_superuser": True, "is_staff": True},
    )
    raw, hashed = issue_token()
    expires_at = timezone.now() + (timedelta(seconds=-1) if expired else timedelta(days=7))
    inv = Invite.objects.create(
        email=email, token_hash=hashed,
        expires_at=expires_at,
        status=Invite.Status(status),
        created_by=admin,
    )
    return Response({
        "email": inv.email,
        "raw_token": raw,
        "accept_url": request.build_absolute_uri(f"/accept-invite/{raw}/"),
    })
```

Update `api_test_patterns` in the same file:

```python
api_test_patterns = [
    path("_reset/", reset_view, name="api_test_reset"),
    path("_seed_invite/", seed_invite_view, name="api_test_seed_invite"),
]
```

Update `Require2FAMiddleware` allowlist to include the new path:

```python
            or path in (
                "/api/test/_reset", "/api/test/_reset/",
                "/api/test/_seed_invite", "/api/test/_seed_invite/",
            )
```

- [ ] **Step 4: Run tests, expect pass**

Run: `backend/.venv/bin/python -m pytest backend/core/tests/api/seed_invite_test.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/core/api_test_reset.py backend/core/middleware/require_2fa.py backend/core/tests/api/seed_invite_test.py
git commit -m "feat(core): add /api/test/_seed_invite/ for e2e fixtures"
```

---

### Task 8.3: e2e support helpers

**Files:**
- Create: `e2e/support/invites.ts`

- [ ] **Step 1: Write the helper**

```ts
// e2e/support/invites.ts
import type { APIRequestContext } from "@playwright/test";

export interface SeededInvite {
  email: string;
  raw_token: string;
  accept_url: string;
}

export async function seedInvite(
  request: APIRequestContext,
  payload: { email: string; status?: "pending" | "revoked"; expired?: boolean } = { email: "alice@x.com" },
): Promise<SeededInvite> {
  const response = await request.post("/api/test/_seed_invite/", { data: payload });
  if (!response.ok()) {
    throw new Error(`seedInvite failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as SeededInvite;
}
```

- [ ] **Step 2: Commit (no test — exercised by the specs in 8.4-8.6)**

```bash
git add e2e/support/invites.ts
git commit -m "test(e2e): seedInvite helper hits backend test endpoint"
```

---

### Task 8.4: e2e `invite-password.spec.ts`

**Files:**
- Create: `e2e/tests/invite-password.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/tests/invite-password.spec.ts
import { expect, test } from "@playwright/test";
import { TestIds } from "../support/selectors";
import { resetDb } from "../support/api";
import { seedInvite } from "../support/invites";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("invitee accepts via password and lands on /2fa/setup", async ({ page, request }) => {
  const invite = await seedInvite(request, { email: "alice@x.com" });

  await page.goto(invite.accept_url);
  await expect(page.getByTestId(TestIds.ACCEPT_INVITE_PAGE)).toBeVisible();
  await expect(page.getByTestId(TestIds.ACCEPT_INVITE_EMAIL)).toHaveText("alice@x.com");

  // Scroll the ToS body to the bottom to enable the checkbox.
  const scrollEl = page.getByTestId(TestIds.ACCEPT_INVITE_TOS_SCROLL);
  await scrollEl.evaluate((el) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight; });

  await page.getByTestId(TestIds.ACCEPT_INVITE_TOS_CHECKBOX).check();
  await page.getByTestId(TestIds.ACCEPT_INVITE_PASSWORD).fill("Sup3r-Secret-Pw!");
  await page.getByTestId(TestIds.ACCEPT_INVITE_SUBMIT).click();

  await expect(page).toHaveURL(/\/2fa\/setup/);
});
```

- [ ] **Step 2: Run the spec**

```bash
make test-e2e PLAYWRIGHT_FILTER=tests/invite-password.spec.ts
```

(If your `make test-e2e` target does not accept a filter, run from `e2e/`: `(cd e2e && npx playwright test tests/invite-password.spec.ts)`. The test runs against the dev server already configured in `e2e/playwright.config.ts`, which exports `SLOTFLOW_BYPASS_2FA=1`.)

Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/invite-password.spec.ts
git commit -m "test(e2e): invite-password happy path"
```

---

### Task 8.5: e2e `invite-expired.spec.ts`

**Files:**
- Create: `e2e/tests/invite-expired.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test";
import { TestIds } from "../support/selectors";
import { resetDb } from "../support/api";
import { seedInvite } from "../support/invites";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("expired invite renders Expired error variant", async ({ page, request }) => {
  const invite = await seedInvite(request, { email: "alice@x.com", expired: true });
  await page.goto(invite.accept_url);
  await expect(page.getByTestId(TestIds.ACCEPT_INVITE_EXPIRED)).toBeVisible();
});
```

- [ ] **Step 2: Run + commit**

```bash
(cd e2e && npx playwright test tests/invite-expired.spec.ts)
```

Expected: 1 passed.

```bash
git add e2e/tests/invite-expired.spec.ts
git commit -m "test(e2e): invite-expired renders error variant"
```

---

### Task 8.6: e2e `invite-revoked.spec.ts`

**Files:**
- Create: `e2e/tests/invite-revoked.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from "@playwright/test";
import { TestIds } from "../support/selectors";
import { resetDb } from "../support/api";
import { seedInvite } from "../support/invites";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("revoked invite renders Revoked error variant", async ({ page, request }) => {
  const invite = await seedInvite(request, { email: "alice@x.com", status: "revoked" });
  await page.goto(invite.accept_url);
  await expect(page.getByTestId(TestIds.ACCEPT_INVITE_REVOKED)).toBeVisible();
});
```

- [ ] **Step 2: Run + commit**

```bash
(cd e2e && npx playwright test tests/invite-revoked.spec.ts)
```

Expected: 1 passed.

```bash
git add e2e/tests/invite-revoked.spec.ts
git commit -m "test(e2e): invite-revoked renders error variant"
```

---

## Phase 9 — Docs

### Task 9.1: OAuth setup runbook

**Files:**
- Create: `docs/operations/oauth-setup.md`

- [ ] **Step 1: Write the runbook**

```markdown
# OAuth provider setup (Google + GitHub)

Slotflow uses django-allauth (`/accounts/<provider>/login/` + callback). Each environment needs its own client credentials registered in Django admin under `Sites and accounts → Social applications`.

## Google

1. Go to https://console.cloud.google.com/apis/credentials.
2. **Create credentials → OAuth client ID** → Application type **Web application**.
3. Authorized redirect URIs:
   - Local dev: `http://localhost:8000/accounts/google/login/callback/`
   - Staging: `https://staging.slotflow.app/accounts/google/login/callback/`
   - Production: `https://app.slotflow.app/accounts/google/login/callback/`
4. Copy the Client ID + Client Secret.
5. In Django admin, add a `Social application`:
   - Provider: `Google`
   - Name: `Google (env)`
   - Client id / Secret key: paste from step 4
   - Sites: select the matching `Site`
6. Verify by visiting `/accounts/google/login/` from a logged-out browser; you should land on Google's consent screen.

## GitHub

1. https://github.com/settings/developers → **New OAuth App**.
2. Authorization callback URL: same shape as Google but `/github/login/callback/`.
3. Generate a client secret. Copy ID + secret.
4. Add a Django `Social application` with provider `GitHub`.
5. Required scope is set in `SOCIALACCOUNT_PROVIDERS["github"]["SCOPE"]` already (`user:email`, `read:user`). The `read:user` scope is required so we can detect MFA via `GET /user`.

## Verifying MFA detection

- Google: an account with 2-Step Verification will return an ID token whose `amr` claim contains `"mfa"`. Confirm by signing in with such an account; the app should land on `/dashboard` rather than `/2fa/setup`.
- GitHub: with `read:user` granted, the `/user` endpoint exposes `two_factor_authentication: true` for accounts that have 2FA enabled. Same dashboard-vs-setup signal.

If MFA can't be detected for a session, the user is redirected to `/2fa/setup` and follows the standard TOTP enrolment.
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/oauth-setup.md
git commit -m "docs(operations): OAuth provider setup runbook"
```

---

## Final integration: Push branch + open PR

### Task 10.1: Run full CI locally

- [ ] **Step 1: Run lint + unit tests**

```bash
make lint
make test
```

Expected: all green.

- [ ] **Step 2: Run e2e**

```bash
make test-e2e
```

Expected: all green.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/invite-oauth-signup
```

Then `gh pr create` using the body template at `.github/WORKFLOW_TEMPLATES/pull_request.md`. Title: `feat: invite + OAuth signup (admin-issued, scrolled-ToS, MFA-aware 2FA gate)`.

Test plan section should include:

- `make test`
- `make test-e2e`
- Manual smoke: `make dev`, log into `/admin/`, create an invite, copy URL into incognito, complete password signup, land on `/2fa/setup`.
- Manual smoke: from `/login`, click Continue with Google → expect redirect to Google.
- Manual smoke: visit `/accept-invite/<bogus>/` → "Invalid invite link" screen.

---

## Self-review checklist

After executing all tasks, walk through this list before declaring the plan done:

- [ ] Every Q in the spec's "Decisions" table is honoured by at least one task or test.
- [ ] No task uses `# TODO`, `# implement later`, or "similar to Task N" placeholders.
- [ ] Every `Workspace`, `Membership`, `User`, `TermsVersion` reference uses real attribute names matching the model definitions in Phase 1.
- [ ] All migration filenames in commits match what `makemigrations` actually produced (the `00XX` placeholders in this plan are deliberate; replace at execution time).
- [ ] `Require2FAMiddleware` allowlist contains all `/api/invites/`, `/api/test/_reset/`, `/api/test/_seed_invite/` entries.
- [ ] All audit actions listed in spec section 9 are emitted by at least one task: `invite.issued`, `invite.resent`, `invite.revoked`, `invite.deleted`, `invite.accepted`, `invite.rejected_email_mismatch`, `invite.rejected_user_exists`, `invite.rejected_expired`, `invite.rejected_revoked`, `user.created`, `terms.accepted`, `oauth.mfa_satisfied`.
- [ ] OAuth-only signup flow paths through allauth's adapter (Tasks 4.1-4.3), not through the password endpoint.
- [ ] Frontend `AcceptInvite` ToS scroll gate has both the "long body needs scroll" and "short body auto-enables" branches under test.






