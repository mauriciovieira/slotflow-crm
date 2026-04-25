"""Seed a non-admin user (and a default workspace) for Playwright e2e runs.

Idempotent. DEBUG-gated so staging/production cannot silently seed a test user.
Password comes from ``SLOTFLOW_E2E_PASSWORD`` (default ``e2e-local-only``).
No TOTP device is created; the e2e run sets ``SLOTFLOW_BYPASS_2FA=1`` so the
auth UI treats the session as verified without TOTP.

Also provisions ``Workspace(slug="e2e")`` and an OWNER ``Membership`` for the
e2e user. Without it, freshly seeded sessions hit a 400 on every workspace-
scoped POST (e.g. ``/api/opportunities/``) because ``Membership`` is empty.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from tenancy.models import Membership, MembershipRole, Workspace

E2E_USERNAME = "e2e"
E2E_EMAIL = "e2e@slotflow.test"
E2E_PASSWORD_ENV = "SLOTFLOW_E2E_PASSWORD"
E2E_PASSWORD_DEFAULT = "e2e-local-only"
E2E_WORKSPACE_NAME = "E2E Workspace"
E2E_WORKSPACE_SLUG = "e2e"


class Command(BaseCommand):
    help = (
        "Create or update the non-admin e2e test user, plus a default "
        "workspace and OWNER membership. Runs only under DEBUG; use inside "
        "Playwright runs or local dev. Password from "
        f"${E2E_PASSWORD_ENV} (default {E2E_PASSWORD_DEFAULT!r})."
    )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_e2e_user only runs when DEBUG is True.")

        # Match api_test_reset.reset_view so the seeded password and the
        # expected X-Reset-Token stay identical. Strips whitespace so a value
        # like " secret " does not produce different results on each side.
        password = (os.environ.get(E2E_PASSWORD_ENV) or "").strip() or E2E_PASSWORD_DEFAULT

        User = get_user_model()
        user, user_created = User.objects.update_or_create(
            username=E2E_USERNAME,
            defaults={
                "email": E2E_EMAIL,
                "is_staff": False,
                "is_superuser": False,
            },
        )
        user.set_password(password)
        user.save()

        # Use update_or_create so the workspace name re-syncs with the
        # constant if someone has renamed the row (e.g. via /admin/) — keeps
        # the e2e baseline deterministic across reruns.
        workspace, ws_created = Workspace.objects.update_or_create(
            slug=E2E_WORKSPACE_SLUG,
            defaults={"name": E2E_WORKSPACE_NAME},
        )
        _, membership_created = Membership.objects.update_or_create(
            user=user,
            workspace=workspace,
            defaults={"role": MembershipRole.OWNER},
        )

        user_action = "Created" if user_created else "Updated"
        ws_action = "created" if ws_created else "updated"
        membership_action = "created" if membership_created else "updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{user_action} e2e user {E2E_USERNAME!r}; "
                f"{ws_action} workspace {E2E_WORKSPACE_SLUG!r}; "
                f"{membership_action} OWNER membership."
            )
        )
