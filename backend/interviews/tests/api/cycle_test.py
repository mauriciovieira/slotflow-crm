from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from interviews.models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepStatus,
)
from opportunities.models import Opportunity
from tenancy.models import Membership, MembershipRole, Workspace

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _bypass_2fa_middleware(monkeypatch):
    monkeypatch.setattr("core.middleware.require_2fa.is_2fa_bypass_active", lambda: True)


def _user(username="alice"):
    return get_user_model().objects.create_user(
        username=username, email=f"{username}@example.com", password="x"
    )


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _join(user, ws, role=MembershipRole.OWNER):
    return Membership.objects.create(user=user, workspace=ws, role=role)


def _opportunity(ws, title="Staff Eng", company="Acme"):
    return Opportunity.objects.create(workspace=ws, title=title, company=company)


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


# -- Auth gate ----------------------------------------------------------------


def test_anonymous_list_returns_403_or_401():
    response = _client().get("/api/interview-cycles/")
    assert response.status_code in (401, 403)


# -- List ---------------------------------------------------------------------


def test_list_returns_only_callers_workspace_rows():
    alice = _user("alice")
    bob = _user("bob")
    ws_a = _workspace("ws-alice")
    ws_b = _workspace("ws-bob")
    _join(alice, ws_a)
    _join(bob, ws_b)
    InterviewCycle.objects.create(opportunity=_opportunity(ws_a, "A1"), name="Loop A")
    InterviewCycle.objects.create(opportunity=_opportunity(ws_b, "B1"), name="Loop B")

    response = _client(alice).get("/api/interview-cycles/")
    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert names == ["Loop A"]


def test_list_filter_by_opportunity():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    op_a = _opportunity(ws, "A")
    op_b = _opportunity(ws, "B")
    InterviewCycle.objects.create(opportunity=op_a, name="A loop")
    InterviewCycle.objects.create(opportunity=op_b, name="B loop")

    response = _client(alice).get(f"/api/interview-cycles/?opportunity={op_a.pk}")
    assert response.status_code == 200
    names = [r["name"] for r in response.json()]
    assert names == ["A loop"]


def test_list_filter_invalid_opportunity_uuid_returns_400():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    response = _client(alice).get("/api/interview-cycles/?opportunity=nope")
    assert response.status_code == 400


def test_list_renders_steps_count_and_last_step_status():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")
    InterviewStep.objects.create(
        cycle=cycle,
        sequence=1,
        kind=InterviewStepKind.PHONE,
        status=InterviewStepStatus.COMPLETED,
    )
    InterviewStep.objects.create(
        cycle=cycle,
        sequence=2,
        kind=InterviewStepKind.TECHNICAL,
        status=InterviewStepStatus.SCHEDULED,
    )

    response = _client(alice).get("/api/interview-cycles/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["steps_count"] == 2
    assert body[0]["last_step_status"] == InterviewStepStatus.SCHEDULED
    assert body[0]["opportunity_title"] == "Staff Eng"
    assert body[0]["opportunity_company"] == "Acme"


def test_list_with_no_steps_does_not_fall_back_to_extra_query():
    """The Subquery annotation is NULL when a cycle has no steps. The
    serializer must distinguish that from 'annotation missing' so it
    returns `None` directly instead of issuing a fallback `obj.steps`
    query — keeping list queries flat for step-less cycles."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    for i in range(3):
        InterviewCycle.objects.create(opportunity=_opportunity(ws, f"O{i}"), name=f"L{i}")

    client = _client(alice)
    with CaptureQueriesContext(connection) as ctx:
        response = client.get("/api/interview-cycles/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    for row in body:
        assert row["steps_count"] == 0
        assert row["last_step_status"] is None
    assert len(ctx) <= 8, [q["sql"] for q in ctx]


def test_list_renders_opportunity_title_and_company():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    InterviewCycle.objects.create(
        opportunity=_opportunity(ws, "Staff Eng", "Acme"),
        name="loop",
    )

    response = _client(alice).get("/api/interview-cycles/")
    assert response.status_code == 200
    body = response.json()
    assert body[0]["opportunity_title"] == "Staff Eng"
    assert body[0]["opportunity_company"] == "Acme"


def test_serializer_falls_back_when_annotations_absent():
    """Direct serializer use (no viewset queryset) must still produce
    correct `steps_count` / `last_step_status` via the related manager —
    covers service-layer / admin-side callers."""
    from interviews.serializers import InterviewCycleSerializer

    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")
    InterviewStep.objects.create(
        cycle=cycle,
        sequence=1,
        kind=InterviewStepKind.PHONE,
        status=InterviewStepStatus.COMPLETED,
    )

    instance = InterviewCycle.objects.get(pk=cycle.pk)
    assert not hasattr(instance, "_steps_count")
    rendered = InterviewCycleSerializer(instance).data
    assert rendered["steps_count"] == 1
    assert rendered["last_step_status"] == InterviewStepStatus.COMPLETED


def test_list_query_count_does_not_scale_with_cycle_count():
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    for i in range(5):
        c = InterviewCycle.objects.create(opportunity=_opportunity(ws, f"O{i}"), name=f"L{i}")
        InterviewStep.objects.create(cycle=c, sequence=1, kind=InterviewStepKind.PHONE)

    client = _client(alice)
    with CaptureQueriesContext(connection) as ctx:
        response = client.get("/api/interview-cycles/")
    assert response.status_code == 200
    assert len(response.json()) == 5
    # Annotation-based: a list of 5 cycles must not trigger N+1.
    assert len(ctx) <= 8, [q["sql"] for q in ctx]


# -- Create -------------------------------------------------------------------


def test_create_cycle_succeeds():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    opp = _opportunity(ws)

    response = _client(alice).post(
        "/api/interview-cycles/",
        data={"opportunity": str(opp.pk), "name": "Onsite loop"},
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["name"] == "Onsite loop"
    assert body["opportunity"] == str(opp.pk)
    assert body["started_at"] is not None
    assert body["steps_count"] == 0
    assert body["last_step_status"] is None


def test_create_cycle_rejects_opportunity_in_other_workspace():
    alice = _user("alice")
    other_ws = _workspace("ws-other")
    other_opp = _opportunity(other_ws, "Other")

    response = _client(alice).post(
        "/api/interview-cycles/",
        data={"opportunity": str(other_opp.pk), "name": "x"},
        format="json",
    )
    # Serializer's validate_opportunity rejects → 400.
    assert response.status_code == 400


def test_create_cycle_forbidden_for_viewer():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    opp = _opportunity(ws)

    response = _client(alice).post(
        "/api/interview-cycles/",
        data={"opportunity": str(opp.pk), "name": "x"},
        format="json",
    )
    assert response.status_code == 403


# -- Retrieve / 404 ----------------------------------------------------------


def test_retrieve_cross_workspace_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _workspace("ws-bob")
    _join(bob, ws_b)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws_b), name="B")

    response = _client(alice).get(f"/api/interview-cycles/{cycle.pk}/")
    assert response.status_code == 404


def test_patch_cycle_name():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="old")

    response = _client(alice).patch(
        f"/api/interview-cycles/{cycle.pk}/",
        data={"name": "new"},
        format="json",
    )
    assert response.status_code == 200
    cycle.refresh_from_db()
    assert cycle.name == "new"


def test_patch_cannot_change_opportunity():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    op_a = _opportunity(ws, "A")
    op_b = _opportunity(ws, "B")
    cycle = InterviewCycle.objects.create(opportunity=op_a, name="loop")

    response = _client(alice).patch(
        f"/api/interview-cycles/{cycle.pk}/",
        data={"opportunity": str(op_b.pk)},
        format="json",
    )
    assert response.status_code == 200
    cycle.refresh_from_db()
    # Opportunity is write-once: PATCH must not move the cycle.
    assert cycle.opportunity_id == op_a.pk


# -- Steps endpoint ----------------------------------------------------------


def test_steps_list_returns_in_sequence_order():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")
    InterviewStep.objects.create(cycle=cycle, sequence=2, kind=InterviewStepKind.TECHNICAL)
    InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.PHONE)

    response = _client(alice).get(f"/api/interview-cycles/{cycle.pk}/steps/")
    assert response.status_code == 200
    nums = [r["sequence"] for r in response.json()]
    assert nums == [1, 2]


def test_steps_create_assigns_next_sequence():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")

    response = _client(alice).post(
        f"/api/interview-cycles/{cycle.pk}/steps/",
        data={"kind": InterviewStepKind.PHONE},
        format="json",
    )
    assert response.status_code == 201, response.content
    assert response.json()["sequence"] == 1
    assert response.json()["status"] == InterviewStepStatus.SCHEDULED


def test_steps_create_rejects_unknown_kind():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")

    response = _client(alice).post(
        f"/api/interview-cycles/{cycle.pk}/steps/",
        data={"kind": "not-a-kind"},
        format="json",
    )
    assert response.status_code == 400


def test_steps_endpoint_404_when_cycle_in_other_workspace():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _workspace("ws-bob")
    _join(bob, ws_b)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws_b), name="loop")
    response = _client(alice).get(f"/api/interview-cycles/{cycle.pk}/steps/")
    assert response.status_code == 404


def test_step_status_patch_succeeds():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")
    step = InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.PHONE)

    response = _client(alice).patch(
        f"/api/interview-cycles/{cycle.pk}/steps/{step.pk}/status/",
        data={"status": InterviewStepStatus.COMPLETED, "notes": "good"},
        format="json",
    )
    assert response.status_code == 200
    step.refresh_from_db()
    assert step.status == InterviewStepStatus.COMPLETED
    assert step.notes == "good"


def test_step_status_patch_rejects_invalid_value():
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")
    step = InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.PHONE)

    response = _client(alice).patch(
        f"/api/interview-cycles/{cycle.pk}/steps/{step.pk}/status/",
        data={"status": "boom"},
        format="json",
    )
    assert response.status_code == 400


def test_step_status_patch_forbidden_for_viewer():
    alice = _user()
    ws = _workspace()
    _join(alice, ws, role=MembershipRole.VIEWER)
    cycle = InterviewCycle.objects.create(opportunity=_opportunity(ws), name="loop")
    step = InterviewStep.objects.create(cycle=cycle, sequence=1, kind=InterviewStepKind.PHONE)

    response = _client(alice).patch(
        f"/api/interview-cycles/{cycle.pk}/steps/{step.pk}/status/",
        data={"status": InterviewStepStatus.COMPLETED},
        format="json",
    )
    assert response.status_code == 403


def test_step_status_patch_404_when_step_in_other_cycle():
    """Step pk that exists but belongs to a different cycle in the URL must
    surface as 404, not silently update the wrong row."""
    alice = _user()
    ws = _workspace()
    _join(alice, ws)
    c1 = InterviewCycle.objects.create(opportunity=_opportunity(ws, "A"), name="L1")
    c2 = InterviewCycle.objects.create(opportunity=_opportunity(ws, "B"), name="L2")
    step_in_c2 = InterviewStep.objects.create(cycle=c2, sequence=1, kind=InterviewStepKind.PHONE)

    response = _client(alice).patch(
        f"/api/interview-cycles/{c1.pk}/steps/{step_in_c2.pk}/status/",
        data={"status": InterviewStepStatus.COMPLETED},
        format="json",
    )
    assert response.status_code == 404
