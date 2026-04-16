from __future__ import annotations

from django.contrib import admin
from django.contrib.admin import ModelAdmin
from django_otp.admin import OTPAdminSite

from identity.models import User

# Enforce OTP verification for Django admin sessions.
admin.site.__class__ = OTPAdminSite


@admin.register(User)
class UserAdmin(ModelAdmin):
    list_display = ("username", "email", "is_staff", "is_active", "is_superuser")
    search_fields = ("username", "email")
    ordering = ("username",)
