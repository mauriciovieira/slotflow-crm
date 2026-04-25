from __future__ import annotations

from django.urls import path

from .views import CompensationSnapshotView

urlpatterns = [
    path(
        "compensation-snapshot/",
        CompensationSnapshotView.as_view(),
        name="insights-compensation-snapshot",
    ),
]
