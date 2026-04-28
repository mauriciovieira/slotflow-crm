from __future__ import annotations

from django.urls import path

from .views import (
    NotificationListView,
    mark_all_read_view,
    mark_read_view,
    unread_count_view,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notifications-list"),
    path("unread-count/", unread_count_view, name="notifications-unread-count"),
    path("mark-read/", mark_read_view, name="notifications-mark-read"),
    path("mark-all-read/", mark_all_read_view, name="notifications-mark-all-read"),
]
