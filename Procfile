# Paste each line into the corresponding Render service Start Command (see README).
# Render runs one process per service; it does not run this file as a multi-process supervisor.

web: bash -c 'cd backend && export DJANGO_SETTINGS_MODULE=config.settings.production && exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000}'
worker: bash -c 'cd backend && export DJANGO_SETTINGS_MODULE=config.settings.production && exec celery -A config worker -l info'
