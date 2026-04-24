from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

pytestmark = pytest.mark.django_db


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


def test_returns_404_when_bypass_inactive(monkeypatch):
    monkeypatch.setattr("core.api_test_reset.is_2fa_bypass_active", lambda: False)
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: False)
    client = Client(enforce_csrf_checks=False)
    response = client.post("/api/test/_reset/")
    assert response.status_code == 404


def test_flushes_and_reseeds_when_bypass_active(bypass_on, settings):
    """Pre-existing row should be wiped; e2e user should exist after."""
    settings.DEBUG = True  # seed_e2e_user requires DEBUG
    User = get_user_model()
    User.objects.create_user(username="ghost", email="ghost@example.com", password="x")

    client = Client(enforce_csrf_checks=False)
    response = client.post("/api/test/_reset/")

    assert response.status_code == 200, response.content
    assert response.json() == {"status": "reset"}
    assert not User.objects.filter(username="ghost").exists()
    assert User.objects.filter(username="e2e", is_staff=False, is_superuser=False).exists()


def test_allowlisted_by_require_2fa_middleware(monkeypatch, settings):
    """Proves /api/test/ short-circuits before Require2FAMiddleware's other checks.

    We authenticate a user who has NO confirmed TOTP device and is NOT verified,
    then ensure the middleware's bypass branch is OFF (is_2fa_bypass_active=False).
    The request must still reach the view — the only thing that can save it is
    the /api/test/ prefix in the allowlist.
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
    response = client.post("/api/test/_reset/")
    assert response.status_code == 200
    assert response.json() == {"status": "reset"}


def test_csrf_exempt(bypass_on, settings):
    """POST without CSRF token succeeds under bypass."""
    settings.DEBUG = True
    client = Client(enforce_csrf_checks=True)
    response = client.post("/api/test/_reset/")
    assert response.status_code == 200
