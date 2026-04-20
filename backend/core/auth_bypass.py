"""Dev-only opt-in helper to bypass 2FA verification.

Exists so Playwright e2e tests (deferred to a later PR) can exercise
authenticated flows without computing live TOTP codes. The bypass is
**only active under ``settings.DEBUG``** — staging and production are
inert even if the env var leaks into a deployed ``.env``.

Every consumer (middleware, API payload) must call
:func:`is_2fa_bypass_active` rather than reading the env var directly,
so the DEBUG gate is centralised.
"""

from __future__ import annotations

from django.conf import settings

from config.env import env_bool

BYPASS_ENV_VAR = "SLOTFLOW_BYPASS_2FA"


def is_2fa_bypass_active() -> bool:
    """True iff DEBUG is on AND ``SLOTFLOW_BYPASS_2FA`` is truthy.

    Returns False in any other combination. In particular, setting the
    env var when DEBUG is False is silently ignored — we never weaken
    2FA outside local development.
    """

    if not settings.DEBUG:
        return False
    return env_bool(BYPASS_ENV_VAR, default=False)
