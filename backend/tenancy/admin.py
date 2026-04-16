from __future__ import annotations

from django.contrib import admin

from tenancy.models import Membership, Workspace


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at", "updated_at")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ("workspace", "user", "role", "created_at", "updated_at")
    list_filter = ("role",)
    autocomplete_fields = ("workspace", "user")
