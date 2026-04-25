from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BaseResumeViewSet, ResumeVersionViewSet

router = DefaultRouter()
router.register(r"", BaseResumeViewSet, basename="resume")

urlpatterns = [
    path(
        "<base_resume_id>/versions/",
        ResumeVersionViewSet.as_view({"get": "list", "post": "create"}),
        name="resume-versions",
    ),
    path(
        "<base_resume_id>/versions/<pk>/",
        ResumeVersionViewSet.as_view({"get": "retrieve"}),
        name="resume-version-detail",
    ),
    *router.urls,
]
