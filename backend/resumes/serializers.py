from __future__ import annotations

from rest_framework import serializers

from tenancy.models import Workspace
from tenancy.permissions import get_membership

from .models import BaseResume, ResumeVersion

# Sentinel used by `BaseResumeSerializer.get_latest_version` to distinguish
# "annotation absent on the instance" from "annotation present but NULL".
# Plain `None` cannot serve here because `Max(...)` returns NULL for resumes
# with zero versions, and that NULL must short-circuit to `None` without
# triggering a fallback DB query.
_MISSING = object()


def _render_user(user) -> dict | None:
    if user is None:
        return None
    return {"id": user.pk, "username": user.username}


class ResumeVersionSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = ResumeVersion
        fields = (
            "id",
            "base_resume",
            "version_number",
            "document",
            "document_hash",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "base_resume",
            "version_number",
            "document_hash",
            "created_by",
            "created_at",
            "updated_at",
        )

    def get_created_by(self, obj: ResumeVersion):
        return _render_user(obj.created_by)


class ResumeVersionCreateSerializer(serializers.Serializer):
    document = serializers.JSONField()
    notes = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_document(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("document must be a JSON object.")
        return value


class BaseResumeSerializer(serializers.ModelSerializer):
    workspace = serializers.PrimaryKeyRelatedField(
        queryset=Workspace.objects.all(),
        required=False,
    )
    created_by = serializers.SerializerMethodField()
    latest_version = serializers.SerializerMethodField()

    class Meta:
        model = BaseResume
        fields = (
            "id",
            "workspace",
            "name",
            "created_by",
            "created_at",
            "updated_at",
            "archived_at",
            "latest_version",
        )
        read_only_fields = (
            "id",
            "created_by",
            "created_at",
            "updated_at",
            "archived_at",
            "latest_version",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["workspace"].read_only = True

    def get_created_by(self, obj: BaseResume):
        return _render_user(obj.created_by)

    def get_latest_version(self, obj: BaseResume):
        # The viewset annotates `_latest_version_number` (a single integer
        # column) onto each row to avoid loading version objects on list
        # endpoints — version histories can grow long, so we never prefetch
        # the whole set just to render the number. The annotation is
        # `Max(...)`, which is `None` when the resume has zero versions, so
        # we need a sentinel to distinguish "annotation missing" (no
        # queryset annotation, e.g. service-layer test) from "annotation
        # present but NULL" (no versions exist) — otherwise we'd issue an
        # unnecessary follow-up query in the latter case.
        annotated_number = getattr(obj, "_latest_version_number", _MISSING)
        if annotated_number is _MISSING:
            latest = obj.versions.first()
            if latest is None:
                return None
            return {"version_number": latest.version_number}
        if annotated_number is None:
            return None
        return {"version_number": annotated_number}

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
