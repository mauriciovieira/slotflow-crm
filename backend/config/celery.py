from __future__ import annotations

import os

from celery import Celery

if "DJANGO_SETTINGS_MODULE" not in os.environ:
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.local"

app = Celery("slotflow")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
