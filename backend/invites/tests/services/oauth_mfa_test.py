from __future__ import annotations

from types import SimpleNamespace

import responses

from invites.services.oauth_mfa import check_oauth_mfa


def _sociallogin(provider: str, *, extra_data: dict | None = None, token: str | None = None):
    return SimpleNamespace(
        account=SimpleNamespace(provider=provider, extra_data=extra_data or {}),
        token=SimpleNamespace(token=token or ""),
    )


def test_google_with_amr_mfa_returns_true():
    sl = _sociallogin("google", extra_data={"amr": ["pwd", "mfa"]})
    assert check_oauth_mfa(sl) is True


def test_google_without_amr_mfa_returns_false():
    sl = _sociallogin("google", extra_data={"amr": ["pwd"]})
    assert check_oauth_mfa(sl) is False


def test_google_missing_amr_returns_false():
    sl = _sociallogin("google", extra_data={})
    assert check_oauth_mfa(sl) is False


@responses.activate
def test_github_two_factor_true_returns_true():
    responses.add(
        responses.GET,
        "https://api.github.com/user",
        json={"two_factor_authentication": True},
        status=200,
    )
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is True


@responses.activate
def test_github_two_factor_false_returns_false():
    responses.add(
        responses.GET,
        "https://api.github.com/user",
        json={"two_factor_authentication": False},
        status=200,
    )
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is False


@responses.activate
def test_github_api_error_returns_false():
    responses.add(responses.GET, "https://api.github.com/user", status=500)
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is False


@responses.activate
def test_github_network_error_returns_false():
    sl = _sociallogin("github", token="gh_xxx")
    assert check_oauth_mfa(sl) is False


def test_github_empty_token_returns_false():
    sl = _sociallogin("github", token="")
    assert check_oauth_mfa(sl) is False


def test_unknown_provider_returns_false():
    sl = _sociallogin("twitter")
    assert check_oauth_mfa(sl) is False
