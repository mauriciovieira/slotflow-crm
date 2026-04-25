from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .opportunity_resume_views import OpportunityResumeViewSet

router = DefaultRouter()
router.register(r"", OpportunityResumeViewSet, basename="opportunity-resume")

urlpatterns = router.urls
