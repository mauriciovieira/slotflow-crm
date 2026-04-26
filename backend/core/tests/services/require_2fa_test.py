from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.test import Client


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        username="alice", email="alice@x.com", password="Sup3r-Secret-Pw!",
    )


@pytest.mark.django_db
def test_authenticated_user_without_oauth_mfa_redirected_to_2fa_setup(user, client: Client):
    client.force_login(user)
    resp = client.get("/dashboard/", follow=False)
    # No TOTP device, no oauth_mfa_satisfied → middleware redirects.
    assert resp.status_code in (301, 302)
    assert "/2fa/setup/" in resp["Location"]


@pytest.mark.django_db
def test_session_oauth_mfa_satisfied_skips_redirect(user, client: Client):
    client.force_login(user)
    session = client.session
    session["oauth_mfa_satisfied"] = True
    session.save()
    resp = client.get("/dashboard/", follow=False)
    assert "/2fa/" not in resp.get("Location", "")
