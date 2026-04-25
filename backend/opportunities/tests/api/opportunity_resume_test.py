from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from opportunities.models import (
    Opportunity,
    OpportunityResume,
    OpportunityResumeRole,
)
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


def _opp(ws):
    return Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")


def _resume_version(ws, name="Senior Eng", version_number=1):
    base = BaseResume.objects.create(workspace=ws, name=name)
    return ResumeVersion.objects.create(
        base_resume=base,
        version_number=version_number,
        document={"basics": {}},
        document_hash=f"{version_number:0>64}",
    )


def _client(user=None) -> APIClient:
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


# -- Auth gate ---------------------------------------------------------------


def test_anonymous_list_returns_403_or_401():
    response = _client().get("/api/opportunity-resumes/")
    assert response.status_code in (401, 403)


# -- List --------------------------------------------------------------------


def test_list_returns_only_callers_workspace_links():
    alice = _user("alice")
    bob = _user("bob")
    ws_a = _ws("ws-a")
    ws_b = _ws("ws-b")
    _join(alice, ws_a)
    _join(bob, ws_b)
    OpportunityResume.objects.create(
        opportunity=_opp(ws_a),
        resume_version=_resume_version(ws_a),
        role=OpportunityResumeRole.SUBMITTED,
    )
    OpportunityResume.objects.create(
        opportunity=_opp(ws_b),
        resume_version=_resume_version(ws_b),
        role=OpportunityResumeRole.SUBMITTED,
    )

    response = _client(alice).get("/api/opportunity-resumes/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1


def test_list_filter_by_opportunity():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    op_a = _opp(ws)
    op_b = Opportunity.objects.create(workspace=ws, title="Other", company="Z")
    OpportunityResume.objects.create(
        opportunity=op_a,
        resume_version=_resume_version(ws),
        role=OpportunityResumeRole.SUBMITTED,
    )
    OpportunityResume.objects.create(
        opportunity=op_b,
        resume_version=_resume_version(ws, name="Other resume"),
        role=OpportunityResumeRole.USED_INTERNALLY,
    )

    response = _client(alice).get(f"/api/opportunity-resumes/?opportunity={op_a.pk}")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["opportunity"] == str(op_a.pk)


def test_list_invalid_opportunity_uuid_returns_400():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).get("/api/opportunity-resumes/?opportunity=nope")
    assert response.status_code == 400


def test_list_renders_resume_version_summary():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    version = _resume_version(ws, name="Senior Eng — backend")
    OpportunityResume.objects.create(
        opportunity=_opp(ws),
        resume_version=version,
        role=OpportunityResumeRole.SUBMITTED,
    )

    response = _client(alice).get("/api/opportunity-resumes/")
    assert response.status_code == 200
    summary = response.json()[0]["resume_version_summary"]
    assert summary["id"] == str(version.pk)
    assert summary["version_number"] == 1
    assert summary["base_resume_id"] == str(version.base_resume_id)
    assert summary["base_resume_name"] == "Senior Eng — backend"


def test_list_query_count_does_not_scale_with_link_count():
    """select_related on the viewset queryset keeps list flat."""
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    alice = _user()
    ws = _ws()
    _join(alice, ws)
    for i in range(5):
        OpportunityResume.objects.create(
            opportunity=_opp(ws),
            resume_version=_resume_version(ws, name=f"R{i}"),
            role=OpportunityResumeRole.SUBMITTED,
        )

    client = _client(alice)
    with CaptureQueriesContext(connection) as ctx:
        response = client.get("/api/opportunity-resumes/")
    assert response.status_code == 200
    assert len(response.json()) == 5
    assert len(ctx) <= 8, [q["sql"] for q in ctx]


# -- Create ------------------------------------------------------------------


def test_create_link_succeeds():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    opp = _opp(ws)
    version = _resume_version(ws)

    response = _client(alice).post(
        "/api/opportunity-resumes/",
        data={
            "opportunity": str(opp.pk),
            "resume_version": str(version.pk),
            "role": OpportunityResumeRole.SUBMITTED,
            "note": "via referral",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["role"] == OpportunityResumeRole.SUBMITTED
    assert body["note"] == "via referral"
    assert body["resume_version_summary"]["version_number"] == 1


def test_create_rejects_cross_workspace_resume_version():
    alice = _user()
    ws_a = _ws("ws-a")
    ws_b = _ws("ws-b")
    _join(alice, ws_a)
    _join(alice, ws_b)
    opp_a = _opp(ws_a)
    version_b = _resume_version(ws_b)

    response = _client(alice).post(
        "/api/opportunity-resumes/",
        data={
            "opportunity": str(opp_a.pk),
            "resume_version": str(version_b.pk),
            "role": OpportunityResumeRole.SUBMITTED,
        },
        format="json",
    )
    assert response.status_code == 400
    assert "resume_version" in response.json()


def test_create_forbidden_for_viewer():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    opp = _opp(ws)
    version = _resume_version(ws)

    response = _client(alice).post(
        "/api/opportunity-resumes/",
        data={
            "opportunity": str(opp.pk),
            "resume_version": str(version.pk),
            "role": OpportunityResumeRole.SUBMITTED,
        },
        format="json",
    )
    assert response.status_code == 403


def test_create_duplicate_link_returns_400_not_500():
    """Two link attempts with the same (opportunity, version, role) trip
    the DB unique constraint. The view must catch IntegrityError and
    surface 400 with a friendly message, not bubble as 500."""
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    opp = _opp(ws)
    version = _resume_version(ws)

    payload = {
        "opportunity": str(opp.pk),
        "resume_version": str(version.pk),
        "role": OpportunityResumeRole.SUBMITTED,
    }
    first = _client(alice).post("/api/opportunity-resumes/", data=payload, format="json")
    assert first.status_code == 201

    second = _client(alice).post("/api/opportunity-resumes/", data=payload, format="json")
    assert second.status_code == 400
    body = second.json()
    assert "non_field_errors" in body
    assert "already linked" in body["non_field_errors"][0].lower()


def test_create_rejects_invalid_role():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    response = _client(alice).post(
        "/api/opportunity-resumes/",
        data={
            "opportunity": str(_opp(ws).pk),
            "resume_version": str(_resume_version(ws).pk),
            "role": "bogus",
        },
        format="json",
    )
    assert response.status_code == 400


# -- Delete ------------------------------------------------------------------


def test_delete_link_returns_204_and_removes_row():
    alice = _user()
    ws = _ws()
    _join(alice, ws)
    link = OpportunityResume.objects.create(
        opportunity=_opp(ws),
        resume_version=_resume_version(ws),
        role=OpportunityResumeRole.SUBMITTED,
    )

    response = _client(alice).delete(f"/api/opportunity-resumes/{link.pk}/")
    assert response.status_code == 204
    assert OpportunityResume.objects.filter(pk=link.pk).count() == 0


def test_delete_link_forbidden_for_viewer():
    alice = _user()
    ws = _ws()
    _join(alice, ws, role=MembershipRole.VIEWER)
    link = OpportunityResume.objects.create(
        opportunity=_opp(ws),
        resume_version=_resume_version(ws),
        role=OpportunityResumeRole.SUBMITTED,
    )

    response = _client(alice).delete(f"/api/opportunity-resumes/{link.pk}/")
    assert response.status_code == 403


def test_delete_link_in_other_workspace_returns_404():
    alice = _user("alice")
    bob = _user("bob")
    ws_b = _ws("ws-bob")
    _join(bob, ws_b)
    link = OpportunityResume.objects.create(
        opportunity=_opp(ws_b),
        resume_version=_resume_version(ws_b),
        role=OpportunityResumeRole.SUBMITTED,
    )

    response = _client(alice).delete(f"/api/opportunity-resumes/{link.pk}/")
    assert response.status_code == 404
