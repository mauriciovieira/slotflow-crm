from __future__ import annotations

import json
import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Max
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from tenancy.models import Membership

from .models import BaseResume, ResumeVersion
from .permissions import IsWorkspaceMember
from .serializers import (
    BaseResumeSerializer,
    ResumeVersionCreateSerializer,
    ResumeVersionSerializer,
)
from .services import (
    WorkspaceMembershipRequired,
    WorkspaceWriteForbidden,
    archive_resume,
    create_resume,
    create_resume_version,
    import_resume_json,
)


class BaseResumeViewSet(viewsets.ModelViewSet):
    """Workspace-scoped CRUD for BaseResume. Soft-delete via DELETE."""

    serializer_class = BaseResumeSerializer
    permission_classes = [permissions.IsAuthenticated, IsWorkspaceMember]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        user = self.request.user
        # Annotate the newest `version_number` directly on the row instead of
        # fetching version objects. The list serializer only renders
        # `{"version_number": N}` for `latest_version`, so this stays:
        #   - O(1) queries (one SELECT with a JOIN+aggregate, no prefetch),
        #   - O(1) per-row memory (a single int column, not a JSONField row),
        #   - Correct under arbitrary version-history depth.
        # Detail-level consumers needing the full version object should hit
        # `/api/resumes/<id>/versions/` directly.
        qs = (
            BaseResume.objects.filter(
                workspace__memberships__user=user,
                archived_at__isnull=True,
            )
            .annotate(_latest_version_number=Max("versions__version_number"))
            .select_related("workspace", "created_by")
            .distinct()
        )
        workspace = self.request.query_params.get("workspace")
        if workspace:
            try:
                uuid.UUID(workspace)
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValidationError({"workspace": "Invalid workspace UUID."}) from exc
            qs = qs.filter(workspace_id=workspace)
        return qs

    def _resolve_active_workspace(self, validated_data):
        from tenancy.active_workspace import get_active_workspace

        if "workspace" in validated_data and validated_data["workspace"] is not None:
            return validated_data["workspace"]

        active = get_active_workspace(self.request._request)
        if active is not None:
            return active

        memberships = list(
            Membership.objects.filter(user=self.request.user).select_related("workspace")[:2]
        )
        if len(memberships) == 0:
            raise ValidationError({"workspace": "You don't belong to any workspace yet."})
        if len(memberships) > 1:
            raise ValidationError(
                {
                    "workspace": (
                        "You belong to multiple workspaces; specify `workspace` "
                        "in the request body or pick one via "
                        "/api/auth/active-workspace/."
                    )
                }
            )
        return memberships[0].workspace

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        workspace = self._resolve_active_workspace(serializer.validated_data)
        try:
            resume = create_resume(
                actor=request.user,
                workspace=workspace,
                name=serializer.validated_data["name"],
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            # Either the membership disappeared between the serializer's
            # workspace-validation step and the service call, or the role
            # is read-only. Both surface as 403 (matches the role gate
            # already returned by `IsWorkspaceMember` for PATCH/DELETE).
            raise PermissionDenied(str(exc)) from exc
        out = self.get_serializer(resume)
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        try:
            archive_resume(actor=self.request.user, base_resume=instance)
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc


class ResumeVersionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Versions for a single BaseResume — `/api/resumes/<base_resume_id>/versions/`."""

    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "create":
            return ResumeVersionCreateSerializer
        return ResumeVersionSerializer

    def _get_base_resume(self) -> BaseResume:
        raw = self.kwargs.get("base_resume_id")
        try:
            uuid.UUID(str(raw))
        except (ValueError, AttributeError, TypeError) as exc:
            raise Http404("Invalid base resume id.") from exc
        try:
            base_resume = get_object_or_404(
                BaseResume.objects.select_related("workspace"),
                pk=raw,
                archived_at__isnull=True,
            )
        except DjangoValidationError as exc:
            raise Http404("Invalid base resume id.") from exc
        from tenancy.permissions import get_membership

        if get_membership(self.request.user, base_resume.workspace) is None:
            raise Http404("Base resume not found.")
        return base_resume

    def get_queryset(self):
        base_resume = self._get_base_resume()
        return ResumeVersion.objects.filter(base_resume=base_resume).select_related("created_by")

    def create(self, request, *args, **kwargs):
        base_resume = self._get_base_resume()
        # `self.get_serializer(...)` resolves to `ResumeVersionCreateSerializer`
        # via `get_serializer_class` for the create action, and threads the
        # standard DRF context (request/format/view) automatically — which
        # `ResumeVersionCreateSerializer` may grow to need without us
        # remembering to pass it here.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            version = create_resume_version(
                actor=request.user,
                base_resume=base_resume,
                document=serializer.validated_data["document"],
                notes=serializer.validated_data.get("notes", ""),
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        # Use the standard DRF context for the response serializer too, so
        # `request`, `format`, and `view` stay consistent.
        out = ResumeVersionSerializer(version, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)

    # NOTE: no `parser_classes=[...]` here. DRF's default parsers
    # (JSONParser + FormParser + MultiPartParser) already cover both the
    # JSON body and multipart file paths we need. Setting it on `@action`
    # would also be a no-op: `resumes/urls.py` mounts this action via an
    # explicit `path(..., ResumeVersionViewSet.as_view({"post": "import_version"}))`
    # rather than the DRF router, and only router-generated routes read
    # action-level metadata. Subclass / set on the viewset class if a
    # tighter parser allowlist is ever needed.
    @action(detail=False, methods=["post"], url_path="import")
    def import_version(self, request, base_resume_id=None):
        """Create a new ResumeVersion from a JSON document.

        Two input shapes:
          - JSON body: ``{"document": <object>, "notes"?: <str>}``
          - multipart/form-data: a ``file`` part containing the JSON, plus
            optional ``notes``.

        Both flow into the same `import_resume_json` service so the audit
        trail records `resume_version.imported` regardless of input shape.
        """
        base_resume = self._get_base_resume()
        document, notes = self._parse_import_payload(request)
        try:
            version = import_resume_json(
                actor=request.user,
                base_resume=base_resume,
                document=document,
                notes=notes,
                source="api",
            )
        except (WorkspaceMembershipRequired, WorkspaceWriteForbidden) as exc:
            raise PermissionDenied(str(exc)) from exc
        out = ResumeVersionSerializer(version, context=self.get_serializer_context())
        return Response(out.data, status=status.HTTP_201_CREATED)

    @staticmethod
    def _parse_import_payload(request):
        """Pull `document` + `notes` out of either a JSON body or a
        multipart upload. Multipart wins when a `file` part is present.
        Raises 400 with descriptive messages on bad input.

        Error keys mirror the input shape so the FE can render messages
        next to the right control: file uploads surface under `file`,
        JSON bodies under `document`.
        """
        notes = ""
        upload = request.FILES.get("file") if hasattr(request, "FILES") else None
        if upload is not None:
            try:
                raw = upload.read().decode("utf-8")
            except UnicodeDecodeError as exc:
                raise ValidationError({"file": "File is not valid UTF-8 text."}) from exc
            try:
                document = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise ValidationError({"file": f"Invalid JSON: {exc.msg}."}) from exc
            if not isinstance(document, dict):
                raise ValidationError({"file": "File must contain a JSON object at the top level."})
            # `request.data` for multipart forms can carry sibling fields.
            notes_raw = request.data.get("notes") if hasattr(request.data, "get") else None
            if isinstance(notes_raw, str):
                notes = notes_raw
            return document, notes

        # JSON body path: reject non-object root explicitly so the user
        # gets "must be a JSON object" instead of the unhelpful
        # "provide a document" cascade triggered by a list/scalar root.
        if not isinstance(request.data, dict):
            raise ValidationError({"non_field_errors": ["Request body must be a JSON object."]})
        data = request.data
        if "document" not in data:
            raise ValidationError(
                {"document": "Provide a `document` JSON object or a `file` upload."}
            )
        document = data.get("document")
        if "notes" in data:
            notes_raw = data.get("notes")
            # Don't silently drop a non-string `notes` — surface a 400 so the
            # caller knows their payload was malformed instead of finding the
            # field empty after the fact.
            if not isinstance(notes_raw, str):
                raise ValidationError({"notes": "Notes must be a string."})
            notes = notes_raw
        if not isinstance(document, dict):
            raise ValidationError({"document": "Document must be a JSON object."})
        return document, notes
