from __future__ import annotations

import pytest
from django.test import RequestFactory

from invites.adapters import SlotflowAccountAdapter, SlotflowSocialAccountAdapter


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
