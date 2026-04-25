from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import InterviewCycleViewSet, InterviewStepViewSet

router = DefaultRouter()
router.register(r"", InterviewCycleViewSet, basename="interview-cycle")

urlpatterns = [
    path(
        "<cycle_id>/steps/",
        InterviewStepViewSet.as_view({"get": "list", "post": "create"}),
        name="interview-cycle-steps",
    ),
    path(
        "<cycle_id>/steps/<pk>/",
        InterviewStepViewSet.as_view({"get": "retrieve"}),
        name="interview-cycle-step-detail",
    ),
    path(
        "<cycle_id>/steps/<pk>/status/",
        InterviewStepViewSet.as_view({"patch": "set_status"}),
        name="interview-cycle-step-status",
    ),
    *router.urls,
]
