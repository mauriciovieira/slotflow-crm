from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from tenancy.permissions import get_membership

from .models import Opportunity

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser

    from tenancy.models import Workspace


class WorkspaceMembershipRequired(PermissionError):
    """Raised when an actor tries to act on a workspace they don't belong to."""


@transaction.atomic
def create_opportunity(
    *, actor: AbstractBaseUser, workspace: Workspace, payload: dict
) -> Opportunity:
    """Create an Opportunity inside `workspace`, stamping `created_by=actor`.

    The actor must have an active Membership in the workspace; otherwise
    `WorkspaceMembershipRequired` is raised before any DB write.
    """
    if get_membership(actor, workspace) is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {workspace.pk}."
        )
    return Opportunity.objects.create(
        workspace=workspace,
        title=payload["title"],
        company=payload["company"],
        stage=payload.get("stage", Opportunity._meta.get_field("stage").default),
        notes=payload.get("notes", ""),
        created_by=actor,
    )


@transaction.atomic
def archive_opportunity(*, actor: AbstractBaseUser, opportunity: Opportunity) -> Opportunity:
    """Soft-delete: set `archived_at` to now if not already set; idempotent."""
    if get_membership(actor, opportunity.workspace) is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {opportunity.workspace_id}."
        )
    if opportunity.archived_at is None:
        opportunity.archived_at = timezone.now()
        opportunity.save(update_fields=["archived_at", "updated_at"])
    return opportunity
