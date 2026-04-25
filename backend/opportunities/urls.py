from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import OpportunityViewSet

router = DefaultRouter()
router.register(r"", OpportunityViewSet, basename="opportunity")

urlpatterns = router.urls
