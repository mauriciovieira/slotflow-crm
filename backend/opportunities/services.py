from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from audit.services import write_audit_event
from tenancy.models import MembershipRole
from tenancy.permissions import get_membership

from .models import Opportunity

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser

    from tenancy.models import Workspace


WRITE_ROLES = frozenset({MembershipRole.OWNER, MembershipRole.MEMBER})


class WorkspaceMembershipRequired(PermissionError):
    """Raised when an actor tries to act on a workspace they don't belong to."""


class WorkspaceWriteForbidden(PermissionError):
    """Raised when an actor has a membership but the role is read-only (viewer)."""


@transaction.atomic
def create_opportunity(
    *, actor: AbstractBaseUser, workspace: Workspace, payload: dict
) -> Opportunity:
    """Create an Opportunity inside `workspace`, stamping `created_by=actor`.

    The actor must have an active Membership in the workspace; otherwise
    `WorkspaceMembershipRequired` is raised before any DB write.
    """
    membership = get_membership(actor, workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {workspace.pk}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {workspace.pk}."
        )
    opportunity = Opportunity.objects.create(
        workspace=workspace,
        title=payload["title"],
        company=payload["company"],
        stage=payload.get("stage", Opportunity._meta.get_field("stage").default),
        notes=payload.get("notes", ""),
        created_by=actor,
    )
    write_audit_event(
        actor=actor,
        action="opportunity.created",
        entity=opportunity,
        workspace=workspace,
        metadata={
            "title": opportunity.title,
            "company": opportunity.company,
            "stage": opportunity.stage,
        },
    )
    return opportunity


@transaction.atomic
def archive_opportunity(*, actor: AbstractBaseUser, opportunity: Opportunity) -> Opportunity:
    """Soft-delete: set `archived_at` to now if not already set; idempotent."""
    membership = get_membership(actor, opportunity.workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {opportunity.workspace_id}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {opportunity.workspace_id}."
        )
    already_archived = opportunity.archived_at is not None
    if not already_archived:
        opportunity.archived_at = timezone.now()
        opportunity.save(update_fields=["archived_at", "updated_at"])
    write_audit_event(
        actor=actor,
        action="opportunity.archived",
        entity=opportunity,
        workspace=opportunity.workspace,
        metadata={
            "title": opportunity.title,
            "company": opportunity.company,
            "stage": opportunity.stage,
            "already_archived": already_archived,
        },
    )
    return opportunity
