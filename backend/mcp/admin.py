from __future__ import annotations

from django.contrib import admin

from .models import McpToken


@admin.register(McpToken)
class McpTokenAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "user",
        "last_four",
        "expires_at",
        "revoked_at",
        "last_used_at",
        "created_at",
    )
    list_filter = ("revoked_at", "expires_at")
    search_fields = ("name", "user__username", "user__email")
    readonly_fields = (
        "id",
        "token_hash",
        "last_four",
        "created_at",
        "updated_at",
        "last_used_at",
    )
