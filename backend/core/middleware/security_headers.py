from __future__ import annotations

from django.conf import settings

# Default Content-Security-Policy. Production-tight: no inline scripts,
# no eval, no remote sources. Vite-built assets are served from the same
# origin (`/static/...`) so `'self'` covers them. The DEBUG override
# below relaxes this so the Vite dev server (HMR over websocket, inline
# style hot-reload) keeps working in `make dev`.
_PROD_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)

_DEBUG_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'self' ws: wss:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)

# Permissions-Policy: deny every powerful API the app does not use.
# Listing each feature explicitly keeps the policy auditable and resists
# silent permission grants when the browser ships a new feature.
_PERMISSIONS_POLICY = (
    "accelerometer=(), "
    "ambient-light-sensor=(), "
    "autoplay=(), "
    "battery=(), "
    "camera=(), "
    "clipboard-write=(self), "
    "display-capture=(), "
    "encrypted-media=(), "
    "fullscreen=(), "
    "geolocation=(), "
    "gyroscope=(), "
    "magnetometer=(), "
    "microphone=(), "
    "midi=(), "
    "payment=(), "
    "picture-in-picture=(), "
    "publickey-credentials-get=(), "
    "screen-wake-lock=(), "
    "sync-xhr=(), "
    "usb=(), "
    "web-share=(), "
    "xr-spatial-tracking=()"
)


class SecurityHeadersMiddleware:
    """Adds Content-Security-Policy, Permissions-Policy, and
    Referrer-Policy to every response.

    Django's built-in `SecurityMiddleware` already handles HSTS,
    `X-Content-Type-Options`, and `Referrer-Policy` (when configured),
    but it does not emit a CSP. We add CSP here, plus a strict
    `Permissions-Policy`, and set `Referrer-Policy` defensively in case
    the project setting drifts.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self._csp = _DEBUG_CSP if settings.DEBUG else _PROD_CSP
        self._permissions_policy = _PERMISSIONS_POLICY
        self._referrer_policy = "strict-origin-when-cross-origin"

    def __call__(self, request):
        response = self.get_response(request)
        # Don't overwrite a header a downstream view set explicitly —
        # the admin / debug tooling sometimes needs a relaxed CSP for
        # introspection panels.
        response.setdefault("Content-Security-Policy", self._csp)
        response.setdefault("Permissions-Policy", self._permissions_policy)
        response.setdefault("Referrer-Policy", self._referrer_policy)
        return response
