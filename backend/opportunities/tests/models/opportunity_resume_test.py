from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from opportunities.models import (
    Opportunity,
    OpportunityResume,
    OpportunityResumeRole,
)
from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _opp(ws):
    return Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")


def _resume_version(ws, version_number=1):
    base = BaseResume.objects.create(workspace=ws, name="Senior Eng")
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=version_number,
        document={"basics": {}},
        document_hash="x" * 64,
    )


def test_create_minimum_fields_defaults():
    ws = _ws()
    link = OpportunityResume.objects.create(
        opportunity=_opp(ws),
        resume_version=_resume_version(ws),
        role=OpportunityResumeRole.SUBMITTED,
    )
    link.refresh_from_db()
    assert link.note == ""
    assert link.created_by is None
    assert link.created_at is not None


def test_unique_constraint_blocks_same_opp_version_role():
    ws = _ws()
    opp = _opp(ws)
    version = _resume_version(ws)
    OpportunityResume.objects.create(
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
    )
    with pytest.raises(IntegrityError):
        OpportunityResume.objects.create(
            opportunity=opp,
            resume_version=version,
            role=OpportunityResumeRole.SUBMITTED,
        )


def test_two_roles_for_same_opp_version_pair_allowed():
    """Same version can be both Submitted AND Used internally on one opp."""
    ws = _ws()
    opp = _opp(ws)
    version = _resume_version(ws)
    OpportunityResume.objects.create(
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
    )
    OpportunityResume.objects.create(
        opportunity=opp,
        resume_version=version,
        role=OpportunityResumeRole.USED_INTERNALLY,
    )
    assert OpportunityResume.objects.filter(opportunity=opp).count() == 2
