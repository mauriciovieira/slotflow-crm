from __future__ import annotations

from django.conf import settings
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

import identity.admin  # noqa: F401  # OTP admin site/User admin side effects
from core.api_auth import (
    login_view,
    logout_view,
    me_view,
    totp_confirm_view,
    totp_setup_view,
    totp_verify_view,
)
from core.api_test_reset import api_test_patterns
from core.views import (
    HealthzView,
    HomeView,
    McpPingView,
    TwoFactorConfirmView,
    TwoFactorSetupView,
    TwoFactorVerifyView,
)

api_auth_patterns = [
    path("login/", login_view, name="api_auth_login"),
    path("logout/", logout_view, name="api_auth_logout"),
    path("me/", me_view, name="api_auth_me"),
    path("2fa/setup/", totp_setup_view, name="api_auth_totp_setup"),
    path("2fa/confirm/", totp_confirm_view, name="api_auth_totp_confirm"),
    path("2fa/verify/", totp_verify_view, name="api_auth_totp_verify"),
]

urlpatterns = [
    path("healthz", HealthzView.as_view(), name="healthz"),
    path("admin/", admin.site.urls),
    path("accounts/login/", auth_views.LoginView.as_view(), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("2fa/setup/", TwoFactorSetupView.as_view(), name="two_factor_setup"),
    path("2fa/confirm/", TwoFactorConfirmView.as_view(), name="two_factor_confirm"),
    path("2fa/verify/", TwoFactorVerifyView.as_view(), name="two_factor_verify"),
    path("api/auth/", include(api_auth_patterns)),
    path("api/opportunities/", include("opportunities.urls")),
    path("api/mcp/tokens/", include("mcp.tokens.urls")),
    path("api/test/", include(api_test_patterns)),
    path("mcp/ping", McpPingView.as_view(), name="mcp_ping"),
    path("", HomeView.as_view(), name="home"),
]

if settings.DEBUG and "debug_toolbar" in settings.INSTALLED_APPS:
    import debug_toolbar

    urlpatterns = [
        path("__debug__/", include(debug_toolbar.urls)),
    ] + urlpatterns
