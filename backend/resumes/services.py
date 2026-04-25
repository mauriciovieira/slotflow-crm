from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING, Any

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from audit.services import write_audit_event
from tenancy.models import MembershipRole
from tenancy.permissions import get_membership

from .models import BaseResume, ResumeVersion

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser

    from tenancy.models import Workspace


WRITE_ROLES = frozenset({MembershipRole.OWNER, MembershipRole.MEMBER})


class WorkspaceMembershipRequired(PermissionError):
    """Raised when an actor tries to act on a workspace they don't belong to."""


class WorkspaceWriteForbidden(PermissionError):
    """Raised when an actor has a membership but the role is read-only (viewer)."""


def _document_hash(document: Any) -> str:
    payload = json.dumps(document, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


@transaction.atomic
def create_resume(*, actor: AbstractBaseUser, workspace: Workspace, name: str) -> BaseResume:
    membership = get_membership(actor, workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {workspace.pk}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {workspace.pk}."
        )
    resume = BaseResume.objects.create(
        workspace=workspace,
        name=name,
        created_by=actor,
    )
    write_audit_event(
        actor=actor,
        action="resume.created",
        entity=resume,
        workspace=workspace,
        metadata={"name": resume.name},
    )
    return resume


@transaction.atomic
def archive_resume(*, actor: AbstractBaseUser, base_resume: BaseResume) -> BaseResume:
    membership = get_membership(actor, base_resume.workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {base_resume.workspace_id}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {base_resume.workspace_id}."
        )
    locked = BaseResume.objects.select_for_update().get(pk=base_resume.pk)
    already_archived = locked.archived_at is not None
    if not already_archived:
        locked.archived_at = timezone.now()
        locked.save(update_fields=["archived_at", "updated_at"])
    write_audit_event(
        actor=actor,
        action="resume.archived",
        entity=locked,
        workspace=locked.workspace,
        metadata={
            "name": locked.name,
            "already_archived": already_archived,
        },
    )
    base_resume.archived_at = locked.archived_at
    return base_resume


@transaction.atomic
def create_resume_version(
    *,
    actor: AbstractBaseUser,
    base_resume: BaseResume,
    document: Any,
    notes: str = "",
) -> ResumeVersion:
    membership = get_membership(actor, base_resume.workspace)
    if membership is None:
        raise WorkspaceMembershipRequired(
            f"User {actor.pk} has no membership in workspace {base_resume.workspace_id}."
        )
    if membership.role not in WRITE_ROLES:
        raise WorkspaceWriteForbidden(
            f"User {actor.pk} has read-only membership in workspace {base_resume.workspace_id}."
        )
    # Lock the parent row while we read max(version_number) so two concurrent
    # appends don't both compute the same `next_number` and trip the unique
    # constraint at insert time.
    BaseResume.objects.select_for_update().get(pk=base_resume.pk)
    current_max = (
        ResumeVersion.objects.filter(base_resume=base_resume).aggregate(Max("version_number"))[
            "version_number__max"
        ]
        or 0
    )
    next_number = current_max + 1
    digest = _document_hash(document)
    version = ResumeVersion.objects.create(
        base_resume=base_resume,
        version_number=next_number,
        document=document,
        document_hash=digest,
        notes=notes,
        created_by=actor,
    )
    write_audit_event(
        actor=actor,
        action="resume_version.created",
        entity=version,
        workspace=base_resume.workspace,
        metadata={
            "base_resume_id": str(base_resume.pk),
            "version_number": version.version_number,
            "document_hash": digest,
        },
    )
    return version
