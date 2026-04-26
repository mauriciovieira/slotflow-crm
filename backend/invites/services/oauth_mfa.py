from __future__ import annotations

import logging

import requests

logger = logging.getLogger("slotflow.invites.oauth_mfa")


def check_oauth_mfa(sociallogin) -> bool:
    """Return True iff the OAuth provider asserts the account has MFA enabled."""
    provider = getattr(sociallogin.account, "provider", "")
    if provider == "google":
        amr = sociallogin.account.extra_data.get("amr") or []
        return "mfa" in amr
    if provider == "github":
        token = getattr(sociallogin.token, "token", "") or ""
        if not token:
            return False
        try:
            resp = requests.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"token {token}",
                    "Accept": "application/vnd.github+json",
                },
                timeout=5,
            )
        except requests.RequestException as exc:
            logger.warning("github_user_fetch_failed", extra={"error": str(exc)})
            return False
        if resp.status_code != 200:
            logger.warning(
                "github_user_fetch_status",
                extra={"status_code": resp.status_code},
            )
            return False
        try:
            return bool(resp.json().get("two_factor_authentication"))
        except ValueError:
            return False
    return False
