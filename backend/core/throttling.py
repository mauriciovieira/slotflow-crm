from __future__ import annotations

from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


def _live_rate(scope: str) -> str | None:
    """Read the rate for `scope` from the *live* DRF settings.

    `SimpleRateThrottle.THROTTLE_RATES` is a class attribute captured at
    module import (see DRF source). That capture means
    `@override_settings(REST_FRAMEWORK={...})` in tests does not update
    the class-level dict — the throttle keeps using whatever rate was
    active when the class was first imported. Reading via
    `api_settings.DEFAULT_THROTTLE_RATES` on each call goes through
    DRF's settings descriptor, which is reset by override_settings'
    `setting_changed` signal.
    """
    return api_settings.DEFAULT_THROTTLE_RATES.get(scope)


class LoginRateThrottle(AnonRateThrottle):
    """Per-IP throttle on the unauthenticated login endpoint.

    Anonymous bucket: a credential-stuffing attacker is by definition
    anonymous before login succeeds. Pairs with the per-username
    bucket below so a single victim account can't be drained from N
    proxies.
    """

    scope = "auth_login"

    def get_rate(self):
        return _live_rate(self.scope)


class LoginUsernameRateThrottle(SimpleRateThrottle):
    """Per-submitted-username throttle on the login endpoint.

    Buckets by the *attempted* username (lowercased), regardless of
    source IP. A single account is therefore capped at ``auth_login``'s
    rate even when the attacker rotates IPs. Falls back to the IP cache
    key when no username is supplied so the throttle never silently
    no-ops.
    """

    scope = "auth_login_username"

    def get_rate(self):
        return _live_rate(self.scope)

    def get_cache_key(self, request, view):
        username = ""
        try:
            username = (request.data.get("username") or "").strip().lower()
        except Exception:
            # `request.data` access can raise if the body isn't parseable
            # yet (e.g., during error paths). Fall through to IP-only.
            username = ""
        ident = username or self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


class TwoFactorRateThrottle(SimpleRateThrottle):
    """Per-user throttle on the 2FA setup/confirm/verify endpoints.

    For authenticated requests we bucket by user id; for anonymous
    fall back to IP. The 2FA endpoints accept only authenticated
    sessions, so the IP fallback is a defensive default rather than a
    primary path.
    """

    scope = "auth_2fa"

    def get_rate(self):
        return _live_rate(self.scope)

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = str(request.user.pk)
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}
