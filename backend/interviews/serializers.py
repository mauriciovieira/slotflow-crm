from __future__ import annotations

from rest_framework import serializers

from opportunities.models import Opportunity
from tenancy.permissions import get_membership

from .models import (
    InterviewCycle,
    InterviewStep,
    InterviewStepKind,
    InterviewStepStatus,
)


class InterviewCycleSerializer(serializers.ModelSerializer):
    opportunity = serializers.PrimaryKeyRelatedField(queryset=Opportunity.objects.all())
    steps_count = serializers.SerializerMethodField()
    last_step_status = serializers.SerializerMethodField()

    class Meta:
        model = InterviewCycle
        fields = (
            "id",
            "opportunity",
            "name",
            "started_at",
            "closed_at",
            "notes",
            "steps_count",
            "last_step_status",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "started_at",
            "closed_at",
            "steps_count",
            "last_step_status",
            "created_at",
            "updated_at",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Opportunity is write-once: moving a cycle to a different opportunity
        # would also move it across workspaces, bypassing the object-level
        # permission check that ran against the original.
        if self.instance is not None:
            self.fields["opportunity"].read_only = True

    def get_steps_count(self, obj: InterviewCycle):
        annotated = getattr(obj, "_steps_count", None)
        if annotated is not None:
            return annotated
        return obj.steps.count()

    def get_last_step_status(self, obj: InterviewCycle):
        annotated = getattr(obj, "_last_step_status", None)
        if annotated is not None:
            return annotated
        last = obj.steps.order_by("-sequence").first()
        return last.status if last else None

    def validate_opportunity(self, opportunity: Opportunity) -> Opportunity:
        request = self.context.get("request")
        actor = getattr(request, "user", None)
        if actor is None or not actor.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        if get_membership(actor, opportunity.workspace) is None:
            raise serializers.ValidationError(
                "You do not have a membership in that opportunity's workspace."
            )
        return opportunity


class InterviewStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewStep
        fields = (
            "id",
            "cycle",
            "sequence",
            "kind",
            "status",
            "scheduled_for",
            "duration_minutes",
            "interviewer",
            "notes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "cycle",
            "sequence",
            "status",
            "created_at",
            "updated_at",
        )


class InterviewStepCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=InterviewStepKind.choices, default=InterviewStepKind.OTHER
    )
    scheduled_for = serializers.DateTimeField(required=False, allow_null=True)
    duration_minutes = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    interviewer = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class InterviewStepStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=InterviewStepStatus.choices)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
