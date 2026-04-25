from __future__ import annotations

import io

import pytest
from django.core.management import CommandError, call_command

from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _version(ws, document=None):
    base = BaseResume.objects.create(workspace=ws, name="Senior Eng")
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=1,
        document=document or {"basics": {"name": "Alice"}},
        document_hash="x" * 64,
    )


def test_command_writes_html_to_stdout():
    ws = _ws()
    v = _version(ws)
    out = io.StringIO()

    call_command("render_resume_html", str(v.pk), stdout=out)

    rendered = out.getvalue()
    assert "Alice" in rendered
    assert "<html" in rendered


def test_command_writes_html_to_file(tmp_path):
    ws = _ws()
    v = _version(ws)
    target = tmp_path / "resume.html"

    out = io.StringIO()
    call_command("render_resume_html", str(v.pk), "--out", str(target), stdout=out)

    assert target.read_text(encoding="utf-8").startswith("<!DOCTYPE html>")
    assert "Alice" in target.read_text(encoding="utf-8")
    assert "Rendered" in out.getvalue()


def test_command_rejects_missing_version():
    with pytest.raises(CommandError, match="not found"):
        call_command("render_resume_html", "00000000-0000-0000-0000-000000000000")


def test_command_rejects_invalid_uuid():
    with pytest.raises(CommandError, match="not found"):
        call_command("render_resume_html", "not-a-uuid")


def test_command_rejects_archived_base_resume():
    from django.utils import timezone

    ws = _ws()
    v = _version(ws)
    base = v.base_resume
    base.archived_at = timezone.now()
    base.save(update_fields=["archived_at"])

    with pytest.raises(CommandError, match="not found"):
        call_command("render_resume_html", str(v.pk))
