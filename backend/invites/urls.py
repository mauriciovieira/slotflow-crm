from __future__ import annotations

from django.urls import path

from invites.api import preflight_view

urlpatterns = [
    path("<str:token>/", preflight_view, name="invite_preflight"),
]
