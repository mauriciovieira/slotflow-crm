from __future__ import annotations

from django.urls import path

from .views import collection_view, detail_view

urlpatterns = [
    path("", collection_view, name="mcp_token_collection"),
    path("<uuid:token_id>/", detail_view, name="mcp_token_detail"),
]
