from __future__ import annotations

from django.contrib import admin

from .models import BaseResume, ResumeVersion


class ResumeVersionInline(admin.TabularInline):
    """Read-only version log embedded inside the BaseResume admin.

    `ResumeVersion` is append-only by contract — admins should never edit
    or delete historical snapshots from the inline. Disable add / change /
    delete here so the admin UI matches the invariant.
    """

    model = ResumeVersion
    extra = 0
    can_delete = False
    fields = ("version_number", "document_hash", "created_by", "created_at")
    readonly_fields = ("version_number", "document_hash", "created_by", "created_at")

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(BaseResume)
class BaseResumeAdmin(admin.ModelAdmin):
    list_display = ("name", "workspace", "created_by", "created_at")
    list_filter = ("workspace",)
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [ResumeVersionInline]


@admin.register(ResumeVersion)
class ResumeVersionAdmin(admin.ModelAdmin):
    list_display = ("base_resume", "version_number", "document_hash", "created_at")
    list_filter = ("base_resume__workspace",)
    search_fields = ("base_resume__name",)
    # Versions are immutable snapshots; lock the structural fields so an
    # admin can't re-parent them or rewrite history. The JSON `document` and
    # `notes` stay editable for support convenience until a real edit flow
    # lands; everything else is fixed.
    readonly_fields = (
        "id",
        "base_resume",
        "version_number",
        "document_hash",
        "created_by",
        "created_at",
        "updated_at",
    )
