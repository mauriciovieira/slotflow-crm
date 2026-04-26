from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

import pytest
from allauth.core.exceptions import ImmediateHttpResponse
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from django.utils import timezone

from audit.models import AuditEvent
from core.models import TermsVersion
from invites.adapters import (
    SlotflowAccountAdapter,
    SlotflowSocialAccountAdapter,
)
from invites.models import Invite
from invites.services.tokens import issue_token


def _stub_sociallogin(*, email, provider="google", amr=None, is_existing=False):
    return SimpleNamespace(
        user=SimpleNamespace(email=email),
        account=SimpleNamespace(provider=provider, extra_data={"amr": amr or []}),
        token=SimpleNamespace(token=""),
        is_existing=is_existing,
    )


@pytest.fixture
def admin(db):
    return get_user_model().objects.create_user(
        username="admin",
        email="admin@x.com",
        is_superuser=True,
    )


@pytest.fixture
def invite_in_session(admin, db):
    raw, hashed = issue_token()
    inv = Invite.objects.create(
        email="alice@x.com",
        token_hash=hashed,
        expires_at=timezone.now() + timedelta(days=7),
        status=Invite.Status.PENDING,
        created_by=admin,
    )
    return raw, hashed, inv


# --- is_open_for_signup ----------------------------------------------------


@pytest.mark.django_db
def test_account_adapter_blocks_open_signup():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    assert SlotflowAccountAdapter().is_open_for_signup(request) is False


@pytest.mark.django_db
def test_social_adapter_rejects_signup_when_no_invite_in_session():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    adapter = SlotflowSocialAccountAdapter()
    assert adapter.is_open_for_signup(request, sociallogin=None) is False


# --- pre_social_login ------------------------------------------------------


@pytest.mark.django_db
def test_pre_social_login_redirects_on_email_mismatch(invite_in_session):
    raw, hashed, _ = invite_in_session
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
    }

    sociallogin = _stub_sociallogin(email="MALLORY@x.com")
    adapter = SlotflowSocialAccountAdapter()

    with pytest.raises(ImmediateHttpResponse) as exc_info:
        adapter.pre_social_login(request, sociallogin)
    response = exc_info.value.response
    assert response.status_code in (301, 302)
    assert f"/accept-invite/{raw}/?error=email_mismatch" in response["Location"]
    assert AuditEvent.objects.filter(action="invite.rejected_email_mismatch").count() == 1


@pytest.mark.django_db
def test_pre_social_login_redirects_when_user_with_email_already_exists(invite_in_session):
    raw, hashed, _ = invite_in_session
    get_user_model().objects.create_user(
        username="alice@x.com",
        email="alice@x.com",
        password="x",
    )
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
    }

    sociallogin = _stub_sociallogin(email="alice@x.com")
    adapter = SlotflowSocialAccountAdapter()

    with pytest.raises(ImmediateHttpResponse) as exc_info:
        adapter.pre_social_login(request, sociallogin)
    assert "?error=user_exists" in exc_info.value.response["Location"]
    assert AuditEvent.objects.filter(action="invite.rejected_user_exists").count() == 1


@pytest.mark.django_db
def test_pre_social_login_passes_when_email_matches_and_user_new(invite_in_session):
    raw, hashed, _ = invite_in_session
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
    }

    sociallogin = _stub_sociallogin(email="alice@x.com")
    adapter = SlotflowSocialAccountAdapter()
    adapter.pre_social_login(request, sociallogin)


@pytest.mark.django_db
def test_pre_social_login_redirects_unknown_oauth_user_when_no_invite():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    sociallogin = _stub_sociallogin(email="stranger@x.com", is_existing=False)

    adapter = SlotflowSocialAccountAdapter()
    with pytest.raises(ImmediateHttpResponse) as exc_info:
        adapter.pre_social_login(request, sociallogin)
    assert "/login?error=no_account" in exc_info.value.response["Location"]


@pytest.mark.django_db
def test_pre_social_login_passes_existing_user_login_with_no_invite():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    sociallogin = _stub_sociallogin(email="alice@x.com", is_existing=True)

    adapter = SlotflowSocialAccountAdapter()
    adapter.pre_social_login(request, sociallogin)


# --- save_user --------------------------------------------------------------


def _save_user_request(invite_in_session, terms):
    raw, hashed, _ = invite_in_session
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {
        "pending_invite_token_hash": hashed,
        "pending_invite_raw_token": raw,
        "workspace_name": "Alice's WS",
        "accepted_terms_version_id": terms.id,
    }
    return request, raw, hashed


@pytest.mark.django_db
def test_save_user_creates_user_workspace_membership_and_audit(invite_in_session):
    TermsVersion.objects.all().delete()
    terms = TermsVersion.objects.create(
        version="1.0",
        body="t",
        effective_at=timezone.now(),
    )
    request, raw, hashed = _save_user_request(invite_in_session, terms)

    User = get_user_model()
    new_user = User(username="alice@x.com", email="alice@x.com")
    saved_links: list = []
    sociallogin = SimpleNamespace(
        user=new_user,
        account=SimpleNamespace(provider="google", extra_data={"amr": ["pwd"]}),
        token=SimpleNamespace(token=""),
        is_existing=False,
        connect=lambda req, user: saved_links.append(user),
    )

    adapter = SlotflowSocialAccountAdapter()
    saved = adapter.save_user(request, sociallogin, form=None)

    assert saved.pk is not None
    assert saved.email == "alice@x.com"
    assert saved.username == "alice@x.com"
    assert saved.has_usable_password() is False
    assert saved.accepted_terms_version_id == terms.id

    inv = Invite.objects.get(token_hash=hashed)
    assert inv.status == Invite.Status.ACCEPTED
    assert inv.accepted_by_id == saved.pk

    from tenancy.models import Membership, MembershipRole, Workspace

    ws = Workspace.objects.get(pk=inv.workspace_id)
    assert ws.name == "Alice's WS"
    assert Membership.objects.filter(user=saved, workspace=ws, role=MembershipRole.OWNER).exists()

    actions = set(AuditEvent.objects.values_list("action", flat=True))
    assert {"invite.accepted", "user.created", "terms.accepted"}.issubset(actions)
    assert saved_links == [saved]


@pytest.mark.django_db
def test_save_user_sets_oauth_mfa_when_amr_includes_mfa(invite_in_session):
    TermsVersion.objects.all().delete()
    terms = TermsVersion.objects.create(
        version="1.0",
        body="t",
        effective_at=timezone.now(),
    )
    request, _, _ = _save_user_request(invite_in_session, terms)

    User = get_user_model()
    sociallogin = SimpleNamespace(
        user=User(username="alice@x.com", email="alice@x.com"),
        account=SimpleNamespace(provider="google", extra_data={"amr": ["mfa"]}),
        token=SimpleNamespace(token=""),
        is_existing=False,
        connect=lambda req, u: None,
    )

    user = SlotflowSocialAccountAdapter().save_user(request, sociallogin, form=None)
    assert request.session["oauth_mfa_user_id"] == user.pk
    assert AuditEvent.objects.filter(action="oauth.mfa_satisfied").count() == 1


@pytest.mark.django_db
def test_save_user_skips_mfa_session_flag_when_amr_missing(invite_in_session):
    TermsVersion.objects.all().delete()
    terms = TermsVersion.objects.create(
        version="1.0",
        body="t",
        effective_at=timezone.now(),
    )
    request, _, _ = _save_user_request(invite_in_session, terms)

    User = get_user_model()
    sociallogin = SimpleNamespace(
        user=User(username="alice@x.com", email="alice@x.com"),
        account=SimpleNamespace(provider="google", extra_data={"amr": ["pwd"]}),
        token=SimpleNamespace(token=""),
        is_existing=False,
        connect=lambda req, u: None,
    )

    SlotflowSocialAccountAdapter().save_user(request, sociallogin, form=None)
    assert "oauth_mfa_user_id" not in request.session
    assert AuditEvent.objects.filter(action="oauth.mfa_satisfied").count() == 0


@pytest.mark.django_db
def test_save_user_pops_session_keys(invite_in_session):
    TermsVersion.objects.all().delete()
    terms = TermsVersion.objects.create(
        version="1.0",
        body="t",
        effective_at=timezone.now(),
    )
    request, _, _ = _save_user_request(invite_in_session, terms)

    User = get_user_model()
    sociallogin = SimpleNamespace(
        user=User(username="alice@x.com", email="alice@x.com"),
        account=SimpleNamespace(provider="google", extra_data={}),
        token=SimpleNamespace(token=""),
        is_existing=False,
        connect=lambda req, u: None,
    )

    SlotflowSocialAccountAdapter().save_user(request, sociallogin, form=None)
    for key in (
        "pending_invite_token_hash",
        "pending_invite_raw_token",
        "workspace_name",
        "accepted_terms_version_id",
    ):
        assert key not in request.session


# --- authentication_error --------------------------------------------------


@pytest.mark.django_db
def test_authentication_error_redirects_to_accept_invite_when_token_in_session():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {"pending_invite_raw_token": "raw-tok"}
    adapter = SlotflowSocialAccountAdapter()

    response = adapter.authentication_error(
        request,
        provider_id="google",
        error=None,
        exception=None,
        extra_context=None,
    )
    assert response.status_code in (301, 302)
    assert "/accept-invite/raw-tok/?error=oauth_failed" in response["Location"]


@pytest.mark.django_db
def test_authentication_error_redirects_to_login_when_no_invite():
    rf = RequestFactory()
    request = rf.get("/")
    request.session = {}
    adapter = SlotflowSocialAccountAdapter()

    response = adapter.authentication_error(
        request,
        provider_id="google",
        error=None,
        exception=None,
        extra_context=None,
    )
    assert response.status_code in (301, 302)
    assert "/login?error=oauth_failed" in response["Location"]
