from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from opportunities.models import Opportunity, OpportunityStage
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _workspace(**overrides) -> Workspace:
    defaults = {"name": "Test WS", "slug": "test-ws"}
    defaults.update(overrides)
    return Workspace.objects.create(**defaults)


def _user(**overrides):
    User = get_user_model()
    defaults = {"username": "alice", "email": "alice@example.com", "password": "x"}
    defaults.update(overrides)
    return User.objects.create_user(**defaults)


def test_create_with_minimum_fields_uses_defaults():
    ws = _workspace()
    opp = Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")
    opp.refresh_from_db()
    assert opp.stage == OpportunityStage.APPLIED
    assert opp.notes == ""
    assert opp.created_by is None
    assert opp.created_at is not None
    assert opp.updated_at is not None


def test_str_format():
    ws = _workspace()
    opp = Opportunity.objects.create(workspace=ws, title="Staff Eng", company="Acme")
    assert str(opp) == "Staff Eng @ Acme"


def test_stage_choice_validated_by_full_clean():
    ws = _workspace()
    opp = Opportunity(workspace=ws, title="x", company="y", stage="unknown-stage")
    with pytest.raises(ValidationError):
        opp.full_clean()


def test_workspace_delete_cascades_to_opportunity():
    ws = _workspace()
    Opportunity.objects.create(workspace=ws, title="x", company="y")
    assert Opportunity.objects.count() == 1
    ws.delete()
    assert Opportunity.objects.count() == 0


def test_creator_delete_nullifies_created_by_and_preserves_row():
    ws = _workspace()
    user = _user()
    opp = Opportunity.objects.create(workspace=ws, title="x", company="y", created_by=user)
    user.delete()
    opp.refresh_from_db()
    assert opp.created_by is None
    assert Opportunity.objects.filter(pk=opp.pk).exists()


def test_default_ordering_is_newest_first():
    ws = _workspace()
    older = Opportunity.objects.create(workspace=ws, title="older", company="Acme")
    newer = Opportunity.objects.create(workspace=ws, title="newer", company="Acme")
    # created_at is auto-populated at save; the second create lands later.
    ordered = list(Opportunity.objects.all())
    assert ordered[0].pk == newer.pk
    assert ordered[1].pk == older.pk
