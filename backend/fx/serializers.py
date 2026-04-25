from __future__ import annotations

from rest_framework import serializers

from tenancy.models import Workspace
from tenancy.permissions import get_membership

from .models import FxRate


def _render_user(user) -> dict | None:
    if user is None:
        return None
    return {"id": user.pk, "username": user.username}


class FxRateSerializer(serializers.ModelSerializer):
    workspace = serializers.PrimaryKeyRelatedField(queryset=Workspace.objects.all())
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = FxRate
        fields = (
            "id",
            "workspace",
            "currency",
            "base_currency",
            "rate",
            "date",
            "source",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "source",
            "created_by",
            "created_at",
            "updated_at",
        )
        # Drop the auto-generated UniqueTogetherValidator: this serializer
        # is an *upsert* surface, not a strict create. The view delegates
        # to `upsert_fx_rate(...)` which calls `update_or_create`, so a
        # second POST with the same key should update (not 400). The DB
        # constraint still protects against true races.
        validators = []

    def get_created_by(self, obj: FxRate):
        return _render_user(obj.created_by)

    def validate_rate(self, value):
        # The service enforces this too, but rejecting at the serializer
        # gives a clean field-keyed error instead of a generic one.
        if value is None or value <= 0:
            raise serializers.ValidationError("Rate must be > 0.")
        return value

    def validate_workspace(self, workspace: Workspace) -> Workspace:
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        if actor is None or not actor.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        if get_membership(actor, workspace) is None:
            raise serializers.ValidationError("You do not have a membership in that workspace.")
        return workspace
