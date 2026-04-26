from __future__ import annotations

from django.urls import path

from .views import (
    invitation_detail_view,
    invitations_view,
    list_members_view,
    member_detail_view,
    transfer_ownership_view,
)

# Mounted under `/api/workspaces/` in `config/urls.py`. The accept endpoint
# lives in `tenancy.urls_invitations` so the bare-token URL can sit at the
# top level (`/api/invitations/<token>/accept/`).

urlpatterns = [
    path(
        "<uuid:workspace_id>/members/",
        list_members_view,
        name="workspace-members-list",
    ),
    path(
        "<uuid:workspace_id>/members/<uuid:membership_id>/",
        member_detail_view,
        name="workspace-member-detail",
    ),
    path(
        "<uuid:workspace_id>/transfer-ownership/",
        transfer_ownership_view,
        name="workspace-transfer-ownership",
    ),
    path(
        "<uuid:workspace_id>/invitations/",
        invitations_view,
        name="workspace-invitations-list",
    ),
    path(
        "<uuid:workspace_id>/invitations/<uuid:invitation_id>/",
        invitation_detail_view,
        name="workspace-invitation-detail",
    ),
]
