from __future__ import annotations

from django.contrib import admin

from .models import InterviewCycle, InterviewStep


class InterviewStepInline(admin.TabularInline):
    model = InterviewStep
    extra = 0
    fields = (
        "sequence",
        "kind",
        "status",
        "scheduled_for",
        "duration_minutes",
        "interviewer",
    )
    readonly_fields = ("sequence",)


@admin.register(InterviewCycle)
class InterviewCycleAdmin(admin.ModelAdmin):
    list_display = ("name", "opportunity", "started_at", "closed_at", "created_at")
    list_filter = ("opportunity__workspace",)
    search_fields = ("name", "opportunity__title", "opportunity__company")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [InterviewStepInline]


@admin.register(InterviewStep)
class InterviewStepAdmin(admin.ModelAdmin):
    list_display = ("cycle", "sequence", "kind", "status", "scheduled_for", "interviewer")
    list_filter = ("kind", "status", "cycle__opportunity__workspace")
    search_fields = ("interviewer", "notes")
    readonly_fields = ("id", "sequence", "created_at", "updated_at")
