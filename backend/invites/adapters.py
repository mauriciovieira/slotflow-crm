from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import redirect
from django.utils import timezone

from allauth.account.adapter import DefaultAccountAdapter
from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter

from audit.services import write_audit_event
from core.models import TermsVersion
from invites.models import Invite
from invites.services.oauth_mfa import check_oauth_mfa
from invites.services.tokens import sha256_email
from invites.services.workspace_slug import unique_slug_from_email
from mcp.auth import mark_otp_session_fresh
from tenancy.models import Membership, MembershipRole, Workspace


_SESSION_KEYS = (
    "pending_invite_token_hash",
    "pending_invite_raw_token",
    "workspace_name",
    "accepted_terms_version_id",
)


def _clear_invite_session(request) -> None:
    for k in _SESSION_KEYS:
        request.session.pop(k, None)


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

    def pre_social_login(self, request, sociallogin):
        token_hash = request.session.get("pending_invite_token_hash")
        raw_token = request.session.get("pending_invite_raw_token", "")

        if not token_hash:
            # Existing-user login mode. Require a known SocialAccount link.
            if getattr(sociallogin, "is_existing", False):
                return
            raise ImmediateHttpResponse(redirect("/login?error=no_account"))

        invite = Invite.objects.get(token_hash=token_hash)
        oauth_email = (sociallogin.user.email or "").strip().lower()
        if oauth_email != invite.email.lower():
            write_audit_event(
                actor=None,
                action="invite.rejected_email_mismatch",
                entity=invite,
                metadata={
                    "provider": sociallogin.account.provider,
                    "oauth_email_hash": sha256_email(oauth_email),
                },
            )
            raise ImmediateHttpResponse(
                redirect(f"/accept-invite/{raw_token}/?error=email_mismatch"),
            )

        User = get_user_model()
        if User.objects.filter(email__iexact=invite.email).exists():
            write_audit_event(
                actor=None,
                action="invite.rejected_user_exists",
                entity=invite,
                metadata={"path": sociallogin.account.provider},
            )
            raise ImmediateHttpResponse(
                redirect(f"/accept-invite/{raw_token}/?error=user_exists"),
            )

    def save_user(self, request, sociallogin, form=None):
        token_hash = request.session["pending_invite_token_hash"]
        invite = Invite.objects.select_for_update().get(token_hash=token_hash)
        if not invite.is_consumable:
            raw = request.session.get("pending_invite_raw_token", "")
            _clear_invite_session(request)
            raise ImmediateHttpResponse(
                redirect(f"/accept-invite/{raw}/?error=oauth_failed"),
            )

        terms = TermsVersion.objects.get(pk=request.session["accepted_terms_version_id"])
        workspace_name = request.session["workspace_name"]

        with transaction.atomic():
            user = sociallogin.user
            user.username = user.email
            user.set_unusable_password()
            user.accepted_terms_version = terms
            user.accepted_terms_at = timezone.now()
            user.save()

            sociallogin.connect(request, user)

            workspace = Workspace.objects.create(
                name=workspace_name,
                slug=unique_slug_from_email(invite.email),
            )
            Membership.objects.create(
                user=user, workspace=workspace, role=MembershipRole.OWNER,
            )
            invite.mark_accepted(user=user, workspace=workspace)

            mfa_ok = check_oauth_mfa(sociallogin)
            if mfa_ok:
                request.session["oauth_mfa_satisfied"] = True
                mark_otp_session_fresh(request)
                write_audit_event(
                    actor=user,
                    action="oauth.mfa_satisfied",
                    entity=user,
                    metadata={
                        "provider": sociallogin.account.provider,
                        "claim_source": (
                            "amr"
                            if sociallogin.account.provider == "google"
                            else "github_api"
                        ),
                    },
                )

            write_audit_event(
                actor=user,
                action="invite.accepted",
                entity=invite,
                metadata={"path": sociallogin.account.provider},
            )
            write_audit_event(
                actor=user,
                action="user.created",
                entity=user,
                metadata={
                    "path": sociallogin.account.provider,
                    "workspace_id": str(workspace.id),
                },
            )
            write_audit_event(
                actor=user,
                action="terms.accepted",
                entity=user,
                metadata={"terms_version_id": terms.id, "version": terms.version},
            )

        _clear_invite_session(request)
        return user

    def authentication_error(
        self, request, provider_id, error=None, exception=None, extra_context=None,
    ):
        raw = request.session.get("pending_invite_raw_token")
        _clear_invite_session(request)
        if raw:
            return redirect(f"/accept-invite/{raw}/?error=oauth_failed")
        return redirect("/login?error=oauth_failed")
