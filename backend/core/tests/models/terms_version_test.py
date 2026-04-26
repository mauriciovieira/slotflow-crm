from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from core.models import TermsVersion


@pytest.mark.django_db
def test_current_returns_latest_active_version():
    now = timezone.now()
    TermsVersion.objects.create(
        version="0.0.1", body="old", effective_at=now - timedelta(days=10)
    )
    latest = TermsVersion.objects.create(
        version="0.1.0", body="new", effective_at=now - timedelta(days=1)
    )
    TermsVersion.objects.create(
        version="0.2.0-future", body="future", effective_at=now + timedelta(days=1)
    )

    assert TermsVersion.current() == latest


@pytest.mark.django_db
def test_current_returns_none_when_nothing_effective():
    # Purge any seeded rows (the data migration `0002_seed_terms_v1` inserts
    # the placeholder ToS) so the assertion sees a baseline of zero
    # effective rows.
    TermsVersion.objects.all().delete()
    TermsVersion.objects.create(
        version="0.2.0-future",
        body="future",
        effective_at=timezone.now() + timedelta(hours=1),
    )

    assert TermsVersion.current() is None


@pytest.mark.django_db
def test_version_is_unique():
    now = timezone.now()
    TermsVersion.objects.create(version="1.0.0", body="a", effective_at=now)
    with pytest.raises(Exception):
        TermsVersion.objects.create(version="1.0.0", body="b", effective_at=now)
