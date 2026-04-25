from __future__ import annotations

import pytest
from django.db import IntegrityError

from interviews.models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepResume,
)
from opportunities.models import Opportunity
from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _opp(ws):
    return Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")


def _step(ws):
    cycle = InterviewCycle.objects.create(opportunity=_opp(ws), name="loop")
    return InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.PHONE)


def _resume_version(ws):
    base = BaseResume.objects.create(workspace=ws, name="Senior Eng")
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=1,
        document={"basics": {}},
        document_hash="x" * 64,
    )


def test_create_minimum_fields_defaults():
    ws = _ws()
    link = InterviewStepResume.objects.create(step=_step(ws), resume_version=_resume_version(ws))
    link.refresh_from_db()
    assert link.note == ""
    assert link.created_by is None


def test_unique_constraint_blocks_duplicate_step_version():
    ws = _ws()
    step = _step(ws)
    version = _resume_version(ws)
    InterviewStepResume.objects.create(step=step, resume_version=version)
    with pytest.raises(IntegrityError):
        InterviewStepResume.objects.create(step=step, resume_version=version)
