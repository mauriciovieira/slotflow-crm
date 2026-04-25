from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .step_resume_views import InterviewStepResumeViewSet

router = DefaultRouter()
router.register(r"", InterviewStepResumeViewSet, basename="interview-step-resume")

urlpatterns = router.urls
