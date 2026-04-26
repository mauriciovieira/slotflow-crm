from __future__ import annotations

from django.urls import path

from .views import accept_invitation_view

# Mounted under `/api/invitations/` so the bearer token accept URL is
# top-level: `/api/invitations/<token>/accept/`.

urlpatterns = [
    path(
        "<str:token>/accept/",
        accept_invitation_view,
        name="invitation-accept",
    ),
]
