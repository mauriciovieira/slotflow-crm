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

from django.core.management import call_command
from django.http import Http404
from django.urls import path
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


api_test_patterns = [
    path("_reset/", reset_view, name="api_test_reset"),
]
