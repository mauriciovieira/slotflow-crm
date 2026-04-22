from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import redirect
from django_otp.plugins.otp_totp.models import TOTPDevice

from core.auth_bypass import is_2fa_bypass_active


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
            or path.startswith("/api/test/")
        ):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return self.get_response(request)

        if user.is_verified() or is_2fa_bypass_active():
            return self.get_response(request)

        has_confirmed_device = TOTPDevice.objects.filter(user=user, confirmed=True).exists()
        if not has_confirmed_device:
            return redirect("/2fa/setup/")

        return redirect("/2fa/verify/")
