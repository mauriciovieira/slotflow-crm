from __future__ import annotations

from django.urls import path

from invites.api import (
    accept_password_view,
    oauth_start_view,
    preflight_view,
)

urlpatterns = [
    path("<str:token>/", preflight_view, name="invite_preflight"),
    path("<str:token>/accept-password/", accept_password_view, name="invite_accept_password"),
    path("<str:token>/oauth-start/", oauth_start_view, name="invite_oauth_start"),
]
