from __future__ import annotations

from celery import shared_task


@shared_task(name="core.tasks.imports_placeholder")
def imports_placeholder() -> str:
    return "imports"


@shared_task(name="core.tasks.render_placeholder")
def render_placeholder() -> str:
    return "render"


@shared_task(name="core.tasks.insights_placeholder")
def insights_placeholder() -> str:
    return "insights"


@shared_task(name="core.tasks.fx_placeholder")
def fx_placeholder() -> str:
    return "fx"
