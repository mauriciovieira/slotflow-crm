from __future__ import annotations

import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from config.env import env_bool


class Command(BaseCommand):
    help = (
        "Create or update a Django superuser from environment variables "
        "(local development only; requires SLOTFLOW_ENSURE_SUPERUSER=1)."
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
