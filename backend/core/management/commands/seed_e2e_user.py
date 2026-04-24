"""Seed a non-admin user for Playwright e2e runs.

Idempotent. DEBUG-gated so staging/production cannot silently seed a test user.
Password comes from ``SLOTFLOW_E2E_PASSWORD`` (default ``e2e-local-only``).
No TOTP device is created; the e2e run sets ``SLOTFLOW_BYPASS_2FA=1`` so the
auth UI treats the session as verified without TOTP.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

E2E_USERNAME = "e2e"
E2E_EMAIL = "e2e@slotflow.test"
E2E_PASSWORD_ENV = "SLOTFLOW_E2E_PASSWORD"
E2E_PASSWORD_DEFAULT = "e2e-local-only"


class Command(BaseCommand):
    help = (
        "Create or update the non-admin e2e test user. Runs only under DEBUG; "
        "use inside Playwright runs or local dev. Password from "
        f"${E2E_PASSWORD_ENV} (default {E2E_PASSWORD_DEFAULT!r})."
    )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_e2e_user only runs when DEBUG is True.")

        password = os.environ.get(E2E_PASSWORD_ENV) or E2E_PASSWORD_DEFAULT

        User = get_user_model()
        user, created = User.objects.update_or_create(
            username=E2E_USERNAME,
            defaults={
                "email": E2E_EMAIL,
                "is_staff": False,
                "is_superuser": False,
            },
        )
        user.set_password(password)
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} e2e user {E2E_USERNAME!r}."))
