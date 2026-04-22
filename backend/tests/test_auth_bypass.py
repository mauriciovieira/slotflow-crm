from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client  # typing only, for the Client parameter annotation

from core.auth_bypass import BYPASS_ENV_VAR, is_2fa_bypass_active

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    return get_user_model().objects.create_user(
        username="bypassadmin",
        email="bypassadmin@example.com",
        password="pw-test-123",
    )


def test_bypass_inert_when_debug_false(monkeypatch: pytest.MonkeyPatch, settings) -> None:
    settings.DEBUG = False
    monkeypatch.setenv(BYPASS_ENV_VAR, "1")
    assert is_2fa_bypass_active() is False


def test_bypass_inert_when_env_unset(monkeypatch: pytest.MonkeyPatch, settings) -> None:
    settings.DEBUG = True
    monkeypatch.delenv(BYPASS_ENV_VAR, raising=False)
    assert is_2fa_bypass_active() is False


def test_bypass_active_when_debug_and_env_set(monkeypatch: pytest.MonkeyPatch, settings) -> None:
    settings.DEBUG = True
    monkeypatch.setenv(BYPASS_ENV_VAR, "1")
    assert is_2fa_bypass_active() is True


def test_middleware_skips_redirect_when_bypass_active(
    monkeypatch: pytest.MonkeyPatch, settings, user, client: Client
) -> None:
    settings.DEBUG = True
    monkeypatch.setenv(BYPASS_ENV_VAR, "1")
    client.force_login(user)
    # Hitting "/" without 2FA would normally redirect to /2fa/setup/; with
    # the bypass on, the HomeView renders (or returns 200 for whichever
    # template it uses).
    response = client.get("/")
    assert response.status_code == 200, response.content


def test_middleware_redirects_when_bypass_disabled(
    monkeypatch: pytest.MonkeyPatch, settings, user, client: Client
) -> None:
    settings.DEBUG = True
    monkeypatch.delenv(BYPASS_ENV_VAR, raising=False)
    client.force_login(user)
    response = client.get("/")
    assert response.status_code == 302
    assert response["Location"] == "/2fa/setup/"


def test_me_payload_reports_verified_under_bypass(
    monkeypatch: pytest.MonkeyPatch, settings, user, client: Client
) -> None:
    settings.DEBUG = True
    monkeypatch.setenv(BYPASS_ENV_VAR, "1")
    client.force_login(user)
    body = client.get("/api/auth/me/").json()
    assert body["authenticated"] is True
    assert body["is_verified"] is True
