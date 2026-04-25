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

# Sentinel used by `get_last_step_status` to distinguish
# "annotation absent on the instance" (service-layer / admin path) from
# "annotation present but NULL" (cycle has no steps). Plain `None` cannot
# serve here because the Subquery annotation legitimately returns NULL for
# step-less cycles, and that NULL must short-circuit to `None` without
# triggering a fallback DB query.
_MISSING = object()


class InterviewCycleSerializer(serializers.ModelSerializer):
    opportunity = serializers.PrimaryKeyRelatedField(queryset=Opportunity.objects.all())
    opportunity_title = serializers.SerializerMethodField()
    opportunity_company = serializers.SerializerMethodField()
    steps_count = serializers.SerializerMethodField()
    last_step_status = serializers.SerializerMethodField()

    class Meta:
        model = InterviewCycle
        fields = (
            "id",
            "opportunity",
            "opportunity_title",
            "opportunity_company",
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
            "opportunity_title",
            "opportunity_company",
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

    def get_opportunity_title(self, obj: InterviewCycle):
        return obj.opportunity.title if obj.opportunity_id else None

    def get_opportunity_company(self, obj: InterviewCycle):
        return obj.opportunity.company if obj.opportunity_id else None

    def get_steps_count(self, obj: InterviewCycle):
        annotated = getattr(obj, "_steps_count", _MISSING)
        if annotated is _MISSING:
            return obj.steps.count()
        return annotated

    def get_last_step_status(self, obj: InterviewCycle):
        # Subquery annotation: NULL when the cycle has no steps. Use a
        # sentinel to distinguish that legitimate NULL from "annotation
        # absent on the instance" (service-layer / admin path) so the
        # NULL short-circuits to None without an extra DB round-trip.
        annotated = getattr(obj, "_last_step_status", _MISSING)
        if annotated is _MISSING:
            last = obj.steps.order_by("-sequence").first()
            return last.status if last else None
        return annotated

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
