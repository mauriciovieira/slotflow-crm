from __future__ import annotations

from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from audit.services import write_audit_event
from tenancy.models import MembershipRole
from tenancy.permissions import get_membership

from .models import Opportunity, OpportunityResume, OpportunityResumeRole

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser

    from resumes.models import ResumeVersion
    from tenancy.models import Workspace


WRITE_ROLES = frozenset({MembershipRole.OWNER, MembershipRole.MEMBER})


class WorkspaceMembershipRequired(PermissionError):
    """Raised when an actor tries to act on a workspace they don't belong to."""


class WorkspaceWriteForbidden(PermissionError):
    """Raised when an actor has a membership but the role is read-only (viewer)."""


class CrossWorkspaceLinkForbidden(ValueError):
    """Raised when a resume version's workspace differs from the opportunity's."""


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
def create_opportunity(
    *, actor: AbstractBaseUser, workspace: Workspace, payload: dict
) -> Opportunity:
    """Create an Opportunity inside `workspace`, stamping `created_by=actor`.

    The actor must have an active Membership in the workspace; otherwise
    `WorkspaceMembershipRequired` is raised before any DB write.
    """
    _enforce_write_role(actor, workspace)
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
    _enforce_write_role(actor, opportunity.workspace)
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


@transaction.atomic
def link_resume_to_opportunity(
    *,
    actor: AbstractBaseUser,
    opportunity: Opportunity,
    resume_version: ResumeVersion,
    role: str,
    note: str = "",
) -> OpportunityResume:
    """Attach `resume_version` to `opportunity` under `role`.

    Cross-workspace links are rejected: the resume version must belong to a
    base resume in the same workspace as the opportunity. The unique
    constraint `(opportunity, resume_version, role)` is enforced at the DB
    layer; callers attempting to re-link the same triple will see a
    `django.db.IntegrityError`.
    """
    _enforce_write_role(actor, opportunity.workspace)
    if role not in {choice for choice, _ in OpportunityResumeRole.choices}:
        raise ValueError(f"Unknown OpportunityResumeRole: {role!r}")
    if resume_version.base_resume.workspace_id != opportunity.workspace_id:
        raise CrossWorkspaceLinkForbidden(
            "Resume version belongs to a different workspace than the opportunity."
        )
    link = OpportunityResume.objects.create(
        opportunity=opportunity,
        resume_version=resume_version,
        role=role,
        note=note,
        created_by=actor,
    )
    write_audit_event(
        actor=actor,
        action="opportunity_resume.linked",
        entity=link,
        workspace=opportunity.workspace,
        metadata={
            "opportunity_id": str(opportunity.pk),
            "resume_version_id": str(resume_version.pk),
            "base_resume_id": str(resume_version.base_resume_id),
            "role": role,
        },
    )
    return link


@transaction.atomic
def unlink_resume(*, actor: AbstractBaseUser, link: OpportunityResume) -> OpportunityResume:
    """Hard-delete an `OpportunityResume` row. The audit event is the durable trail."""
    workspace = link.opportunity.workspace
    _enforce_write_role(actor, workspace)
    # Freeze the metadata BEFORE delete — once the row is gone the FK ids
    # would be unresolvable from the audit row alone.
    metadata = {
        "opportunity_id": str(link.opportunity_id),
        "resume_version_id": str(link.resume_version_id),
        "base_resume_id": str(link.resume_version.base_resume_id),
        "role": link.role,
    }
    write_audit_event(
        actor=actor,
        action="opportunity_resume.unlinked",
        entity=link,
        workspace=workspace,
        metadata=metadata,
    )
    link.delete()
    return link
