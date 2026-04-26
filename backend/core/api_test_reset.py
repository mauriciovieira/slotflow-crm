"""Bypass-gated test-support endpoint.

Only reachable when ``is_2fa_bypass_active()`` is True (which requires
``settings.DEBUG=True``). Flushes the database and re-seeds the e2e user so
Playwright runs start from a known baseline.

Authentication is disabled (``authentication_classes=[]``) so a Playwright
worker can call this without a session. To prevent an arbitrary web page from
triggering a DB wipe via a cross-site POST, the caller must supply an
``X-Reset-Token`` header whose value matches ``SLOTFLOW_E2E_PASSWORD``
(default ``e2e-local-only``). Requests with a missing or wrong token get a
403 response even when the bypass is active.
"""

from __future__ import annotations

import os
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.http import Http404
from django.urls import path
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from core.auth_bypass import is_2fa_bypass_active
from invites.models import Invite
from invites.services.tokens import issue_token

_RESET_TOKEN_HEADER = "HTTP_X_RESET_TOKEN"


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def reset_view(request: Request) -> Response:
    if not is_2fa_bypass_active():
        raise Http404
    expected_token = (os.environ.get("SLOTFLOW_E2E_PASSWORD") or "").strip() or "e2e-local-only"
    if request.META.get(_RESET_TOKEN_HEADER) != expected_token:
        return Response(
            {"detail": "Invalid reset token."},
            status=status.HTTP_403_FORBIDDEN,
        )
    call_command("flush", "--noinput", verbosity=0)
    call_command("seed_e2e_user", verbosity=0)
    return Response({"status": "reset"})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def seed_invite_view(request: Request) -> Response:
    if not is_2fa_bypass_active():
        raise Http404

    email = (request.data.get("email") or "").strip() or "alice@x.com"
    status_value = request.data.get("status") or "pending"
    expired = bool(request.data.get("expired"))

    allowed_statuses = {choice.value for choice in Invite.Status}
    if status_value not in allowed_statuses:
        return Response(
            {"status": [f"Must be one of: {sorted(allowed_statuses)}."]},
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    User = get_user_model()
    admin, _ = User.objects.get_or_create(
        username="e2e-admin",
        defaults={
            "email": "e2e-admin@slotflow.test",
            "is_superuser": True,
            "is_staff": True,
        },
    )
    raw, hashed = issue_token()
    expires_at = timezone.now() + (timedelta(seconds=-1) if expired else timedelta(days=7))
    inv = Invite.objects.create(
        email=email,
        token_hash=hashed,
        expires_at=expires_at,
        status=Invite.Status(status_value),
        created_by=admin,
    )
    return Response(
        {
            "email": inv.email,
            "raw_token": raw,
            "accept_url": request.build_absolute_uri(f"/accept-invite/{raw}/"),
        }
    )


api_test_patterns = [
    path("_reset/", reset_view, name="api_test_reset"),
    path("_seed_invite/", seed_invite_view, name="api_test_seed_invite"),
]
