from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from audit.services import write_audit_event
from tenancy.models import MembershipRole
from tenancy.permissions import get_membership

from .models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepStatus,
)

if TYPE_CHECKING:
    from datetime import datetime

    from django.contrib.auth.models import AbstractBaseUser

    from opportunities.models import Opportunity


WRITE_ROLES = frozenset({MembershipRole.OWNER, MembershipRole.MEMBER})


class WorkspaceMembershipRequired(PermissionError):
    """Raised when an actor tries to act on a workspace they don't belong to."""


class WorkspaceWriteForbidden(PermissionError):
    """Raised when an actor has a membership but the role is read-only (viewer)."""


def _enforce_write_role(actor, workspace) -> None:
    membership = get_membership(actor, workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {workspace.pk}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {workspace.pk}."
        )


@transaction.atomic
def start_interview_cycle(
    *,
    actor: AbstractBaseUser,
    opportunity: Opportunity,
    name: str,
    notes: str = "",
) -> InterviewCycle:
    _enforce_write_role(actor, opportunity.workspace)
    cycle = InterviewCycle.objects.create(
        opportunity=opportunity,
        name=name,
        notes=notes,
        started_at=timezone.now(),
    )
    write_audit_event(
        actor=actor,
        action="interview_cycle.created",
        entity=cycle,
        workspace=opportunity.workspace,
        metadata={
            "name": cycle.name,
            "opportunity_id": str(opportunity.pk),
        },
    )
    return cycle


@transaction.atomic
def add_interview_step(
    *,
    actor: AbstractBaseUser,
    cycle: InterviewCycle,
    kind: str = InterviewStepKind.OTHER,
    scheduled_for: datetime | None = None,
    duration_minutes: int | None = None,
    interviewer: str = "",
    notes: str = "",
) -> InterviewStep:
    workspace = cycle.opportunity.workspace
    _enforce_write_role(actor, workspace)
    if kind not in {choice for choice, _ in InterviewStepKind.choices}:
        raise ValueError(f"Unknown InterviewStepKind: {kind!r}")
    # Lock the parent cycle row while we read max(sequence) so two concurrent
    # `add_interview_step` calls can't both compute the same `next_seq` and
    # trip the unique constraint at insert time.
    InterviewCycle.objects.select_for_update().get(pk=cycle.pk)
    current_max = (
        InterviewStep.objects.filter(cycle=cycle).aggregate(Max("sequence"))["sequence__max"] or 0
    )
    next_seq = current_max + 1
    step = InterviewStep.objects.create(
        cycle=cycle,
        sequence=next_seq,
        kind=kind,
        status=InterviewStepStatus.SCHEDULED,
        scheduled_for=scheduled_for,
        duration_minutes=duration_minutes,
        interviewer=interviewer,
        notes=notes,
    )
    write_audit_event(
        actor=actor,
        action="interview_step.added",
        entity=step,
        workspace=workspace,
        metadata={
            "cycle_id": str(cycle.pk),
            "sequence": step.sequence,
            "kind": step.kind,
        },
    )
    return step


@transaction.atomic
def update_step_status(
    *,
    actor: AbstractBaseUser,
    step: InterviewStep,
    status: str,
    notes: str | None = None,
) -> InterviewStep:
    workspace = step.cycle.opportunity.workspace
    _enforce_write_role(actor, workspace)
    if status not in {choice for choice, _ in InterviewStepStatus.choices}:
        raise ValueError(f"Unknown InterviewStepStatus: {status!r}")
    locked = InterviewStep.objects.select_for_update().select_related("cycle").get(pk=step.pk)
    old_status = locked.status
    update_fields = ["status", "updated_at"]
    locked.status = status
    if notes is not None:
        locked.notes = notes
        update_fields.append("notes")
    locked.save(update_fields=update_fields)
    write_audit_event(
        actor=actor,
        action="interview_step.updated",
        entity=locked,
        workspace=workspace,
        metadata={
            "cycle_id": str(locked.cycle_id),
            "sequence": locked.sequence,
            "old_status": old_status,
            "new_status": locked.status,
        },
    )
    # Refresh caller's reference so all fields (`updated_at`, `status`, `notes`)
    # match the persisted row, not just the ones we explicitly assigned.
    step.refresh_from_db()
    return step
