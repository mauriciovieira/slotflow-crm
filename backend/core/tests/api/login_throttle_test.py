from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


_LOGIN_THROTTLE_SETTINGS = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Tight limits so the tests don't have to fire dozens of requests.
        "auth_login": "3/min",
        "auth_login_username": "3/min",
        "auth_2fa": "2/min",
    },
}


_2FA_THROTTLE_SETTINGS = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "auth_login": "100/min",
        "auth_login_username": "100/min",
        "auth_2fa": "2/min",
    },
}


# Per-test cache clearing is handled globally by the autouse fixture in
# `backend/conftest.py::_clear_throttle_cache_between_tests`, so we don't
# repeat it here.


def _user(name="alice"):
    return get_user_model().objects.create_user(
        username=name, email=f"{name}@example.com", password="x"
    )


@override_settings(REST_FRAMEWORK=_LOGIN_THROTTLE_SETTINGS)
def test_login_returns_429_after_anonymous_rate_exhausted():
    client = APIClient()
    for _ in range(3):
        response = client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "wrong"},
            format="json",
        )
        # 400 is fine — we just need the throttle bucket to tick.
        assert response.status_code in (400, 401)
    response = client.post(
        "/api/auth/login/",
        {"username": "alice", "password": "wrong"},
        format="json",
    )
    assert response.status_code == 429


@override_settings(REST_FRAMEWORK=_LOGIN_THROTTLE_SETTINGS)
def test_login_username_bucket_caps_per_account_across_ips():
    """Per-username bucket caps a single account regardless of source IP.

    Drives 3 attempts from each of two distinct simulated IPs against the
    same `alice` username; the 4th attempt — even from a fresh IP — must
    429 because the per-username bucket is exhausted.
    """
    c1 = APIClient(REMOTE_ADDR="10.0.0.1")
    for _ in range(3):
        c1.post(
            "/api/auth/login/",
            {"username": "alice", "password": "wrong"},
            format="json",
        )

    # Fresh IP — the anonymous bucket is empty, but the username bucket
    # is full. The fourth attempt must still 429.
    c2 = APIClient(REMOTE_ADDR="10.0.0.2")
    response = c2.post(
        "/api/auth/login/",
        {"username": "alice", "password": "wrong"},
        format="json",
    )
    assert response.status_code == 429


@override_settings(REST_FRAMEWORK=_LOGIN_THROTTLE_SETTINGS)
def test_login_throttle_isolates_distinct_usernames():
    c1 = APIClient()
    # Drain both buckets for `alice` from this IP.
    for _ in range(3):
        c1.post(
            "/api/auth/login/",
            {"username": "alice", "password": "wrong"},
            format="json",
        )
    # Same IP, fresh username — anonymous bucket is exhausted, so this
    # must still 429. (Documents intentional behavior: anonymous bucket
    # is per-IP, not per-IP-username, by design.)
    response = c1.post(
        "/api/auth/login/",
        {"username": "bob", "password": "wrong"},
        format="json",
    )
    assert response.status_code == 429

    # From a fresh IP, the bob attempt should now succeed past the
    # throttle since neither the anonymous nor username bucket is full.
    c2 = APIClient(REMOTE_ADDR="10.0.0.99")
    response = c2.post(
        "/api/auth/login/",
        {"username": "bob", "password": "wrong"},
        format="json",
    )
    assert response.status_code in (400, 401)


@override_settings(REST_FRAMEWORK=_LOGIN_THROTTLE_SETTINGS)
def test_login_throttle_bypassed_when_2fa_bypass_is_active(monkeypatch):
    """E2E + dev convenience: when `SLOTFLOW_BYPASS_2FA` is on (DEBUG only),
    login throttling is suppressed so Playwright suites that hammer
    `/api/auth/login/` don't trip the per-IP cap."""
    monkeypatch.setattr("core.throttling.is_2fa_bypass_active", lambda: True)
    client = APIClient()
    # Far above the configured 3/min — must keep returning 400, never 429.
    for _ in range(10):
        response = client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "wrong"},
            format="json",
        )
        assert response.status_code != 429
        assert response.status_code in (400, 401)


@override_settings(REST_FRAMEWORK=_2FA_THROTTLE_SETTINGS)
def test_2fa_verify_returns_429_after_user_rate_exhausted(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)
    user = _user()
    client = APIClient()
    client.force_authenticate(user)
    for _ in range(2):
        response = client.post("/api/auth/2fa/verify/", {"token": "123456"}, format="json")
        assert response.status_code in (400,)
    response = client.post("/api/auth/2fa/verify/", {"token": "123456"}, format="json")
    assert response.status_code == 429
