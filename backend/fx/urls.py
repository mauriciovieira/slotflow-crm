from __future__ import annotations

from rest_framework.routers import DefaultRouter

from .views import FxRateViewSet

router = DefaultRouter()
router.register(r"", FxRateViewSet, basename="fx-rate")

urlpatterns = router.urls
