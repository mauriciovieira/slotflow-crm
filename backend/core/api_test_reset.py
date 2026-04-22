"""Bypass-gated test-support endpoint.

Only reachable when ``is_2fa_bypass_active()`` is True (which requires
``settings.DEBUG=True``). Flushes the database and re-seeds the e2e user so
Playwright runs start from a known baseline.

All authentication is disabled on this view via ``authentication_classes=[]``
so the endpoint can be hit without a CSRF token or a session.
"""

from __future__ import annotations

from django.core.management import call_command
from django.http import Http404
from django.urls import path
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from core.auth_bypass import is_2fa_bypass_active


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def reset_view(request: Request) -> Response:
    if not is_2fa_bypass_active():
        raise Http404
    call_command("flush", "--noinput", verbosity=0)
    call_command("seed_e2e_user", verbosity=0)
    return Response({"status": "reset"})


api_test_patterns = [
    path("_reset/", reset_view, name="api_test_reset"),
]
