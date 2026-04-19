from __future__ import annotations

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django_otp.plugins.otp_totp.models import TOTPDevice


@pytest.fixture
def debug_true(settings):
    settings.DEBUG = True


@pytest.mark.django_db
def test_ensure_superuser_skips_without_flag(
    monkeypatch: pytest.MonkeyPatch,
    debug_true,
) -> None:
    monkeypatch.delenv("SLOTFLOW_ENSURE_SUPERUSER", raising=False)
    out = StringIO()
    call_command("ensure_superuser", stdout=out)
    assert "Skipping" in out.getvalue()


@pytest.mark.django_db
def test_ensure_superuser_creates_user(
    monkeypatch: pytest.MonkeyPatch,
    debug_true,
) -> None:
    monkeypatch.setenv("SLOTFLOW_ENSURE_SUPERUSER", "1")
    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", "fixtureadmin")
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "fixture@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "test-password-123")

    call_command("ensure_superuser")

    User = get_user_model()
    user = User.objects.get(username="fixtureadmin")
    assert user.is_superuser
    assert user.is_staff
    assert user.check_password("test-password-123")


@pytest.mark.django_db
def test_ensure_superuser_updates_password(
    monkeypatch: pytest.MonkeyPatch,
    debug_true,
) -> None:
    User = get_user_model()
    User.objects.create_user(
        username="fixtureadmin2",
        email="f2@example.com",
        password="old",
    )
    monkeypatch.setenv("SLOTFLOW_ENSURE_SUPERUSER", "1")
    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", "fixtureadmin2")
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", "f2@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "new-secret")

    call_command("ensure_superuser")

    user = User.objects.get(username="fixtureadmin2")
    assert user.is_superuser
    assert user.check_password("new-secret")


def _enable_superuser_env(monkeypatch: pytest.MonkeyPatch, username: str) -> None:
    monkeypatch.setenv("SLOTFLOW_ENSURE_SUPERUSER", "1")
    monkeypatch.setenv("DJANGO_SUPERUSER_USERNAME", username)
    monkeypatch.setenv("DJANGO_SUPERUSER_EMAIL", f"{username}@example.com")
    monkeypatch.setenv("DJANGO_SUPERUSER_PASSWORD", "test-password-123")


@pytest.mark.django_db
def test_ensure_superuser_seeds_totp_device_when_key_set(
    monkeypatch: pytest.MonkeyPatch,
    debug_true,
) -> None:
    _enable_superuser_env(monkeypatch, "totpadmin")
    key = "0123456789abcdef0123456789abcdef01234567"
    monkeypatch.setenv("SLOTFLOW_ADMIN_TOTP_KEY", key)

    call_command("ensure_superuser")

    User = get_user_model()
    user = User.objects.get(username="totpadmin")
    device = TOTPDevice.objects.get(user=user, name="default")
    assert device.key == key
    assert device.confirmed is True


@pytest.mark.django_db
def test_ensure_superuser_updates_existing_totp_device(
    monkeypatch: pytest.MonkeyPatch,
    debug_true,
) -> None:
    User = get_user_model()
    user = User.objects.create_user(
        username="totpupdate",
        email="totpupdate@example.com",
        password="pw",
    )
    TOTPDevice.objects.create(user=user, name="default", key="a" * 40, confirmed=False)
    _enable_superuser_env(monkeypatch, "totpupdate")
    new_key = "fedcba9876543210fedcba9876543210fedcba98"
    monkeypatch.setenv("SLOTFLOW_ADMIN_TOTP_KEY", new_key)

    call_command("ensure_superuser")

    devices = TOTPDevice.objects.filter(user=user, name="default")
    assert devices.count() == 1
    device = devices.get()
    assert device.key == new_key
    assert device.confirmed is True


@pytest.mark.django_db
def test_ensure_superuser_skips_totp_when_key_absent(
    monkeypatch: pytest.MonkeyPatch,
    debug_true,
) -> None:
    _enable_superuser_env(monkeypatch, "notptadmin")
    monkeypatch.delenv("SLOTFLOW_ADMIN_TOTP_KEY", raising=False)
    out = StringIO()

    call_command("ensure_superuser", stdout=out)

    User = get_user_model()
    user = User.objects.get(username="notptadmin")
    assert not TOTPDevice.objects.filter(user=user).exists()
    assert "No SLOTFLOW_ADMIN_TOTP_KEY set" in out.getvalue()


@pytest.mark.django_db
@pytest.mark.parametrize(
    "bad_key",
    [
        "too-short",
        "0123456789abcdef",
        "0123456789abcdef0123456789abcdef0123456",  # 39 chars
        "0123456789abcdef0123456789abcdef012345678",  # 41 chars
        "0123456789abcdef0123456789abcdef0123456Z",  # non-hex
    ],
)
def test_ensure_superuser_rejects_invalid_totp_key(
    monkeypatch: pytest.MonkeyPatch,
    debug_true,
    bad_key: str,
) -> None:
    _enable_superuser_env(monkeypatch, "badkeyadmin")
    monkeypatch.setenv("SLOTFLOW_ADMIN_TOTP_KEY", bad_key)

    with pytest.raises(CommandError):
        call_command("ensure_superuser")
