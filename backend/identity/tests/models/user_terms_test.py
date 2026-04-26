from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db.models import ProtectedError
from django.utils import timezone

from core.models import TermsVersion


@pytest.mark.django_db
def test_user_records_accepted_terms():
    User = get_user_model()
    now = timezone.now()
    terms = TermsVersion.objects.create(
        version="0.1.0", body="t", effective_at=now - timedelta(days=1)
    )
    user = User.objects.create_user(username="alice@x.com", email="alice@x.com")

    user.accepted_terms_version = terms
    user.accepted_terms_at = now
    user.save()
    user.refresh_from_db()

    assert user.accepted_terms_version_id == terms.id
    assert user.accepted_terms_at == now


@pytest.mark.django_db
def test_terms_version_with_acceptances_cannot_be_deleted():
    User = get_user_model()
    terms = TermsVersion.objects.create(
        version="0.1.0", body="t", effective_at=timezone.now()
    )
    user = User.objects.create_user(
        username="b@x.com",
        email="b@x.com",
        accepted_terms_version=terms,
        accepted_terms_at=timezone.now(),
    )

    with pytest.raises(ProtectedError):
        terms.delete()
    assert User.objects.filter(pk=user.pk).exists()
