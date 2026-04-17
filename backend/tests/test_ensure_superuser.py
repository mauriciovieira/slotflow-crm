from __future__ import annotations

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command


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
