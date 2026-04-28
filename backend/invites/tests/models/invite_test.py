from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.utils import timezone

from invites.models import Invite


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin",
        email="admin@x.com",
        is_superuser=True,
        is_staff=True,
    )


@pytest.mark.django_db
def test_default_status_is_pending(admin):
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=7),
        created_by=admin,
    )
    assert inv.status == Invite.Status.PENDING


@pytest.mark.django_db
def test_is_consumable_when_pending_and_unexpired(admin):
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash="b" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=admin,
    )
    assert inv.is_consumable is True
    assert inv.is_expired is False


@pytest.mark.django_db
def test_is_not_consumable_when_expired(admin):
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash="c" * 64,
        expires_at=timezone.now() - timedelta(seconds=1),
        created_by=admin,
    )
    assert inv.is_expired is True
    assert inv.is_consumable is False


@pytest.mark.django_db
def test_is_not_consumable_when_revoked(admin):
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash="d" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=admin,
        status=Invite.Status.REVOKED,
    )
    assert inv.is_consumable is False


@pytest.mark.django_db
def test_token_hash_unique(admin):
    Invite.objects.create(
        email="a@x.com",
        token_hash="e" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=admin,
    )
    with pytest.raises(IntegrityError):
        Invite.objects.create(
            email="b@x.com",
            token_hash="e" * 64,
            expires_at=timezone.now() + timedelta(days=1),
            created_by=admin,
        )


@pytest.mark.django_db
def test_mark_accepted_sets_fields(admin):
    from tenancy.models import Workspace

    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash="f" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=admin,
    )
    user = get_user_model().objects.create_user(username="alice@x.com", email="alice@x.com")
    ws = Workspace.objects.create(name="Alice", slug="alice")

    inv.mark_accepted(user=user, workspace=ws)
    inv.refresh_from_db()

    assert inv.status == Invite.Status.ACCEPTED
    assert inv.accepted_by_id == user.pk
    assert inv.workspace_id == ws.id
    assert inv.accepted_at is not None
