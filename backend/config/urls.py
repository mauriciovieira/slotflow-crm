from __future__ import annotations

from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import path

import config.admin  # noqa: F401  # OTP admin site configuration (side effects)
from core.views import (
    HealthzView,
    HomeView,
    McpPingView,
    TwoFactorConfirmView,
    TwoFactorSetupView,
    TwoFactorVerifyView,
)

urlpatterns = [
    path("healthz", HealthzView.as_view(), name="healthz"),
    path("admin/", admin.site.urls),
    path("accounts/login/", auth_views.LoginView.as_view(), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("2fa/setup/", TwoFactorSetupView.as_view(), name="two_factor_setup"),
    path("2fa/confirm/", TwoFactorConfirmView.as_view(), name="two_factor_confirm"),
    path("2fa/verify/", TwoFactorVerifyView.as_view(), name="two_factor_verify"),
    path("mcp/ping", McpPingView.as_view(), name="mcp_ping"),
    path("", HomeView.as_view(), name="home"),
]
