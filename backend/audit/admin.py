from __future__ import annotations

from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    """Read-only browse. Audit log is append-only — no admin writes."""

    list_display = (
        "created_at",
        "actor_repr",
        "action",
        "entity_type",
        "entity_id",
        "workspace",
    )
    list_filter = ("action", "workspace")
    search_fields = ("actor_repr", "action", "entity_id", "correlation_id")
    readonly_fields = (
        "id",
        "actor",
        "actor_repr",
        "action",
        "entity_type",
        "entity_id",
        "workspace",
        "correlation_id",
        "metadata",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
