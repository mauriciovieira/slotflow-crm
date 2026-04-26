from __future__ import annotations

import datetime as dt
from pathlib import Path

from django.conf import settings
from django.db import migrations
from django.utils import timezone


VERSION = "0.1.0-draft"
EFFECTIVE_AT_ISO = "2026-04-25T00:00:00+00:00"


def _terms_path() -> Path:
    # settings.BASE_DIR == backend/. Walk up one to repo root.
    return Path(settings.BASE_DIR).parent / "docs" / "legal" / "terms-v0.1.0.md"


def seed_terms_v1(apps, schema_editor):
    TermsVersion = apps.get_model("core", "TermsVersion")
    body = _terms_path().read_text(encoding="utf-8")
    TermsVersion.objects.update_or_create(
        version=VERSION,
        defaults={
            "body": body,
            "effective_at": dt.datetime.fromisoformat(EFFECTIVE_AT_ISO),
        },
    )


def unseed(apps, schema_editor):
    TermsVersion = apps.get_model("core", "TermsVersion")
    TermsVersion.objects.filter(version=VERSION).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_terms_version"),
    ]
    operations = [migrations.RunPython(seed_terms_v1, unseed)]
