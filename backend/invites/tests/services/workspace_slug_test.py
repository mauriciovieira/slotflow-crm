from __future__ import annotations

import pytest

from invites.services.workspace_slug import unique_slug_from_email
from tenancy.models import Workspace


@pytest.mark.django_db
def test_unique_slug_from_email_uses_local_part():
    assert unique_slug_from_email("alice@x.com") == "alice"


@pytest.mark.django_db
def test_unique_slug_strips_unsafe_chars():
    assert unique_slug_from_email("Alice.Smith+tag@x.com") == "alice-smith-tag"


@pytest.mark.django_db
def test_unique_slug_appends_suffix_on_collision():
    Workspace.objects.create(name="x", slug="alice")
    Workspace.objects.create(name="x", slug="alice-2")

    assert unique_slug_from_email("alice@y.com") == "alice-3"


@pytest.mark.django_db
def test_unique_slug_falls_back_to_user_when_local_part_empty():
    assert unique_slug_from_email("@x.com").startswith("user")
