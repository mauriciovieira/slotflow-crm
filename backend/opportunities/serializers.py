from __future__ import annotations

from rest_framework import serializers

from tenancy.models import Workspace
from tenancy.permissions import get_membership

from .models import Opportunity


class _CreatedBySerializer(serializers.Serializer):
    """Public-safe slice of the user creator: id + username only."""

    id = serializers.IntegerField()
    username = serializers.CharField()


class OpportunitySerializer(serializers.ModelSerializer):
    workspace = serializers.PrimaryKeyRelatedField(
        queryset=Workspace.objects.all(),
        required=False,
        allow_null=True,
    )
    created_by = _CreatedBySerializer(read_only=True)

    class Meta:
        model = Opportunity
        fields = (
            "id",
            "workspace",
            "title",
            "company",
            "stage",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
            "archived_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at", "archived_at")

    def validate_workspace(self, workspace: Workspace) -> Workspace:
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        if actor is None or not actor.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        if get_membership(actor, workspace) is None:
            raise serializers.ValidationError("You do not have a membership in that workspace.")
        return workspace
