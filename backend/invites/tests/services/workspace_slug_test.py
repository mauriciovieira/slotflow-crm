from __future__ import annotations

import pytest

from invites.services.workspace_slug import create_unique_workspace
from tenancy.models import Workspace


@pytest.mark.django_db
def test_create_unique_workspace_uses_local_part():
    ws = create_unique_workspace(name="Alice WS", email="alice@x.com")
    assert ws.slug == "alice"


@pytest.mark.django_db
def test_create_unique_workspace_strips_unsafe_chars():
    ws = create_unique_workspace(name="Alice WS", email="Alice.Smith+tag@x.com")
    assert ws.slug == "alice-smith-tag"


@pytest.mark.django_db
def test_create_unique_workspace_appends_suffix_on_collision():
    Workspace.objects.create(name="x", slug="alice")
    Workspace.objects.create(name="x", slug="alice-2")

    ws = create_unique_workspace(name="Alice WS", email="alice@y.com")
    assert ws.slug == "alice-3"


@pytest.mark.django_db
def test_create_unique_workspace_falls_back_to_user_when_local_part_empty():
    ws = create_unique_workspace(name="x", email="@x.com")
    assert ws.slug.startswith("user")
