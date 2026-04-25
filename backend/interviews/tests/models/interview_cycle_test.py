from __future__ import annotations

import pytest
from django.utils import timezone

from interviews.models import InterviewCycle
from opportunities.models import Opportunity
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _opportunity(ws=None, title="Staff Eng", company="Acme"):
    return Opportunity.objects.create(workspace=ws or _workspace(), title=title, company=company)


def test_create_with_minimum_fields():
    opp = _opportunity()
    cycle = InterviewCycle.objects.create(opportunity=opp, name="Round 1")
    cycle.refresh_from_db()
    assert cycle.opportunity_id == opp.pk
    assert cycle.started_at is None
    assert cycle.closed_at is None
    assert cycle.notes == ""


def test_str_includes_name_and_opportunity_descriptor():
    opp = _opportunity(title="Backend", company="Acme")
    cycle = InterviewCycle.objects.create(opportunity=opp, name="Round 1")
    assert str(cycle) == "Round 1 (Backend @ Acme)"


def test_opportunity_delete_cascades():
    opp = _opportunity()
    InterviewCycle.objects.create(opportunity=opp, name="Round 1")
    assert InterviewCycle.objects.count() == 1
    opp.delete()
    assert InterviewCycle.objects.count() == 0


def test_default_ordering_is_newest_first():
    opp = _opportunity()
    older = InterviewCycle.objects.create(opportunity=opp, name="older")
    newer = InterviewCycle.objects.create(opportunity=opp, name="newer")
    ordered = list(InterviewCycle.objects.all())
    assert ordered[0].pk == newer.pk
    assert ordered[1].pk == older.pk


def test_two_cycles_for_same_opportunity_can_share_a_name():
    opp = _opportunity()
    InterviewCycle.objects.create(opportunity=opp, name="Round 1")
    InterviewCycle.objects.create(opportunity=opp, name="Round 1")
    assert InterviewCycle.objects.filter(opportunity=opp, name="Round 1").count() == 2


def test_closed_at_round_trips():
    opp = _opportunity()
    cycle = InterviewCycle.objects.create(opportunity=opp, name="Round 1")
    stamp = timezone.now()
    cycle.closed_at = stamp
    cycle.save(update_fields=["closed_at"])
    cycle.refresh_from_db()
    assert cycle.closed_at == stamp
