from __future__ import annotations

from datetime import timedelta

from django.contrib import admin, messages
from django.utils import timezone
from django.utils.html import format_html

from audit.services import write_audit_event
from invites.models import Invite
from invites.services.tokens import issue_token


class ExpiredFilter(admin.SimpleListFilter):
    title = "expiry"
    parameter_name = "expired"

    def lookups(self, request, model_admin):
        return (("active", "Active"), ("expired", "Expired"))

    def queryset(self, request, queryset):
        now = timezone.now()
        if self.value() == "active":
            return queryset.filter(status=Invite.Status.PENDING, expires_at__gt=now)
        if self.value() == "expired":
            return queryset.filter(status=Invite.Status.PENDING, expires_at__lte=now)
        return queryset


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = (
        "email",
        "computed_status",
        "expires_at",
        "accepted_at",
        "accepted_by",
        "created_by",
        "created_at",
    )
    list_filter = ("status", ExpiredFilter)
    search_fields = ("email",)
    ordering = ("-created_at",)
    readonly_fields = (
        "token_hash",
        "accepted_at",
        "accepted_by",
        "workspace",
        "created_by",
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (None, {"fields": ("email", "expires_at")}),
        (
            "Lifecycle",
            {
                "fields": (
                    "status",
                    "token_hash",
                    "accepted_at",
                    "accepted_by",
                    "workspace",
                    "created_by",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )

    actions = ("revoke_selected", "resend_selected")

    @admin.display(description="status", ordering="status")
    def computed_status(self, obj: Invite) -> str:
        if obj.status == Invite.Status.PENDING and obj.is_expired:
            return "expired"
        return obj.status

    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request, obj, change=change, **kwargs)
        if not change and "token_hash" in form.base_fields:
            del form.base_fields["token_hash"]
        return form

    def get_readonly_fields(self, request, obj=None):
        ro = list(super().get_readonly_fields(request, obj))
        if obj is not None and obj.status != Invite.Status.PENDING:
            return tuple(f.name for f in obj._meta.fields)
        if obj is not None:
            ro.append("email")
        return ro

    def save_model(self, request, obj: Invite, form, change: bool) -> None:
        if not change:
            raw, hashed = issue_token()
            obj.token_hash = hashed
            obj.created_by = request.user
            super().save_model(request, obj, form, change)
            url = request.build_absolute_uri(f"/accept-invite/{raw}/")
            messages.success(
                request,
                format_html(
                    "Invite URL: <code>{}</code> &mdash; copy now, will not be shown again.",
                    url,
                ),
            )
            write_audit_event(
                actor=request.user,
                action="invite.issued",
                entity=obj,
                metadata={"email": obj.email, "expires_at": obj.expires_at.isoformat()},
            )
        else:
            super().save_model(request, obj, form, change)

    @admin.action(description="Revoke selected invites")
    def revoke_selected(self, request, queryset):
        revoked = 0
        for invite in queryset.filter(status=Invite.Status.PENDING):
            invite.status = Invite.Status.REVOKED
            invite.save(update_fields=("status", "updated_at"))
            write_audit_event(
                actor=request.user,
                action="invite.revoked",
                entity=invite,
            )
            revoked += 1
        skipped = queryset.exclude(status=Invite.Status.PENDING).count()
        messages.success(request, f"Revoked {revoked} invite(s).")
        if skipped:
            messages.warning(request, f"Skipped {skipped} non-pending invite(s).")

    @admin.action(description="Resend selected invites (rotates token, extends expiry by 7 days)")
    def resend_selected(self, request, queryset):
        for invite in queryset.filter(status=Invite.Status.PENDING):
            old_expiry = invite.expires_at
            raw, hashed = issue_token()
            invite.token_hash = hashed
            invite.expires_at = timezone.now() + timedelta(days=7)
            invite.save(update_fields=("token_hash", "expires_at", "updated_at"))
            url = request.build_absolute_uri(f"/accept-invite/{raw}/")
            messages.success(
                request,
                format_html(
                    "{}: <code>{}</code> &mdash; copy now, will not be shown again.",
                    invite.email,
                    url,
                ),
            )
            write_audit_event(
                actor=request.user,
                action="invite.resent",
                entity=invite,
                metadata={
                    "old_expires_at": old_expiry.isoformat(),
                    "new_expires_at": invite.expires_at.isoformat(),
                },
            )

        skipped = queryset.exclude(status=Invite.Status.PENDING).count()
        if skipped:
            messages.warning(request, f"Skipped {skipped} non-pending invite(s).")

    def _audit_delete(self, request, invite: Invite) -> None:
        write_audit_event(
            actor=request.user,
            action="invite.deleted",
            entity=invite,
            metadata={"email": invite.email, "status": invite.status},
        )

    def delete_model(self, request, obj: Invite) -> None:
        self._audit_delete(request, obj)
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset) -> None:
        for invite in queryset:
            self._audit_delete(request, invite)
        super().delete_queryset(request, queryset)

    def _is_super(self, request) -> bool:
        return bool(request.user.is_authenticated and request.user.is_superuser)

    def has_module_permission(self, request):
        return self._is_super(request)

    def has_view_permission(self, request, obj=None):
        return self._is_super(request)

    def has_add_permission(self, request):
        return self._is_super(request)

    def has_change_permission(self, request, obj=None):
        return self._is_super(request)

    def has_delete_permission(self, request, obj=None):
        return self._is_super(request)
