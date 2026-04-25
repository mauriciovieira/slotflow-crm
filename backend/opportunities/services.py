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
    """Soft-delete: set `archived_at` to now if not already set.

    The `Opportunity.archived_at` write is idempotent — repeat calls do not
    bump the timestamp. An `opportunity.archived` audit event is written
    on every call so the trail records both the actual archive *and* any
    no-op repeat clicks (the metadata's `already_archived` flag distinguishes
    the two).
    """
    membership = get_membership(actor, opportunity.workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {opportunity.workspace_id}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {opportunity.workspace_id}."
        )
    # Re-fetch the row with `SELECT ... FOR UPDATE` so two concurrent archive
    # calls don't both observe `archived_at is None`, both write a stamp, and
    # have the later commit overwrite the earlier one. The lock is released
    # when the surrounding `@transaction.atomic` commits.
    locked = Opportunity.objects.select_for_update().get(pk=opportunity.pk)
    already_archived = locked.archived_at is not None
    if not already_archived:
        locked.archived_at = timezone.now()
        locked.save(update_fields=["archived_at", "updated_at"])
    write_audit_event(
        actor=actor,
        action="opportunity.archived",
        entity=locked,
        workspace=locked.workspace,
        metadata={
            "title": locked.title,
            "company": locked.company,
            "stage": locked.stage,
            "already_archived": already_archived,
        },
    )
    # Keep the caller-supplied instance in sync with what just landed in DB.
    opportunity.archived_at = locked.archived_at
    return opportunity
