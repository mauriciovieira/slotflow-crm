from __future__ import annotations

from django.contrib import admin

from .models import BaseResume, ResumeVersion


class ResumeVersionInline(admin.TabularInline):
    model = ResumeVersion
    extra = 0
    fields = ("version_number", "document_hash", "created_by", "created_at")
    readonly_fields = ("version_number", "document_hash", "created_at")


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
    readonly_fields = (
        "id",
        "version_number",
        "document_hash",
        "created_at",
        "updated_at",
    )
