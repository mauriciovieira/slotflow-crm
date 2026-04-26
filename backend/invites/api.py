from __future__ import annotations

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from core.models import TermsVersion
from invites.models import Invite
from invites.services.tokens import hash_token


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
