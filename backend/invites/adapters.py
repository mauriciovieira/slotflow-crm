from __future__ import annotations

from django.utils import timezone

from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

from invites.models import Invite


class SlotflowAccountAdapter(DefaultAccountAdapter):
    """Block self-serve signup unconditionally — invite-only platform.

    Password signup goes through `invites.api.accept_password_view`, not
    allauth, so allauth itself never opens the signup gate.
    """

    def is_open_for_signup(self, request) -> bool:
        return False


class SlotflowSocialAccountAdapter(DefaultSocialAccountAdapter):
    def is_open_for_signup(self, request, sociallogin) -> bool:
        token_hash = request.session.get("pending_invite_token_hash")
        if not token_hash:
            return False
        return Invite.objects.filter(
            token_hash=token_hash,
            status=Invite.Status.PENDING,
            expires_at__gt=timezone.now(),
        ).exists()
