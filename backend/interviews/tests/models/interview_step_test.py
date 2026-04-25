from __future__ import annotations

import pytest
from django.db import IntegrityError

from interviews.models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepStatus,
)
from opportunities.models import Opportunity
from tenancy.models import Workspace

pytestmark = pytest.mark.django_db


def _workspace(slug="ws-a"):
    return Workspace.objects.create(name=f"Workspace {slug}", slug=slug)


def _opportunity(ws=None, title="Staff Eng", company="Acme"):
    return Opportunity.objects.create(workspace=ws or _workspace(), title=title, company=company)


def _cycle(opp=None, name="Round 1"):
    return InterviewCycle.objects.create(opportunity=opp or _opportunity(), name=name)


def _step(cycle, sequence=1, **overrides):
    defaults = {"cycle": cycle, "sequence": sequence}
    defaults.update(overrides)
    return InterviewStep.objects.create(**defaults)


def test_create_with_minimum_fields_uses_defaults():
    cycle = _cycle()
    step = _step(cycle)
    step.refresh_from_db()
    assert step.kind == InterviewStepKind.OTHER
    assert step.status == InterviewStepStatus.SCHEDULED
    assert step.scheduled_for is None
    assert step.duration_minutes is None
    assert step.interviewer == ""


def test_str_includes_cycle_name_and_sequence_and_kind():
    cycle = _cycle(name="R1")
    step = _step(cycle, sequence=2, kind=InterviewStepKind.TECHNICAL)
    assert str(step) == "R1 step 2 (technical)"


def test_unique_sequence_per_cycle():
    cycle = _cycle()
    _step(cycle, sequence=1)
    with pytest.raises(IntegrityError):
        _step(cycle, sequence=1)


def test_sequence_zero_rejected_by_check_constraint():
    cycle = _cycle()
    with pytest.raises(IntegrityError):
        _step(cycle, sequence=0)


def test_two_cycles_can_each_have_sequence_one():
    opp = _opportunity()
    cycle_a = _cycle(opp=opp, name="R1")
    cycle_b = _cycle(opp=opp, name="R2")
    _step(cycle_a, sequence=1)
    _step(cycle_b, sequence=1)
    assert InterviewStep.objects.filter(sequence=1).count() == 2


def test_cycle_delete_cascades_to_steps():
    cycle = _cycle()
    _step(cycle, sequence=1)
    _step(cycle, sequence=2)
    assert InterviewStep.objects.count() == 2
    cycle.delete()
    assert InterviewStep.objects.count() == 0


def test_default_ordering_is_ascending_by_sequence():
    cycle = _cycle()
    third = _step(cycle, sequence=3)
    first = _step(cycle, sequence=1)
    second = _step(cycle, sequence=2)
    ordered = list(InterviewStep.objects.all())
    assert [s.pk for s in ordered] == [first.pk, second.pk, third.pk]
