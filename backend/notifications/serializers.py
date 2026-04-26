from __future__ import annotations

from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id",
            "kind",
            "payload",
            "workspace",
            "read_at",
            "created_at",
        )
        read_only_fields = fields
