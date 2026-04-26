from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django_otp.plugins.otp_totp.models import TOTPDevice

from core.auth_bypass import is_2fa_bypass_active
from core.oauth_mfa import is_oauth_mfa_satisfied


class Require2FAMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        path = request.path

        if (
            path.startswith("/healthz")
            or path.startswith("/static/")
            or path.startswith("/admin/")
            or path.startswith("/accounts/")
            or path.startswith("/2fa/")
            or path.startswith("/api/auth/")
            or path.startswith("/api/invites/")
            or path
            in (
                "/api/test/_reset",
                "/api/test/_reset/",
                "/api/test/_seed_invite",
                "/api/test/_seed_invite/",
            )
        ):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return self.get_response(request)

        if is_2fa_bypass_active():
            return self.get_response(request)

        if is_oauth_mfa_satisfied(request, user):
            return self.get_response(request)

        if user.is_verified():
            return self.get_response(request)

        has_confirmed_device = TOTPDevice.objects.filter(user=user, confirmed=True).exists()
        if not has_confirmed_device:
            return redirect("/2fa/setup/")

        return redirect("/2fa/verify/")
