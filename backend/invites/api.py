from __future__ import annotations

import re

from django.contrib.auth import get_user_model
from django.contrib.auth import login as django_login
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from audit.services import write_audit_event
from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import hash_token
from invites.services.workspace_slug import unique_slug_from_email
from tenancy.models import Membership, MembershipRole, Workspace


WORKSPACE_NAME_RE = re.compile(r"^[A-Za-z0-9 '\-]{2,80}$")
ALLOWED_PROVIDERS = {"google", "github"}


def _terms_payload(terms: TermsVersion | None) -> dict | None:
    if terms is None:
        return None
    return {"id": terms.id, "version": terms.version, "body_markdown": terms.body}


def _invite_state_response(invite: Invite) -> Response | None:
    if invite.status == Invite.Status.REVOKED:
        return Response({"error": "revoked"}, status=410)
    if invite.status == Invite.Status.ACCEPTED:
        return Response({"error": "already_used"}, status=410)
    if invite.is_expired:
        return Response(
            {"error": "expired", "expires_at": invite.expires_at.isoformat()},
            status=410,
        )
    return None


def _validate_password_payload(data: dict) -> dict[str, list[str]]:
    errors: dict[str, list[str]] = {}

    password = (data.get("password") or "").strip()
    workspace_name = (data.get("workspace_name") or "").strip()
    terms_version_id = data.get("terms_version_id")

    if not password:
        errors.setdefault("password", []).append("Password is required.")
    else:
        try:
            validate_password(password)
        except ValidationError as exc:
            errors.setdefault("password", []).extend(list(exc.messages))

    if not WORKSPACE_NAME_RE.match(workspace_name):
        errors.setdefault("workspace_name", []).append(
            "2-80 chars; letters, numbers, spaces, apostrophes, or hyphens.",
        )

    current = TermsVersion.current()
    if current is None or current.id != terms_version_id:
        errors.setdefault("terms_version_id", []).append(
            "Stale or unknown ToS version. Reload the page.",
        )

    return errors


def _validate_oauth_payload(data: dict) -> dict[str, list[str]]:
    errors: dict[str, list[str]] = {}

    workspace_name = (data.get("workspace_name") or "").strip()
    terms_version_id = data.get("terms_version_id")

    if not WORKSPACE_NAME_RE.match(workspace_name):
        errors.setdefault("workspace_name", []).append(
            "2-80 chars; letters, numbers, spaces, apostrophes, or hyphens.",
        )

    current = TermsVersion.current()
    if current is None or current.id != terms_version_id:
        errors.setdefault("terms_version_id", []).append(
            "Stale or unknown ToS version. Reload the page.",
        )

    return errors


@api_view(["GET"])
@permission_classes([AllowAny])
def preflight_view(request: Request, token: str) -> Response:
    try:
        invite = Invite.objects.get(token_hash=hash_token(token))
    except Invite.DoesNotExist:
        return Response({"error": "invalid_token"}, status=404)

    bad = _invite_state_response(invite)
    if bad is not None:
        return bad

    terms = TermsVersion.current()
    return Response(
        {
            "email": invite.email,
            "expires_at": invite.expires_at.isoformat(),
            "providers": ["google", "github"],
            "terms_version": _terms_payload(terms),
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def accept_password_view(request: Request, token: str) -> Response:
    try:
        invite = Invite.objects.get(token_hash=hash_token(token))
    except Invite.DoesNotExist:
        return Response({"error": "invalid_token"}, status=404)

    bad = _invite_state_response(invite)
    if bad is not None:
        if bad.data.get("error") == "expired":
            write_audit_event(actor=None, action="invite.rejected_expired", entity=invite)
        elif bad.data.get("error") == "revoked":
            write_audit_event(actor=None, action="invite.rejected_revoked", entity=invite)
        return bad

    User = get_user_model()
    if User.objects.filter(email__iexact=invite.email).exists():
        write_audit_event(
            actor=None,
            action="invite.rejected_user_exists",
            entity=invite,
            metadata={"path": "password"},
        )
        return Response({"error": "user_exists"}, status=409)

    errors = _validate_password_payload(request.data)
    if errors:
        return Response(errors, status=422)

    password = request.data["password"].strip()
    workspace_name = request.data["workspace_name"].strip()
    terms = TermsVersion.objects.get(pk=request.data["terms_version_id"])

    with transaction.atomic():
        user = User.objects.create_user(
            username=invite.email,
            email=invite.email,
            password=password,
        )
        user.accepted_terms_version = terms
        user.accepted_terms_at = timezone.now()
        user.save(update_fields=("accepted_terms_version", "accepted_terms_at"))

        workspace = Workspace.objects.create(
            name=workspace_name,
            slug=unique_slug_from_email(invite.email),
        )
        Membership.objects.create(
            user=user, workspace=workspace, role=MembershipRole.OWNER,
        )

        invite.mark_accepted(user=user, workspace=workspace)

        write_audit_event(
            actor=user, action="invite.accepted",
            entity=invite, metadata={"path": "password"},
        )
        write_audit_event(
            actor=user, action="user.created",
            entity=user,
            metadata={"path": "password", "workspace_id": str(workspace.id)},
        )
        write_audit_event(
            actor=user, action="terms.accepted",
            entity=user,
            metadata={"terms_version_id": terms.id, "version": terms.version},
        )

    django_login(
        request._request, user, backend="django.contrib.auth.backends.ModelBackend",
    )
    return Response({"next": "/2fa/setup"})
