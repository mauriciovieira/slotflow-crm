from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.generics import ListAPIView
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer
from .services import mark_all_read, mark_read


class NotificationPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class NotificationListView(ListAPIView):
    """`GET /api/notifications/`. Lists the requester's notifications.

    Query params:
        unread (bool, optional) — when "true"/"1", filter to unread only.
    Pagination is page-number, default 25 per page.
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = NotificationPagination

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        unread = self.request.query_params.get("unread", "").lower()
        if unread in ("1", "true", "yes"):
            qs = qs.filter(read_at__isnull=True)
        return qs


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def unread_count_view(request: Request) -> Response:
    """`GET /api/notifications/unread-count/`. The bell badge polls this."""
    count = Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()
    return Response({"count": count})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_read_view(request: Request) -> Response:
    """`POST /api/notifications/mark-read/` body: `{"ids": ["...", ...]}`."""
    ids = request.data.get("ids", [])
    if not isinstance(ids, list):
        return Response(
            {"detail": "`ids` must be a list."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    flipped = mark_read(recipient=request.user, ids=ids)
    return Response({"marked": flipped})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mark_all_read_view(request: Request) -> Response:
    """`POST /api/notifications/mark-all-read/`. Returns `{marked: <n>}`."""
    flipped = mark_all_read(recipient=request.user)
    return Response({"marked": flipped})
