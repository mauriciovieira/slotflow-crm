from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from django_otp import login as otp_login
from django_otp.plugins.otp_totp.models import TOTPDevice

from audit.models import AuditEvent
from invites.models import Invite


def _otp_login(client, user):
    """Force-login a superuser AND mark the session OTP-verified.

    Django admin uses `OTPAdminSite` (see identity/admin.py), which gates
    `has_permission` on `user.is_verified()`. `client.force_login` alone
    sets the auth session but skips OTP, so admin views still 302 to the
    login page. Here we create a confirmed TOTP device, force-login the
    user via the standard backend, then call django_otp.login on the
    underlying request to flip the verified bit on the session.
    """
    client.force_login(user, backend="django.contrib.auth.backends.ModelBackend")
    device, _ = TOTPDevice.objects.get_or_create(
        user=user,
        name="default",
        defaults={"confirmed": True},
    )
    if not device.confirmed:
        device.confirmed = True
        device.save(update_fields=["confirmed"])
    # Build a fake request whose session matches the test client's, then
    # call otp_login to mark it verified. Django persists the change.
    session = client.session
    request = type("R", (), {})()
    request.session = session
    request.user = user
    otp_login(request, device)
    session.save()


@pytest.fixture
def superuser(db):
    return get_user_model().objects.create_superuser(
        username="root",
        email="root@x.com",
        password="x",
    )


@pytest.fixture
def staff_not_super(db):
    return get_user_model().objects.create_user(
        username="staff",
        email="staff@x.com",
        password="x",
        is_staff=True,
        is_superuser=False,
    )


@pytest.mark.django_db
def test_changelist_visible_to_superuser(client, superuser):
    _otp_login(client, superuser)
    resp = client.get(reverse("admin:invites_invite_changelist"))
    assert resp.status_code == 200


@pytest.mark.django_db
def test_changelist_forbidden_for_non_superuser(client, staff_not_super):
    _otp_login(client, staff_not_super)
    resp = client.get(reverse("admin:invites_invite_changelist"))
    assert resp.status_code in (302, 403)


@pytest.mark.django_db
def test_expired_filter_includes_expired_pending_invites(client, superuser):
    Invite.objects.create(
        email="a@x.com",
        token_hash="a" * 64,
        expires_at=timezone.now() - timedelta(seconds=1),
        created_by=superuser,
    )
    Invite.objects.create(
        email="b@x.com",
        token_hash="b" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=superuser,
    )
    _otp_login(client, superuser)
    resp = client.get(
        reverse("admin:invites_invite_changelist") + "?expired=expired",
    )
    assert resp.status_code == 200
    assert b"a@x.com" in resp.content
    assert b"b@x.com" not in resp.content


@pytest.mark.django_db
def test_add_view_creates_invite_with_hashed_token_and_flash(client, superuser):
    _otp_login(client, superuser)
    response = client.post(
        reverse("admin:invites_invite_add"),
        {
            "email": "alice@x.com",
            "expires_at_0": "2026-12-31",
            "expires_at_1": "00:00:00",
            "status": Invite.Status.PENDING,
        },
        follow=True,
    )
    assert response.status_code == 200

    invite = Invite.objects.get(email="alice@x.com")
    assert invite.token_hash and len(invite.token_hash) == 64
    assert invite.created_by_id == superuser.pk

    messages = [str(m) for m in response.context["messages"]]
    assert any("/accept-invite/" in m for m in messages)
    assert any("copy now" in m.lower() or "will not be shown again" in m.lower() for m in messages)

    assert AuditEvent.objects.filter(action="invite.issued").count() == 1


@pytest.mark.django_db
def test_revoke_action_marks_pending_invites_revoked(client, superuser):
    inv1 = Invite.objects.create(
        email="a@x.com",
        token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=superuser,
    )
    inv2 = Invite.objects.create(
        email="b@x.com",
        token_hash="b" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=superuser,
        status=Invite.Status.ACCEPTED,
    )
    _otp_login(client, superuser)
    client.post(
        reverse("admin:invites_invite_changelist"),
        {
            "action": "revoke_selected",
            "_selected_action": [str(inv1.pk), str(inv2.pk)],
            "index": "0",
        },
        follow=True,
    )

    inv1.refresh_from_db()
    inv2.refresh_from_db()
    assert inv1.status == Invite.Status.REVOKED
    assert inv2.status == Invite.Status.ACCEPTED
    assert AuditEvent.objects.filter(action="invite.revoked").count() == 1


@pytest.mark.django_db
def test_resend_action_rotates_token_and_extends_expiry(client, superuser):
    inv = Invite.objects.create(
        email="a@x.com",
        token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        created_by=superuser,
    )
    old_hash = inv.token_hash
    old_expiry = inv.expires_at

    _otp_login(client, superuser)
    response = client.post(
        reverse("admin:invites_invite_changelist"),
        {
            "action": "resend_selected",
            "_selected_action": [str(inv.pk)],
            "index": "0",
        },
        follow=True,
    )
    inv.refresh_from_db()
    assert inv.token_hash != old_hash
    assert inv.expires_at > old_expiry

    messages_text = " ".join(str(m) for m in response.context["messages"])
    assert "/accept-invite/" in messages_text
    assert AuditEvent.objects.filter(action="invite.resent").count() == 1


@pytest.mark.django_db
def test_delete_writes_audit_with_email_and_status_snapshot(client, superuser):
    inv = Invite.objects.create(
        email="a@x.com",
        token_hash="a" * 64,
        expires_at=timezone.now() + timedelta(days=1),
        status=Invite.Status.PENDING,
        created_by=superuser,
    )
    _otp_login(client, superuser)
    client.post(
        reverse("admin:invites_invite_delete", args=[inv.pk]),
        {"post": "yes"},
        follow=True,
    )
    assert not Invite.objects.filter(pk=inv.pk).exists()
    audit = AuditEvent.objects.get(action="invite.deleted")
    assert audit.metadata == {"email": "a@x.com", "status": "pending"}
