from __future__ import annotations

from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

from resumes.models import ResumeVersion
from resumes.services import render_resume_version_html


class Command(BaseCommand):
    help = (
        "Render a ResumeVersion's JSON document into HTML. Writes to --out (or "
        "stdout when --out is omitted). Audited as a system render."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "version_uuid",
            help="UUID of the ResumeVersion to render.",
        )
        parser.add_argument(
            "--out",
            default=None,
            help="Optional path to write the HTML output. Defaults to stdout.",
        )

    def handle(self, *args, **options):
        # `ValidationError` covers the malformed-UUID case (UUIDField raises
        # that, not just `DoesNotExist`); catch both so the command exits
        # cleanly rather than printing a stack trace.
        try:
            version = ResumeVersion.objects.select_related("base_resume__workspace").get(
                pk=options["version_uuid"],
                base_resume__archived_at__isnull=True,
            )
        except (ResumeVersion.DoesNotExist, ValidationError) as exc:
            raise CommandError(
                f"ResumeVersion {options['version_uuid']} not found "
                "(or its base resume has been archived)."
            ) from exc

        html = render_resume_version_html(actor=None, version=version, source="command")

        out = options.get("out")
        if out:
            try:
                with open(out, "w", encoding="utf-8") as fh:
                    fh.write(html)
            except OSError as exc:
                raise CommandError(f"Could not write {out}: {exc}") from exc
            self.stdout.write(
                self.style.SUCCESS(f"Rendered v{version.version_number} (id={version.pk}) → {out}")
            )
        else:
            # `BaseCommand.stdout` is a thin wrapper that flows through
            # `call_command(stdout=...)` for tests. `ending=""` keeps the
            # raw HTML intact (no trailing newline injected).
            self.stdout.write(html, ending="")
