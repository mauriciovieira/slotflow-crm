from __future__ import annotations

import os
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django_otp.plugins.otp_totp.models import TOTPDevice

from config.env import env_bool

TOTP_KEY_HEX_RE = re.compile(r"^[0-9a-fA-F]+$")
TOTP_KEY_EXPECTED_LEN = 40  # django-otp default: 20 bytes = 40 hex chars
TOTP_DEVICE_NAME = "default"


class Command(BaseCommand):
    help = (
        "Create or update a Django superuser from environment variables "
        "(local development only; requires SLOTFLOW_ENSURE_SUPERUSER=1). "
        "If SLOTFLOW_ADMIN_TOTP_KEY is also set, seeds a confirmed TOTP "
        "device with that hex key so the admin's authenticator app keeps "
        "generating valid codes across database resets."
    )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("This command only runs when DEBUG is True (local settings).")

        if not env_bool("SLOTFLOW_ENSURE_SUPERUSER", default=False):
            self.stdout.write(
                "Skipping: set SLOTFLOW_ENSURE_SUPERUSER=1 and DJANGO_SUPERUSER_* in .env "
                "to enable."
            )
            return

        username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "").strip()
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "").strip()
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "")

        if not username or not email or not password:
            raise CommandError(
                "DJANGO_SUPERUSER_USERNAME, DJANGO_SUPERUSER_EMAIL, and "
                "DJANGO_SUPERUSER_PASSWORD must be set when "
                "SLOTFLOW_ENSURE_SUPERUSER=1."
            )

        User = get_user_model()
        user, created = User.objects.update_or_create(
            username=username,
            defaults={
                "email": email,
                "is_staff": True,
                "is_superuser": True,
            },
        )
        user.set_password(password)
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} superuser {username!r}."))

        totp_action = self._ensure_totp_device(user)
        if totp_action is not None:
            self.stdout.write(self.style.SUCCESS(totp_action))

    def _ensure_totp_device(self, user) -> str | None:
        raw_key = os.environ.get("SLOTFLOW_ADMIN_TOTP_KEY", "").strip().lower()
        if not raw_key:
            self.stdout.write(
                "No SLOTFLOW_ADMIN_TOTP_KEY set; skipping TOTP seed. "
                "Set it in .env to preserve the admin's authenticator across DB resets."
            )
            return None

        if not TOTP_KEY_HEX_RE.match(raw_key) or len(raw_key) != TOTP_KEY_EXPECTED_LEN:
            raise CommandError(
                f"SLOTFLOW_ADMIN_TOTP_KEY must be {TOTP_KEY_EXPECTED_LEN} hex characters "
                f"(20 bytes). Got {len(raw_key)} character(s)."
            )

        device, created = TOTPDevice.objects.update_or_create(
            user=user,
            name=TOTP_DEVICE_NAME,
            defaults={
                "key": raw_key,
                "confirmed": True,
            },
        )
        verb = "Created" if created else "Updated"
        return f"{verb} confirmed TOTP device {device.name!r} for {user.username!r}."
