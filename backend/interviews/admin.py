from __future__ import annotations

from django.contrib import admin

from .models import InterviewCycle, InterviewStep, InterviewStepResume


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

    def get_readonly_fields(self, request, obj=None):
        # `sequence` must be editable on add (the field is required and has no
        # default). Lock it once the row exists so an admin can't accidentally
        # renumber an established cycle.
        if obj is not None:
            return ("sequence",)
        return ()


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
    readonly_fields = ("id", "created_at", "updated_at")

    def get_readonly_fields(self, request, obj=None):
        # `sequence` is a required field with no default — it must stay
        # editable on the add form. Lock it for change so admins don't
        # silently renumber an existing step.
        if obj is not None:
            return self.readonly_fields + ("sequence",)
        return self.readonly_fields


@admin.register(InterviewStepResume)
class InterviewStepResumeAdmin(admin.ModelAdmin):
    list_display = ("step", "resume_version", "created_by", "created_at")
    list_filter = ("step__cycle__opportunity__workspace",)
    search_fields = (
        "step__cycle__name",
        "resume_version__base_resume__name",
        "note",
    )
    readonly_fields = ("created_at", "updated_at", "created_by")
