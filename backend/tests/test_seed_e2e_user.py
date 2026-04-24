from __future__ import annotations

from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError

pytestmark = pytest.mark.django_db


def _run():
    """Run the command and capture stdout."""
    out = StringIO()
    call_command("seed_e2e_user", stdout=out)
    return out.getvalue()


def test_creates_non_admin_user_when_absent(settings):
    settings.DEBUG = True
    User = get_user_model()
    assert not User.objects.filter(username="e2e").exists()

    _run()

    user = User.objects.get(username="e2e")
    assert user.email == "e2e@slotflow.test"
    assert user.is_staff is False
    assert user.is_superuser is False
    assert user.check_password("e2e-local-only") is True


def test_idempotent_on_repeat_run(settings):
    settings.DEBUG = True
    _run()
    _run()
    User = get_user_model()
    assert User.objects.filter(username="e2e").count() == 1


def test_updates_password_when_env_changes(monkeypatch, settings):
    settings.DEBUG = True
    _run()
    monkeypatch.setenv("SLOTFLOW_E2E_PASSWORD", "rotated-pw")
    _run()
    User = get_user_model()
    user = User.objects.get(username="e2e")
    assert user.check_password("rotated-pw") is True
    assert user.check_password("e2e-local-only") is False


def test_refuses_when_debug_off(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError, match="DEBUG"):
        _run()
