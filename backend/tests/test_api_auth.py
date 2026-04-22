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


@pytest.fixture
def csrf_client() -> Client:
    return Client(enforce_csrf_checks=True)


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
    response = client.post("/api/auth/login/", data={}, content_type="application/json")
    assert response.status_code == 400


def test_logout_requires_auth(client: Client) -> None:
    response = client.post("/api/auth/logout/")
    assert response.status_code == 403


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


def test_middleware_allows_api_auth_with_confirmed_device_unverified(client: Client, user) -> None:
    """Middleware must not redirect /api/auth/* even when the user has a
    confirmed TOTP device but no active OTP session."""
    from django_otp.plugins.otp_totp.models import TOTPDevice

    TOTPDevice.objects.create(
        user=user,
        name="default",
        confirmed=True,
        key="0123456789abcdef0123456789abcdef01234567",
    )
    client.force_login(user)
    response = client.get("/api/auth/me/")
    assert response.status_code == 200, response.content


def test_login_rejects_without_csrf(csrf_client: Client, user) -> None:
    response = csrf_client.post(
        "/api/auth/login/",
        data={"username": "admin", "password": "pw-test-123"},
        content_type="application/json",
    )
    assert response.status_code == 403


def test_login_accepts_with_csrf(csrf_client: Client, user) -> None:
    # Prime the csrftoken cookie via a GET to me (has @ensure_csrf_cookie).
    csrf_client.get("/api/auth/me/")
    token = csrf_client.cookies["csrftoken"].value
    response = csrf_client.post(
        "/api/auth/login/",
        data={"username": "admin", "password": "pw-test-123"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 200


from django_otp.plugins.otp_totp.models import TOTPDevice  # noqa: E402  (grouped with 2FA tests)


def _seeded_device(user, *, confirmed: bool) -> TOTPDevice:
    return TOTPDevice.objects.create(
        user=user,
        name="default",
        confirmed=confirmed,
        # 40-char hex key matching django-otp default size; deterministic for tests
        key="0123456789abcdef0123456789abcdef01234567",
    )


def test_totp_setup_creates_unconfirmed_device(client: Client, user) -> None:
    client.force_login(user)
    response = client.get("/api/auth/2fa/setup/")
    assert response.status_code == 200
    body = response.json()
    assert body["otpauth_uri"].startswith("otpauth://totp/")
    assert body["qr_svg"].startswith("<svg")
    assert body["confirmed"] is False
    assert TOTPDevice.objects.filter(user=user, name="default", confirmed=False).exists()


def test_totp_setup_idempotent(client: Client, user) -> None:
    client.force_login(user)
    client.get("/api/auth/2fa/setup/")
    client.get("/api/auth/2fa/setup/")
    assert TOTPDevice.objects.filter(user=user, name="default").count() == 1


def test_totp_setup_does_not_leak_seed_when_device_confirmed(client: Client, user) -> None:
    """Already-confirmed device must not re-issue the TOTP seed.

    Re-serving the otpauth_uri or QR for a confirmed device would let anyone
    with the current session silently clone the authenticator, persisting
    access beyond session revocation.
    """
    _seeded_device(user, confirmed=True)
    client.force_login(user)
    response = client.get("/api/auth/2fa/setup/")
    assert response.status_code == 200
    body = response.json()
    assert body["confirmed"] is True
    assert body["otpauth_uri"] == ""
    assert body["qr_svg"] == ""


def test_totp_confirm_invalid_token(client: Client, user) -> None:
    _seeded_device(user, confirmed=False)
    client.force_login(user)
    response = client.post(
        "/api/auth/2fa/confirm/",
        data={"token": "000000"},
        content_type="application/json",
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid token."}


def test_totp_confirm_valid_token(client: Client, user, monkeypatch) -> None:
    from django_otp.oath import TOTP

    fixed_time = 1_700_000_000
    monkeypatch.setattr("time.time", lambda: fixed_time)

    device = _seeded_device(user, confirmed=False)
    client.force_login(user)
    # Freeze time so token generation and server-side verification use the
    # same TOTP window. zfill guards the rare case where the generated token
    # has a leading zero.
    t = TOTP(key=bytes.fromhex(device.key), step=device.step, t0=device.t0, digits=device.digits)
    t.time = fixed_time
    valid_token = str(t.token()).zfill(device.digits)

    response = client.post(
        "/api/auth/2fa/confirm/",
        data={"token": valid_token},
        content_type="application/json",
    )
    assert response.status_code == 200
    device.refresh_from_db()
    assert device.confirmed is True


def test_totp_verify_invalid_token(client: Client, user) -> None:
    _seeded_device(user, confirmed=True)
    client.force_login(user)
    response = client.post(
        "/api/auth/2fa/verify/",
        data={"token": "000000"},
        content_type="application/json",
    )
    assert response.status_code == 400


def test_totp_endpoints_require_auth(client: Client) -> None:
    for path, method in [
        ("/api/auth/2fa/setup/", "get"),
        ("/api/auth/2fa/confirm/", "post"),
        ("/api/auth/2fa/verify/", "post"),
    ]:
        resp = getattr(client, method)(path, data={}, content_type="application/json")
        assert resp.status_code in (401, 403), f"{path} should require auth, got {resp.status_code}"


def test_totp_confirm_accepts_int_token(client, user) -> None:
    _seeded_device(user, confirmed=False)
    client.force_login(user)
    # JSON numbers — some poorly-typed clients send this.
    response = client.post(
        "/api/auth/2fa/confirm/",
        data={"token": 123456},
        content_type="application/json",
    )
    # Either 400 (invalid token, since 123456 is unlikely to be valid)
    # or 200 (vanishingly unlikely). Never 500.
    assert response.status_code in (200, 400), response.content


def test_totp_verify_accepts_int_token(client, user) -> None:
    _seeded_device(user, confirmed=True)
    client.force_login(user)
    response = client.post(
        "/api/auth/2fa/verify/",
        data={"token": 123456},
        content_type="application/json",
    )
    assert response.status_code in (200, 400), response.content
