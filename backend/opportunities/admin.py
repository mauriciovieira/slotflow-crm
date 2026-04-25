from __future__ import annotations

from django.contrib import admin

from .models import Opportunity


@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ("title", "company", "workspace", "stage", "archived_at", "created_at")
    list_filter = ("stage", "workspace", "archived_at")
    search_fields = ("title", "company")
    readonly_fields = ("created_at", "updated_at", "archived_at")
