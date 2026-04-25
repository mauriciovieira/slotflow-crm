from __future__ import annotations

from rest_framework import serializers

from resumes.models import ResumeVersion

from .models import Opportunity, OpportunityResume, OpportunityResumeRole


def _render_user(user) -> dict | None:
    if user is None:
        return None
    return {"id": user.pk, "username": user.username}


class OpportunityResumeSerializer(serializers.ModelSerializer):
    # `resume_version_summary` is a hand-built dict rather than a nested
    # serializer because the shape is tiny, fully denormalised from
    # `select_related("resume_version__base_resume")`, and never deserialised
    # from input — keeping it as a method field avoids carrying an unused
    # `Serializer` class around.
    resume_version_summary = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = OpportunityResume
        fields = (
            "id",
            "opportunity",
            "resume_version",
            "resume_version_summary",
            "role",
            "note",
            "created_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "resume_version_summary",
            "created_by",
            "created_at",
            "updated_at",
        )

    def get_resume_version_summary(self, obj: OpportunityResume):
        version = obj.resume_version
        return {
            "id": str(version.pk),
            "version_number": version.version_number,
            "base_resume_id": str(version.base_resume_id),
            "base_resume_name": version.base_resume.name,
        }

    def get_created_by(self, obj: OpportunityResume):
        return _render_user(obj.created_by)


class OpportunityResumeCreateSerializer(serializers.Serializer):
    opportunity = serializers.PrimaryKeyRelatedField(queryset=Opportunity.objects.all())
    resume_version = serializers.PrimaryKeyRelatedField(queryset=ResumeVersion.objects.all())
    role = serializers.ChoiceField(choices=OpportunityResumeRole.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")
