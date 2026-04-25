from __future__ import annotations

from rest_framework import serializers

from tenancy.models import Workspace
from tenancy.permissions import get_membership

from .models import Opportunity


class OpportunitySerializer(serializers.ModelSerializer):
    workspace = serializers.PrimaryKeyRelatedField(
        queryset=Workspace.objects.all(),
        required=False,
    )
    created_by = serializers.SerializerMethodField()

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

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Workspace is write-once: setting it on PATCH would let a caller
        # "move" an opportunity into a workspace where they have a different
        # (or no) write role, bypassing the object-level permission check that
        # ran against the *current* workspace. Lock the field on update.
        if self.instance is not None:
            self.fields["workspace"].read_only = True

    def get_created_by(self, obj: Opportunity):
        """Render `created_by` as `{id, username}` or `None` when the user has
        been deleted (`SET_NULL` on the FK). Avoids serializer crashes on
        missing creators."""
        creator = obj.created_by
        if creator is None:
            return None
        return {"id": creator.pk, "username": creator.username}

    def validate_workspace(self, workspace: Workspace | None) -> Workspace | None:
        if workspace is None:
            return None
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        if actor is None or not actor.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        if get_membership(actor, workspace) is None:
            raise serializers.ValidationError("You do not have a membership in that workspace.")
        return workspace
