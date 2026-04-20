from __future__ import annotations

from django.contrib.auth import authenticate
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django_otp import login as otp_login
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from mcp.auth import mark_otp_session_fresh

from .auth_bypass import is_2fa_bypass_active
from .totp_qr import build_totp_qr_svg


def _user_is_verified(user) -> bool:
    """Handle user objects that haven't been processed by OTPMiddleware.

    OTPMiddleware installs ``is_verified`` as a bound function on the request
    user; a freshly ``authenticate()``-d user lacks it. A just-authenticated
    user is never OTP-verified, so fall back to False.
    """
    is_verified = getattr(user, "is_verified", None)
    if callable(is_verified):
        return bool(is_verified())
    return False


def _me_payload(user) -> dict:
    if not user.is_authenticated:
        return {
            "authenticated": False,
            "username": None,
            "has_totp_device": False,
            "is_verified": False,
        }
    has_device = TOTPDevice.objects.filter(user=user, confirmed=True).exists()
    return {
        "authenticated": True,
        "username": user.username,
        "has_totp_device": has_device,
        "is_verified": _user_is_verified(user) or is_2fa_bypass_active(),
    }


@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def me_view(request: Request) -> Response:
    """Returns auth state. Also sets the csrftoken cookie so subsequent POSTs work."""
    return Response(_me_payload(request.user))


@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_protect
def login_view(request: Request) -> Response:
    """Anonymous login endpoint.

    DRF's ``SessionAuthentication.enforce_csrf`` only runs AFTER authentication
    succeeds, so without an explicit CSRF guard anonymous POSTs would bypass
    CSRF entirely (classic login-CSRF). We apply ``@csrf_protect`` *inside*
    ``@api_view`` so it runs on the Django-HttpRequest the view body receives:
    the outer ``@api_view`` wrapper is marked ``csrf_exempt``, but the inner
    wrapped function still executes ``csrf_protect``'s check before the body.
    """
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if not username or not password:
        return Response({"detail": "Missing username or password."}, status=400)

    user = authenticate(request=request._request, username=username, password=password)
    if user is None:
        return Response({"detail": "Invalid credentials."}, status=400)

    django_login(request._request, user)
    return Response(_me_payload(user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request: Request) -> Response:
    django_logout(request._request)
    return Response(status=204)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def totp_setup_view(request: Request) -> Response:
    device, _created = TOTPDevice.objects.get_or_create(
        user=request.user,
        name="default",
        defaults={"confirmed": False},
    )
    otpauth_uri = device.config_url
    return Response(
        {
            "otpauth_uri": otpauth_uri,
            "qr_svg": build_totp_qr_svg(otpauth_uri),
            "confirmed": device.confirmed,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def totp_confirm_view(request: Request) -> Response:
    token = str(request.data.get("token") or "").replace(" ", "")
    if not token:
        return Response({"detail": "Missing token."}, status=400)

    device = TOTPDevice.objects.filter(user=request.user, name="default").order_by("-id").first()
    if device is None:
        return Response({"detail": "No TOTP device found; start setup first."}, status=400)
    if device.confirmed:
        return Response(_me_payload(request.user))
    if not device.verify_token(token):
        return Response({"detail": "Invalid token."}, status=400)

    device.confirmed = True
    device.save(update_fields=["confirmed"])
    otp_login(request._request, device)
    mark_otp_session_fresh(request._request)
    return Response(_me_payload(request.user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def totp_verify_view(request: Request) -> Response:
    token = str(request.data.get("token") or "").replace(" ", "")
    if not token:
        return Response({"detail": "Missing token."}, status=400)

    devices = TOTPDevice.objects.devices_for_user(request.user).filter(confirmed=True)
    for device in devices:
        if device.verify_token(token):
            otp_login(request._request, device)
            mark_otp_session_fresh(request._request)
            return Response(_me_payload(request.user))
    return Response({"detail": "Invalid token."}, status=400)
