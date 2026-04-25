from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model

from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def test_create_with_minimum_fields():
    ws = _workspace()
    r = BaseResume.objects.create(workspace=ws, name="Senior Eng — backend")
    r.refresh_from_db()
    assert r.workspace_id == ws.pk
    assert r.created_by is None
    assert r.created_at is not None


def test_str_includes_name_and_workspace_slug():
    ws = _workspace("acme")
    r = BaseResume.objects.create(workspace=ws, name="Staff Eng")
    assert str(r) == "Staff Eng (acme)"


def test_workspace_delete_cascades():
    ws = _workspace()
    BaseResume.objects.create(workspace=ws, name="r1")
    assert BaseResume.objects.count() == 1
    ws.delete()
    assert BaseResume.objects.count() == 0


def test_creator_delete_nullifies_created_by():
    ws = _workspace()
    user = _user()
    r = BaseResume.objects.create(workspace=ws, name="r1", created_by=user)
    user.delete()
    r.refresh_from_db()
    assert r.created_by is None
    assert BaseResume.objects.filter(pk=r.pk).exists()


def test_default_ordering_is_newest_first():
    ws = _workspace()
    older = BaseResume.objects.create(workspace=ws, name="older")
    newer = BaseResume.objects.create(workspace=ws, name="newer")
    ordered = list(BaseResume.objects.all())
    assert ordered[0].pk == newer.pk
    assert ordered[1].pk == older.pk


def test_two_workspaces_can_share_a_resume_name():
    ws_a = _workspace("ws-a")
    ws_b = _workspace("ws-b")
    BaseResume.objects.create(workspace=ws_a, name="Senior Eng")
    BaseResume.objects.create(workspace=ws_b, name="Senior Eng")
    assert BaseResume.objects.filter(name="Senior Eng").count() == 2


def test_archived_at_defaults_to_none():
    ws = _workspace()
    r = BaseResume.objects.create(workspace=ws, name="r1")
    r.refresh_from_db()
    assert r.archived_at is None


def test_archived_at_round_trip():
    from django.utils import timezone

    ws = _workspace()
    r = BaseResume.objects.create(workspace=ws, name="r1")
    stamp = timezone.now()
    r.archived_at = stamp
    r.save(update_fields=["archived_at"])
    r.refresh_from_db()
    assert r.archived_at == stamp


def test_versions_related_name_is_versions():
    ws = _workspace()
    r = BaseResume.objects.create(workspace=ws, name="r1")
    ResumeVersion.objects.create(
        base_resume=r,
        version_number=1,
        document={"basics": {"name": "Alice"}},
        document_hash="x" * 64,
    )
    assert r.versions.count() == 1
