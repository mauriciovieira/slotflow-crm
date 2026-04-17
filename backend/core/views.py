from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.utils.decorators import method_decorator
from django.views import View
from django.views.generic import FormView, TemplateView
from django_otp import login as otp_login
from django_otp.plugins.otp_totp.models import TOTPDevice

from config.version import __version__
from mcp.auth import McpAuthError, mark_otp_session_fresh, require_fresh_2fa_session

from .forms import TokenForm
from .totp_qr import build_totp_qr_svg


class HealthzView(View):
    def get(self, request: HttpRequest) -> HttpResponse:
        return JsonResponse({"status": "ok", "version": __version__})


@method_decorator(login_required, name="dispatch")
class HomeView(TemplateView):
    template_name = "core/home.html"


@method_decorator(login_required, name="dispatch")
class TwoFactorSetupView(TemplateView):
    template_name = "core/two_factor_setup.html"

    def get_context_data(self, **kwargs):  # type: ignore[override]
        context = super().get_context_data(**kwargs)
        # django_otp Device.confirmed defaults to True; we must create unconfirmed devices
        # so the user scans the QR and completes /2fa/confirm/ before the device is trusted.
        device, _created = TOTPDevice.objects.get_or_create(
            user=self.request.user,
            name="default",
            defaults={"confirmed": False},
        )
        needs_confirmation = not device.confirmed
        otpauth_uri = device.config_url
        context["needs_confirmation"] = needs_confirmation
        context["otpauth_uri"] = otpauth_uri
        context["qr_svg"] = build_totp_qr_svg(otpauth_uri) if needs_confirmation else ""
        return context


@method_decorator(login_required, name="dispatch")
class TwoFactorConfirmView(FormView):
    template_name = "core/two_factor_confirm.html"
    form_class = TokenForm
    success_url = reverse_lazy("home")

    def form_valid(self, form):  # type: ignore[override]
        device = (
            TOTPDevice.objects.filter(user=self.request.user, name="default")
            .order_by("-id")
            .first()
        )
        if device is None:
            form.add_error(None, "No TOTP device found; start setup first.")
            return self.form_invalid(form)

        if device.confirmed:
            return redirect(self.get_success_url())

        token = form.cleaned_data["token"].replace(" ", "")
        if device.verify_token(token):
            device.confirmed = True
            device.save(update_fields=["confirmed"])
            otp_login(self.request, device)
            mark_otp_session_fresh(self.request)
            return super().form_valid(form)

        form.add_error("token", "Invalid token.")
        return self.form_invalid(form)


@method_decorator(login_required, name="dispatch")
class TwoFactorVerifyView(FormView):
    template_name = "core/two_factor_verify.html"
    form_class = TokenForm
    success_url = reverse_lazy("home")

    def dispatch(self, request, *args, **kwargs):  # type: ignore[override]
        if request.user.is_verified():
            return redirect(self.get_success_url())
        return super().dispatch(request, *args, **kwargs)

    def form_valid(self, form):  # type: ignore[override]
        devices = TOTPDevice.objects.devices_for_user(self.request.user).filter(confirmed=True)
        token = form.cleaned_data["token"].replace(" ", "")
        for device in devices:
            if device.verify_token(token):
                otp_login(self.request, device)
                mark_otp_session_fresh(self.request)
                return super().form_valid(form)

        form.add_error("token", "Invalid token.")
        return self.form_invalid(form)


@method_decorator(login_required, name="dispatch")
class McpPingView(View):
    def get(self, request: HttpRequest) -> HttpResponse:
        try:
            require_fresh_2fa_session(request)
        except McpAuthError as exc:
            return JsonResponse({"ok": False, "error": str(exc)}, status=exc.status_code)
        return JsonResponse({"ok": True})
