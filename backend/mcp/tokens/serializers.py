from __future__ import annotations

from rest_framework import serializers

from mcp.models import McpToken

from .services import DEFAULT_TTL_DAYS, MAX_TTL_DAYS


class McpTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = McpToken
        fields = (
            "id",
            "name",
            "last_four",
            "expires_at",
            "created_at",
            "updated_at",
            "revoked_at",
            "last_used_at",
        )
        read_only_fields = fields


class McpTokenIssueSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    ttl_days = serializers.IntegerField(
        min_value=1, max_value=MAX_TTL_DAYS, required=False, default=DEFAULT_TTL_DAYS
    )
