from __future__ import annotations

from rest_framework import serializers

from resumes.models import ResumeVersion

from .models import InterviewStep, InterviewStepResume


def _render_user(user) -> dict | None:
    if user is None:
        return None
    return {"id": user.pk, "username": user.username}


class InterviewStepResumeSerializer(serializers.ModelSerializer):
    resume_version_summary = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()

    class Meta:
        model = InterviewStepResume
        fields = (
            "id",
            "step",
            "resume_version",
            "resume_version_summary",
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

    def get_resume_version_summary(self, obj: InterviewStepResume):
        version = obj.resume_version
        return {
            "id": str(version.pk),
            "version_number": version.version_number,
            "base_resume_id": str(version.base_resume_id),
            "base_resume_name": version.base_resume.name,
        }

    def get_created_by(self, obj: InterviewStepResume):
        return _render_user(obj.created_by)


class InterviewStepResumeCreateSerializer(serializers.Serializer):
    step = serializers.PrimaryKeyRelatedField(queryset=InterviewStep.objects.all())
    resume_version = serializers.PrimaryKeyRelatedField(queryset=ResumeVersion.objects.all())
    note = serializers.CharField(required=False, allow_blank=True, default="")
