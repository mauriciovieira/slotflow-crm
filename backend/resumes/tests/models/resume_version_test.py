from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _base(ws=None, name="r1", slug="ws-a"):
    workspace = ws if ws is not None else _workspace(slug)
    return BaseResume.objects.create(workspace=workspace, name=name)


def _version(base, version_number=1, **overrides):
    defaults = {
        "base_resume": base,
        "version_number": version_number,
        "document": {"basics": {"name": "Alice"}},
        "document_hash": "a" * 64,
    }
    defaults.update(overrides)
    return ResumeVersion.objects.create(**defaults)


def test_create_with_minimum_fields_and_document_round_trip():
    base = _base()
    v = _version(base, document={"basics": {"name": "Alice"}, "skills": []})
    v.refresh_from_db()
    assert v.version_number == 1
    assert v.document == {"basics": {"name": "Alice"}, "skills": []}
    assert v.notes == ""
    assert v.created_by is None


def test_unique_version_number_per_base_resume():
    base = _base()
    _version(base, version_number=1)
    with pytest.raises(IntegrityError):
        _version(base, version_number=1, document_hash="b" * 64)


def test_version_number_one_can_exist_in_each_base():
    base_a = _base(name="a", slug="ws-a")
    base_b = _base(name="b", slug="ws-b")
    _version(base_a, version_number=1)
    _version(base_b, version_number=1)
    assert ResumeVersion.objects.filter(version_number=1).count() == 2


def test_base_resume_delete_cascades_to_versions():
    base = _base()
    _version(base, version_number=1)
    _version(base, version_number=2, document_hash="b" * 64)
    assert ResumeVersion.objects.count() == 2
    base.delete()
    assert ResumeVersion.objects.count() == 0


def test_default_ordering_is_highest_version_first():
    base = _base()
    older = _version(base, version_number=1)
    newer = _version(base, version_number=2, document_hash="b" * 64)
    ordered = list(ResumeVersion.objects.all())
    assert ordered[0].pk == newer.pk
    assert ordered[1].pk == older.pk


def test_creator_delete_nullifies_created_by_and_preserves_row():
    base = _base()
    user = _user()
    v = _version(base, version_number=1, created_by=user)
    user.delete()
    v.refresh_from_db()
    assert v.created_by is None
    assert ResumeVersion.objects.filter(pk=v.pk).exists()


def test_str_includes_base_id_and_version_number():
    base = _base()
    v = _version(base, version_number=3)
    assert str(v) == f"{base.pk} v3"
