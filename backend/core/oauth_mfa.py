"""OAuth-asserted MFA session flag, bound to the authenticated user.

The flag is consulted by `Require2FAMiddleware` and `_me_payload` to decide
whether a session can skip the TOTP gate because the OAuth provider asserted
a second factor (Google `amr` / GitHub `/user.two_factor_authentication`).

Storing only a bare boolean is unsafe: if a session were ever reused across
identities (e.g. a logout that fails to flush, or a session-fixation attack),
the next user would inherit the previous user's MFA assertion. We therefore
store the authenticated user's primary key and only honour the flag when it
matches `request.user.pk`.
"""

from __future__ import annotations

_SESSION_KEY = "oauth_mfa_user_id"


def mark_oauth_mfa_satisfied(request, user) -> None:
    request.session[_SESSION_KEY] = user.pk
    # Real Django session backends expose `.modified`; tests sometimes pass a
    # plain dict, so guard the attribute write.
    if hasattr(request.session, "modified"):
        request.session.modified = True


def is_oauth_mfa_satisfied(request, user) -> bool:
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    session = getattr(request, "session", None)
    if session is None:
        return False
    return session.get(_SESSION_KEY) == user.pk
