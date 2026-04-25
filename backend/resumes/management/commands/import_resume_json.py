from __future__ import annotations

import json
import sys

from django.core.management.base import BaseCommand, CommandError

from resumes.models import BaseResume
from resumes.services import import_resume_json


class Command(BaseCommand):
    help = (
        "Create a new ResumeVersion under an existing BaseResume from a JSON "
        "Resume document on disk (or stdin via '-'). Audited as a system import."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "base_resume_uuid",
            help="UUID of the BaseResume the new version attaches to.",
        )
        parser.add_argument(
            "path",
            help="Path to a JSON file, or '-' to read from stdin.",
        )
        parser.add_argument(
            "--notes",
            default="",
            help="Optional notes string attached to the new version.",
        )

    def handle(self, *args, **options):
        # Match the API surface: archived base resumes are invisible to
        # the dashboard, so the command shouldn't quietly land new
        # versions on them either.
        try:
            base_resume = BaseResume.objects.get(
                pk=options["base_resume_uuid"], archived_at__isnull=True
            )
        except BaseResume.DoesNotExist as exc:
            raise CommandError(
                f"BaseResume {options['base_resume_uuid']} not found (or has been archived)."
            ) from exc

        path = options["path"]
        if path == "-":
            raw = sys.stdin.read()
        else:
            try:
                with open(path, encoding="utf-8") as fh:
                    raw = fh.read()
            except OSError as exc:
                raise CommandError(f"Could not read {path}: {exc}") from exc

        try:
            document = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CommandError(f"Invalid JSON: {exc}") from exc
        if not isinstance(document, dict):
            raise CommandError("Document must be a JSON object.")

        version = import_resume_json(
            actor=None,
            base_resume=base_resume,
            document=document,
            notes=options.get("notes", ""),
            source="command",
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Imported v{version.version_number} (id={version.pk}) "
                f"under base resume {base_resume.pk}."
            )
        )
