from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    User = get_user_model()
    u = User.objects.create_user(
        username="admin", email="admin@example.com", password="pw-test-123"
    )
    return u


@pytest.fixture
def client() -> Client:
    return Client(enforce_csrf_checks=False)


def test_me_anonymous(client: Client) -> None:
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "authenticated": False,
        "username": None,
        "has_totp_device": False,
        "is_verified": False,
    }


def test_me_sets_csrftoken_cookie(client: Client) -> None:
    response = client.get("/api/auth/me/")
    assert "csrftoken" in response.cookies


def test_me_authenticated_unverified(client: Client, user) -> None:
    client.force_login(user)
    response = client.get("/api/auth/me/")
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["username"] == "admin"
    assert body["has_totp_device"] is False
    assert body["is_verified"] is False


def test_login_success(client: Client, user) -> None:
    response = client.post(
        "/api/auth/login/",
        data={"username": "admin", "password": "pw-test-123"},
        content_type="application/json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["username"] == "admin"


def test_login_bad_password(client: Client, user) -> None:
    response = client.post(
        "/api/auth/login/",
        data={"username": "admin", "password": "wrong"},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid credentials."}


def test_login_missing_fields(client: Client) -> None:
    response = client.post(
        "/api/auth/login/", data={}, content_type="application/json"
    )
    assert response.status_code == 400


def test_logout_requires_auth(client: Client) -> None:
    response = client.post("/api/auth/logout/")
    assert response.status_code in (401, 403)


def test_logout_success(client: Client, user) -> None:
    client.force_login(user)
    response = client.post("/api/auth/logout/")
    assert response.status_code == 204
    # Subsequent me call is anonymous again
    me = client.get("/api/auth/me/").json()
    assert me["authenticated"] is False


def test_middleware_allows_api_auth_without_2fa(client: Client, user) -> None:
    """Require2FAMiddleware must not redirect /api/auth/* calls."""
    client.force_login(user)
    response = client.get("/api/auth/me/")
    # Would return a 302 to /2fa/setup/ if middleware redirected.
    assert response.status_code == 200
