from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from interviews.models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepResume,
)
from opportunities.models import Opportunity
from resumes.models import BaseResume, ResumeVersion
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _ws(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, ws, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=ws, role=role)


def _step(ws, kind=InterviewStepKind.PHONE):
    opp = Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")
    cycle = InterviewCycle.objects.create(opportunity=opp, name="loop")
    return InterviewStep.objects.create(cycle=cycle, sequence=1, kind=kind)


def _resume_version(ws, name="Senior Eng"):
    base = BaseResume.objects.create(workspace=ws, name=name)
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=1,
        document={"basics": {}},
        document_hash="x" * 64,
    )


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


def test_anonymous_list_returns_403_or_401():
    response = _client().get("/api/interview-step-resumes/")
    assert response.status_code in (401, 403)


def test_list_returns_only_callers_workspace_links():
    alice = _user("alice")
    bob = _user("bob")
    ws_a = _ws("ws-a")
    ws_b = _ws("ws-b")
    _join(alice, ws_a)
    _join(bob, ws_b)
    InterviewStepResume.objects.create(step=_step(ws_a), resume_version=_resume_version(ws_a))
    InterviewStepResume.objects.create(step=_step(ws_b), resume_version=_resume_version(ws_b))

    response = _client(alice).get("/api/interview-step-resumes/")
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_list_filter_by_step():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    s1 = _step(ws)
    cycle2 = InterviewCycle.objects.create(
        opportunity=Opportunity.objects.create(workspace=ws, title="O2", company="C"),
        name="loop2",
    )
    s2 = InterviewStep.objects.create(cycle=cycle2, sequence=1, kind=InterviewStepKind.PHONE)
    v1 = _resume_version(ws, name="A")
    v2 = _resume_version(ws, name="B")
    InterviewStepResume.objects.create(step=s1, resume_version=v1)
    InterviewStepResume.objects.create(step=s2, resume_version=v2)

    response = _client(alice).get(f"/api/interview-step-resumes/?step={s1.pk}")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["step"] == str(s1.pk)


def test_list_filter_by_cycle():
    """`?cycle=<uuid>` returns links across all steps in that cycle so the
    FE can fetch once per cycle and bucket client-side instead of issuing
    one network request per step (the N+1 case)."""
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    opp = Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")
    cycle_a = InterviewCycle.objects.create(opportunity=opp, name="A")
    cycle_b = InterviewCycle.objects.create(opportunity=opp, name="B")
    step_a1 = InterviewStep.objects.create(cycle=cycle_a, sequence=1, kind=InterviewStepKind.PHONE)
    step_a2 = InterviewStep.objects.create(
        cycle=cycle_a, sequence=2, kind=InterviewStepKind.TECHNICAL
    )
    step_b = InterviewStep.objects.create(cycle=cycle_b, sequence=1, kind=InterviewStepKind.PHONE)
    InterviewStepResume.objects.create(step=step_a1, resume_version=_resume_version(ws, name="A1"))
    InterviewStepResume.objects.create(step=step_a2, resume_version=_resume_version(ws, name="A2"))
    InterviewStepResume.objects.create(step=step_b, resume_version=_resume_version(ws, name="B"))

    response = _client(alice).get(f"/api/interview-step-resumes/?cycle={cycle_a.pk}")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    step_ids = {row["step"] for row in body}
    assert step_ids == {str(step_a1.pk), str(step_a2.pk)}


def test_list_invalid_cycle_uuid_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).get("/api/interview-step-resumes/?cycle=nope")
    assert response.status_code == 400


def test_list_invalid_step_uuid_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).get("/api/interview-step-resumes/?step=nope")
    assert response.status_code == 400


def test_list_renders_resume_version_summary():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    version = _resume_version(ws, name="Senior Eng — backend")
    InterviewStepResume.objects.create(step=_step(ws), resume_version=version)

    response = _client(alice).get("/api/interview-step-resumes/")
    assert response.status_code == 200
    summary = response.json()[0]["resume_version_summary"]
    assert summary["base_resume_name"] == "Senior Eng — backend"
    assert summary["version_number"] == 1


def test_list_query_count_does_not_scale_with_link_count():
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    alice = _user()
    ws = _ws()
    _join(alice, ws)
    for i in range(5):
        InterviewStepResume.objects.create(
            step=_step(ws), resume_version=_resume_version(ws, name=f"R{i}")
        )

    client = _client(alice)
    with CaptureQueriesContext(connection) as ctx:
        response = client.get("/api/interview-step-resumes/")
    assert response.status_code == 200
    assert len(response.json()) == 5
    assert len(ctx) <= 8, [q["sql"] for q in ctx]


def test_create_link_succeeds():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    step = _step(ws)
    version = _resume_version(ws)

    response = _client(alice).post(
        "/api/interview-step-resumes/",
        data={"step": str(step.pk), "resume_version": str(version.pk), "note": "ref"},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["note"] == "ref"
    assert body["resume_version_summary"]["version_number"] == 1


def test_create_duplicate_link_returns_400_not_500():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    step = _step(ws)
    version = _resume_version(ws)
    payload = {"step": str(step.pk), "resume_version": str(version.pk)}
    first = _client(alice).post("/api/interview-step-resumes/", data=payload, format="json")
    assert first.status_code == 201

    second = _client(alice).post("/api/interview-step-resumes/", data=payload, format="json")
    assert second.status_code == 400
    assert "non_field_errors" in second.json()


def test_create_rejects_cross_workspace_resume_version():
    alice = _user()
    ws_a = _ws("ws-a")
    ws_b = _ws("ws-b")
    _join(alice, ws_a)
    _join(alice, ws_b)
    step_a = _step(ws_a)
    version_b = _resume_version(ws_b)

    response = _client(alice).post(
        "/api/interview-step-resumes/",
        data={"step": str(step_a.pk), "resume_version": str(version_b.pk)},
        format="json",
    )
    assert response.status_code == 400
    assert "resume_version" in response.json()


def test_create_forbidden_for_viewer():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    step = _step(ws)
    version = _resume_version(ws)

    response = _client(alice).post(
        "/api/interview-step-resumes/",
        data={"step": str(step.pk), "resume_version": str(version.pk)},
        format="json",
    )
    assert response.status_code == 403


def test_delete_link_returns_204_and_removes_row():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    link = InterviewStepResume.objects.create(step=_step(ws), resume_version=_resume_version(ws))

    response = _client(alice).delete(f"/api/interview-step-resumes/{link.pk}/")
    assert response.status_code == 204
    assert InterviewStepResume.objects.filter(pk=link.pk).count() == 0


def test_delete_link_forbidden_for_viewer():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    link = InterviewStepResume.objects.create(step=_step(ws), resume_version=_resume_version(ws))

    response = _client(alice).delete(f"/api/interview-step-resumes/{link.pk}/")
    assert response.status_code == 403


def test_delete_link_in_other_workspace_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _ws("ws-bob")
    _join(bob, ws_b)
    link = InterviewStepResume.objects.create(
        step=_step(ws_b), resume_version=_resume_version(ws_b)
    )
    response = _client(alice).delete(f"/api/interview-step-resumes/{link.pk}/")
    assert response.status_code == 404
