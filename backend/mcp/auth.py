from __future__ import annotations

from datetime import datetime, timedelta

from django.conf import settings
from django.http import HttpRequest
from django.utils import timezone

_SESSION_LAST_OTP_AT = "slotflow_last_otp_at"


class McpAuthError(Exception):
    def __init__(self, message: str, status_code: int = 403):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def require_fresh_2fa_session(request: HttpRequest, *, max_age_seconds: int = 900) -> None:
    """Gate MCP-style endpoints on an OTP-verified interactive session.

    Track 02 implements the enforcement point only; token issuance comes later.
    """

    if not request.user.is_authenticated:
        raise McpAuthError("Authentication required.", status_code=401)

    is_verified = getattr(request.user, "is_verified", None)
    if not callable(is_verified) or not is_verified():
        raise McpAuthError("OTP verification required.")

    raw_ts = request.session.get(_SESSION_LAST_OTP_AT)
    if raw_ts is None:
        raise McpAuthError("OTP session is not fresh enough; re-verify.")

    try:
        last_otp_at = datetime.fromisoformat(raw_ts)
    except ValueError as exc:
        raise McpAuthError("OTP session is not fresh enough; re-verify.") from exc

    if timezone.is_naive(last_otp_at):
        last_otp_at = timezone.make_aware(last_otp_at, timezone=timezone.get_current_timezone())

    if timezone.now() - last_otp_at > timedelta(seconds=max_age_seconds):
        raise McpAuthError("OTP session is not fresh enough; re-verify.")


def mark_otp_session_fresh(request: HttpRequest) -> None:
    request.session[_SESSION_LAST_OTP_AT] = timezone.now().isoformat()


def mcp_notes() -> dict[str, str]:
    return {
        "issuer": getattr(settings, "OTP_TOTP_ISSUER", ""),
        "freshness_seconds_default": "900",
    }
