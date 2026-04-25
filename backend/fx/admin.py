from __future__ import annotations

from django.contrib import admin

from .models import FxRate


@admin.register(FxRate)
class FxRateAdmin(admin.ModelAdmin):
    list_display = (
        "currency",
        "base_currency",
        "rate",
        "date",
        "source",
        "workspace",
        "created_at",
    )
    list_filter = ("source", "currency", "base_currency", "workspace")
    search_fields = ("currency", "base_currency")
    readonly_fields = ("id", "created_at", "updated_at", "created_by")
