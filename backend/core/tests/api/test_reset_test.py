from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

# `transaction=True` is mandatory: the view under test calls
# ``call_command("flush", "--noinput")`` which TRUNCATEs every table. On
# Postgres that fails inside the SAVEPOINT-based default ``django_db`` wrapper
# with "cannot TRUNCATE ... because it has pending trigger events" once the
# schema includes deferred FK constraints (e.g. identity.User ->
# core.TermsVersion). A real per-test transaction lets flush TRUNCATE cleanly.
pytestmark = pytest.mark.django_db(transaction=True)

# Matches the default value used by reset_view when SLOTFLOW_E2E_PASSWORD is unset.
_VALID_TOKEN = "e2e-local-only"


@pytest.fixture
def bypass_on(monkeypatch):
    """Force `is_2fa_bypass_active()` True for both consumers.

    ``is_2fa_bypass_active`` is imported via ``from core.auth_bypass import …``
    in two places (the view and the middleware). Python binds the name at
    import time, so patching `core.auth_bypass.is_2fa_bypass_active` alone
    would not flow through. Each consumer module must be patched directly.
    If a third consumer is added later, extend this fixture.
    """
    monkeypatch.setattr("core.api_test_reset.is_2fa_bypass_active", lambda: True)
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _post_reset(client: Client, token: str | None = _VALID_TOKEN):
    """POST to the reset endpoint, optionally with an X-Reset-Token header."""
    kwargs = {}
    if token is not None:
        kwargs["HTTP_X_RESET_TOKEN"] = token
    return client.post("/api/test/_reset/", **kwargs)


def test_returns_404_when_bypass_inactive(monkeypatch):
    monkeypatch.setattr("core.api_test_reset.is_2fa_bypass_active", lambda: False)
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: False)
    client = Client(enforce_csrf_checks=False)
    response = _post_reset(client)
    assert response.status_code == 404


def test_returns_403_when_token_missing(bypass_on, settings):
    settings.DEBUG = True
    client = Client(enforce_csrf_checks=False)
    response = _post_reset(client, token=None)
    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid reset token."


def test_returns_403_when_token_wrong(bypass_on, settings):
    settings.DEBUG = True
    client = Client(enforce_csrf_checks=False)
    response = _post_reset(client, token="wrong-token")
    assert response.status_code == 403
    assert response.json()["detail"] == "Invalid reset token."


def test_flushes_and_reseeds_when_bypass_active(bypass_on, settings):
    """Pre-existing row should be wiped; e2e user should exist after."""
    settings.DEBUG = True  # seed_e2e_user requires DEBUG
    User = get_user_model()
    User.objects.create_user(username="ghost", email="ghost@example.com", password="x")

    client = Client(enforce_csrf_checks=False)
    response = _post_reset(client)

    assert response.status_code == 200, response.content
    assert response.json() == {"status": "reset"}
    assert not User.objects.filter(username="ghost").exists()
    assert User.objects.filter(username="e2e", is_staff=False, is_superuser=False).exists()


def test_allowlisted_by_require_2fa_middleware(monkeypatch, settings):
    """Proves /api/test/_reset/ short-circuits before Require2FAMiddleware's other checks.

    We authenticate a user who has NO confirmed TOTP device and is NOT verified,
    then ensure the middleware's bypass branch is OFF (is_2fa_bypass_active=False).
    The request must still reach the view — the only thing that can save it is
    the exact path match for /api/test/_reset/ in the allowlist.
    """
    settings.DEBUG = True
    # View-side must succeed so we can observe the 200.
    monkeypatch.setattr("core.api_test_reset.is_2fa_bypass_active", lambda: True)
    # Middleware-side bypass OFF — so the allowlist is the only escape hatch.
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: False)
    User = get_user_model()
    user = User.objects.create_user(username="u", email="u@example.com", password="p")
    client = Client(enforce_csrf_checks=False)
    client.force_login(user)
    response = _post_reset(client)
    assert response.status_code == 200
    assert response.json() == {"status": "reset"}


def test_csrf_exempt_with_valid_token(bypass_on, settings):
    """POST with a valid token succeeds even when Django's CSRF enforcement is on."""
    settings.DEBUG = True
    client = Client(enforce_csrf_checks=True)
    response = _post_reset(client)
    assert response.status_code == 200


def test_empty_env_falls_back_to_default_token(bypass_on, settings, monkeypatch):
    """An exported-but-empty SLOTFLOW_E2E_PASSWORD must not accept empty tokens.

    An earlier implementation used ``os.environ.get(name, default)``, which only
    returns ``default`` when the key is absent. Exporting
    ``SLOTFLOW_E2E_PASSWORD=""`` would have flipped the expected token to the
    empty string, silently weakening the check and desyncing from the seed
    command's ``or`` fallback. The reset view now strips + falls back on empty.
    """
    settings.DEBUG = True
    monkeypatch.setenv("SLOTFLOW_E2E_PASSWORD", "")
    client = Client(enforce_csrf_checks=False)

    # Empty token must be rejected.
    assert _post_reset(client, token="").status_code == 403
    # Default-token still accepted.
    assert _post_reset(client, token=_VALID_TOKEN).status_code == 200
