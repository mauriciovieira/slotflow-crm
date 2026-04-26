from __future__ import annotations

from rest_framework import serializers

from .models import Invitation, Membership


class MemberSerializer(serializers.ModelSerializer):
    """Read-only payload for the workspace members table."""

    user_id = serializers.UUIDField(source="user.id", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Membership
        fields = ("id", "user_id", "username", "email", "role", "created_at")
        read_only_fields = fields


class InvitationSerializer(serializers.ModelSerializer):
    """Pending-invitation payload (owner-only listing)."""

    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = Invitation
        fields = (
            "id",
            "email",
            "role",
            "expires_at",
            "accepted_at",
            "revoked_at",
            "created_at",
            "is_active",
        )
        read_only_fields = fields
