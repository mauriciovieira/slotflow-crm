from __future__ import annotations

from typing import TYPE_CHECKING

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from audit.services import write_audit_event

from .models import Invitation, Membership, MembershipRole, Workspace

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser


class LastOwnerError(ValidationError):
    """Action would leave the workspace without an OWNER."""


class InvitationConflictError(ValidationError):
    """Email is already a member or has a non-expired pending invite."""


class InvitationStateError(ValidationError):
    """Token is revoked, expired, or otherwise unacceptable."""


def _count_owners(workspace: Workspace, *, exclude_membership_id=None) -> int:
    qs = Membership.objects.filter(workspace=workspace, role=MembershipRole.OWNER)
    if exclude_membership_id is not None:
        qs = qs.exclude(pk=exclude_membership_id)
    return qs.count()


def guard_last_owner(*, membership: Membership, action: str) -> None:
    """Raise `LastOwnerError` if `action` against `membership` would leave the
    workspace with zero owners."""
    if membership.role != MembershipRole.OWNER:
        return
    if _count_owners(membership.workspace, exclude_membership_id=membership.pk) > 0:
        return
    raise LastOwnerError(
        f"Cannot {action} the last owner of this workspace. Promote another member to owner first."
    )


@transaction.atomic
def change_role(
    *,
    actor: AbstractBaseUser,
    membership: Membership,
    new_role: str,
) -> Membership:
    """Set `membership.role` to `new_role`. Guards last-owner on demote."""
    if new_role not in MembershipRole.values:
        raise ValidationError(f"Unknown role: {new_role!r}")
    if membership.role == new_role:
        return membership
    if membership.role == MembershipRole.OWNER and new_role != MembershipRole.OWNER:
        guard_last_owner(membership=membership, action="demote")
    previous = membership.role
    membership.role = new_role
    membership.save(update_fields=["role", "updated_at"])
    write_audit_event(
        actor=actor,
        action="member.role_changed",
        entity=membership,
        workspace=membership.workspace,
        metadata={
            "from": previous,
            "to": new_role,
            "target_user_id": str(membership.user_id),
        },
    )
    return membership


@transaction.atomic
def remove_member(*, actor: AbstractBaseUser, membership: Membership) -> None:
    """Delete `membership`. Self-leave is allowed; otherwise actor must be OWNER.

    Raises `LastOwnerError` if `membership` is the only OWNER.
    """
    guard_last_owner(membership=membership, action="remove")
    is_self = actor is not None and getattr(actor, "pk", None) == membership.user_id
    workspace = membership.workspace
    target_user_id = membership.user_id
    membership.delete()
    write_audit_event(
        actor=actor,
        action="member.left" if is_self else "member.removed",
        workspace=workspace,
        metadata={"target_user_id": str(target_user_id)},
    )


@transaction.atomic
def transfer_ownership(
    *,
    actor: AbstractBaseUser,
    actor_membership: Membership,
    target_membership: Membership,
    demote_self: bool = True,
) -> None:
    """Promote `target_membership` to OWNER; optionally demote `actor_membership`
    to MEMBER. Both memberships must belong to the same workspace."""
    if actor_membership.workspace_id != target_membership.workspace_id:
        raise ValidationError("Cross-workspace transfer is not allowed.")
    if actor_membership.role != MembershipRole.OWNER:
        raise ValidationError("Only an owner can transfer ownership.")
    target_membership.role = MembershipRole.OWNER
    target_membership.save(update_fields=["role", "updated_at"])
    if demote_self:
        # Two owners exist now (actor + target), so the demote can't violate
        # the last-owner invariant. Skip the guard for clarity.
        actor_membership.role = MembershipRole.MEMBER
        actor_membership.save(update_fields=["role", "updated_at"])
    write_audit_event(
        actor=actor,
        action="workspace.ownership_transferred",
        workspace=actor_membership.workspace,
        metadata={
            "from_user_id": str(actor_membership.user_id),
            "to_user_id": str(target_membership.user_id),
            "demoted_self": demote_self,
        },
    )


def _normalize_email(email: str) -> str:
    cleaned = (email or "").strip().lower()
    validate_email(cleaned)
    return cleaned


@transaction.atomic
def create_invitation(
    *,
    actor: AbstractBaseUser,
    workspace: Workspace,
    email: str,
    role: str = MembershipRole.MEMBER,
) -> Invitation:
    """Create a pending invitation for `email` to join `workspace`.

    Raises `InvitationConflictError` if the email is already a member, or
    if a non-expired pending invite already exists.
    """
    if role not in MembershipRole.values:
        raise ValidationError(f"Unknown role: {role!r}")
    cleaned = _normalize_email(email)
    already_member = Membership.objects.filter(
        workspace=workspace, user__email__iexact=cleaned
    ).exists()
    if already_member:
        raise InvitationConflictError(f"{cleaned} is already a member.")
    pending = Invitation.objects.filter(
        workspace=workspace,
        email=cleaned,
        accepted_at__isnull=True,
        revoked_at__isnull=True,
        expires_at__gt=timezone.now(),
    )
    if pending.exists():
        raise InvitationConflictError(f"{cleaned} already has a pending invite.")
    invitation = Invitation.objects.create(
        workspace=workspace, email=cleaned, role=role, created_by=actor
    )
    write_audit_event(
        actor=actor,
        action="invitation.created",
        entity=invitation,
        workspace=workspace,
        metadata={"email": cleaned, "role": role},
    )
    return invitation


@transaction.atomic
def revoke_invitation(*, actor: AbstractBaseUser, invitation: Invitation) -> None:
    """Mark `invitation` as revoked. Idempotent on already-revoked rows."""
    if invitation.revoked_at is not None:
        return
    invitation.revoked_at = timezone.now()
    invitation.save(update_fields=["revoked_at", "updated_at"])
    write_audit_event(
        actor=actor,
        action="invitation.revoked",
        entity=invitation,
        workspace=invitation.workspace,
        metadata={"email": invitation.email},
    )


@transaction.atomic
def accept_invitation(*, user: AbstractBaseUser, token: str) -> Membership:
    """Accept the invitation identified by `token` on behalf of `user`.

    Idempotent on already-accepted rows (returns the existing Membership).
    Raises `InvitationStateError` on revoked or expired tokens.
    """
    try:
        invitation = Invitation.objects.select_for_update().get(token=token)
    except Invitation.DoesNotExist as exc:
        raise InvitationStateError("Unknown invitation token.") from exc
    if invitation.revoked_at is not None:
        raise InvitationStateError("This invitation was revoked.")
    if invitation.accepted_at is not None:
        # Idempotent: caller already accepted at some point.
        membership = Membership.objects.filter(workspace=invitation.workspace, user=user).first()
        if membership is not None:
            return membership
        # Edge case: invite was accepted by a different user in the past;
        # treat as conflict so the bearer can't silently double-claim.
        raise InvitationStateError("This invitation has already been accepted.")
    if invitation.expires_at <= timezone.now():
        raise InvitationStateError("This invitation has expired.")
    membership, _created = Membership.objects.get_or_create(
        workspace=invitation.workspace,
        user=user,
        defaults={"role": invitation.role},
    )
    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_at", "updated_at"])
    write_audit_event(
        actor=user,
        action="invitation.accepted",
        entity=invitation,
        workspace=invitation.workspace,
        metadata={"email": invitation.email},
    )
    return membership
