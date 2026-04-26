from __future__ import annotations

import os

from config.env import env_bool

from .base import *  # noqa: F403

DEBUG = False

if not SECRET_KEY or SECRET_KEY.startswith("dev-insecure-"):  # noqa: F405
    raise ValueError("DJANGO_SECRET_KEY must be set for production settings.")

# --- Transport security --------------------------------------------------
# HSTS: tell browsers to only ever talk HTTPS to this host. The default
# is one year (the duration the preload list expects). Subdomain include
# + preload are off by default — flip them on once the host is ready
# (i.e., every subdomain genuinely serves HTTPS).
SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_SECURE_HSTS_SECONDS", "31536000"))
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS", default=False)
SECURE_HSTS_PRELOAD = env_bool("DJANGO_SECURE_HSTS_PRELOAD", default=False)

# Render and most PaaS terminate TLS at the edge and forward over HTTP
# with `X-Forwarded-Proto: https`. Without this header lookup, Django
# thinks every request is HTTP and would loop on the SSL redirect.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", default=True)

# --- Cookies -------------------------------------------------------------
# Mark session + CSRF cookies Secure so they never travel over plaintext
# HTTP. SameSite=Lax matches the SPA + same-origin API pattern.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# --- Cache (throttling backend) ------------------------------------------
# DRF throttles store counters in `default` cache. With multiple web
# workers, in-process LocMemCache splits the bucket per process and the
# per-IP rate limit becomes effectively `rate * num_workers`. Configure
# Redis here so all workers share one bucket.
_redis_url = os.environ.get("REDIS_URL")
if _redis_url:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": _redis_url,
            "KEY_PREFIX": "slotflow",
        }
    }
