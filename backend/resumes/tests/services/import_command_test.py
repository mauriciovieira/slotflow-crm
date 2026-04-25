from __future__ import annotations

import io
import json

import pytest
from django.core.management import CommandError, call_command

from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _base(ws):
    return BaseResume.objects.create(workspace=ws, name="Senior Eng")


def test_command_imports_from_file(tmp_path):
    ws = _ws()
    base = _base(ws)
    payload = {"basics": {"name": "Alice"}}
    path = tmp_path / "resume.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    out = io.StringIO()

    call_command("import_resume_json", str(base.pk), str(path), stdout=out)

    assert ResumeVersion.objects.filter(base_resume=base).count() == 1
    assert "Imported v1" in out.getvalue()


def test_command_imports_from_stdin(monkeypatch):
    ws = _ws()
    base = _base(ws)
    payload = {"basics": {"name": "Alice"}}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(payload)))
    out = io.StringIO()

    call_command("import_resume_json", str(base.pk), "-", stdout=out)

    assert ResumeVersion.objects.filter(base_resume=base).count() == 1


def test_command_rejects_invalid_json(tmp_path):
    ws = _ws()
    base = _base(ws)
    path = tmp_path / "bad.json"
    path.write_text("not json", encoding="utf-8")

    with pytest.raises(CommandError, match="Invalid JSON"):
        call_command("import_resume_json", str(base.pk), str(path))


def test_command_rejects_non_object_document(tmp_path):
    ws = _ws()
    base = _base(ws)
    path = tmp_path / "list.json"
    path.write_text("[1,2,3]", encoding="utf-8")

    with pytest.raises(CommandError, match="JSON object"):
        call_command("import_resume_json", str(base.pk), str(path))


def test_command_rejects_archived_base_resume(tmp_path):
    """The command must not silently land a new version on an archived
    base resume — the API/UI hide archived rows, the command should too."""
    from django.utils import timezone

    ws = _ws()
    base = _base(ws)
    base.archived_at = timezone.now()
    base.save(update_fields=["archived_at"])
    path = tmp_path / "x.json"
    path.write_text("{}", encoding="utf-8")

    with pytest.raises(CommandError, match="not found"):
        call_command("import_resume_json", str(base.pk), str(path))


def test_command_rejects_unknown_base_resume(tmp_path):
    path = tmp_path / "x.json"
    path.write_text("{}", encoding="utf-8")

    with pytest.raises(CommandError, match="not found"):
        call_command(
            "import_resume_json",
            "00000000-0000-0000-0000-000000000000",
            str(path),
        )
