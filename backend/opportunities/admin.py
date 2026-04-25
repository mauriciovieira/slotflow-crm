from __future__ import annotations

from django.contrib import admin

from .models import Opportunity, OpportunityResume


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("title", "company", "workspace", "stage", "archived_at", "created_at")
    list_filter = ("stage", "workspace", "archived_at")
    search_fields = ("title", "company")
    readonly_fields = ("created_at", "updated_at", "archived_at")


@admin.register(OpportunityResume)
class OpportunityResumeAdmin(admin.ModelAdmin):
    list_display = ("opportunity", "resume_version", "role", "created_by", "created_at")
    list_filter = ("role", "opportunity__workspace")
    search_fields = (
        "opportunity__title",
        "opportunity__company",
        "resume_version__base_resume__name",
    )
    readonly_fields = ("created_at", "updated_at", "created_by")
