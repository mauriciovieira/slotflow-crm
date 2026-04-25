from __future__ import annotations

from django.contrib import admin

from .models import Opportunity


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("title", "company", "workspace", "stage", "created_at")
    list_filter = ("stage", "workspace")
    search_fields = ("title", "company")
    readonly_fields = ("created_at", "updated_at")
