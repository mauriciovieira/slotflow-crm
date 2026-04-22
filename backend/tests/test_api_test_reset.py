from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

pytestmark = pytest.mark.django_db


@pytest.fixture
def bypass_on(monkeypatch):
    monkeypatch.setattr(
        "core.api_test_reset.is_2fa_bypass_active", lambda: True
    )
    monkeypatch.setattr(
        "core.middleware.require_2fa.is_2fa_bypass_active", lambda: True
    )


def test_returns_404_when_bypass_inactive():
    """Default test environment has bypass inactive -> 404."""
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


def test_allowlisted_by_require_2fa_middleware(bypass_on, settings):
    """Anonymous POST should hit the view, not redirect to /2fa/verify."""
    settings.DEBUG = True
    client = Client(enforce_csrf_checks=False)
    response = client.post("/api/test/_reset/")
    assert response.status_code == 200


def test_csrf_exempt(bypass_on, settings):
    """POST without CSRF token succeeds under bypass."""
    settings.DEBUG = True
    client = Client(enforce_csrf_checks=True)
    response = client.post("/api/test/_reset/")
    assert response.status_code == 200
