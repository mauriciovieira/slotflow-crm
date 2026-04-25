from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from mcp.models import McpToken

pytestmark = pytest.mark.django_db


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _token(user, **overrides):
    defaults = {
        "user": user,
        "name": "Cursor on laptop",
        "token_hash": "a" * 64,
        "last_four": "wxyz",
        "expires_at": timezone.now() + timedelta(days=30),
    }
    defaults.update(overrides)
    return McpToken.objects.create(**defaults)


def test_str_includes_user_and_name():
    user = _user()
    t = _token(user)
    assert str(t) == f"{user.pk}:Cursor on laptop"


def test_active_when_not_revoked_and_not_expired():
    t = _token(_user())
    assert t.is_active is True


def test_inactive_when_revoked():
    t = _token(_user())
    t.revoked_at = timezone.now()
    assert t.is_active is False


def test_inactive_when_expired():
    t = _token(_user(), expires_at=timezone.now() - timedelta(seconds=1))
    assert t.is_active is False


def test_user_delete_cascades_to_token():
    user = _user()
    _token(user)
    assert McpToken.objects.count() == 1
    user.delete()
    assert McpToken.objects.count() == 0


def test_default_ordering_is_newest_first():
    user = _user()
    older = _token(user, token_hash="b" * 64)
    newer = _token(user, token_hash="c" * 64)
    ordered = list(McpToken.objects.all())
    assert ordered[0].pk == newer.pk
    assert ordered[1].pk == older.pk
