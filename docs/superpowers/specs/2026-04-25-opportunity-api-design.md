# Opportunity DRF API — Design

**Date:** 2026-04-25
**Status:** Approved
**Scope:** PR G — first DRF API surface in the project. List + create + retrieve + partial-update + soft-delete-via-DELETE for `Opportunity`, scoped to the caller's workspace memberships, gated by `Membership.role`.

## Goal

Expose the model PR F shipped through a workspace-scoped DRF ViewSet so the React dashboard (and later MCP tools) can read/write opportunities. Establish the patterns every later domain API will follow:

- workspace scoping enforced in the queryset, not the view
- role-based write checks via `tenancy.permissions`
- per-app URL include mounted under `/api/`
- consistent serializer + filter shape
- per-category test layout from PR #17 fully exercised (`models`, `api`, `services`)

## Non-goals

- Pagination tuning, search, or full-text — list endpoint returns DRF's default page size with `?stage=…&workspace=…&q=…` filters; tuning lands when the dashboard surfaces sorting + search.
- Full state-machine enforcement on `stage` transitions. This PR accepts any valid `OpportunityStage` value on update; PR H or beyond adds transition rules.
- Hard-delete. `DELETE` flips `archived_at` (new field) and removes the row from default queries; the row stays for audit.
- Bulk operations. Single-resource endpoints only.
- MCP tool wiring. Track 04 picks up the same `services.py` later.
- Authoring UI on the frontend. Stub panel stays in place; PR H wires the list view.

## Architecture

### Routing

`backend/config/urls.py` already mounts `path("api/auth/", include(auth_urlpatterns))`. Add a sibling:

```py
path("api/opportunities/", include("opportunities.urls")),
```

`backend/opportunities/urls.py` (new) hosts a DRF `DefaultRouter` registering one `ViewSet`. Final URLs:

| Method | Path | Action |
|---|---|---|
| GET | `/api/opportunities/` | list (workspace-scoped, filterable) |
| POST | `/api/opportunities/` | create (in caller's active workspace) |
| GET | `/api/opportunities/<uuid>/` | retrieve |
| PATCH | `/api/opportunities/<uuid>/` | partial_update |
| DELETE | `/api/opportunities/<uuid>/` | soft delete (sets `archived_at`) |

`PUT` is intentionally not exposed — `partial_update` covers the editor flow; full-replace semantics aren't useful here.

### View

`backend/opportunities/views.py`:

- `OpportunityViewSet(ModelViewSet)` overriding `http_method_names` to `["get","post","patch","delete","head","options"]` (no PUT).
- `permission_classes = [IsAuthenticated, IsWorkspaceMember]` (the new permission below).
- `get_queryset()` returns `Opportunity.objects.filter(workspace__memberships__user=self.request.user, archived_at__isnull=True).distinct()`.
- `perform_create` resolves the active workspace (see below) and stamps `created_by=self.request.user`.
- `perform_destroy` writes `archived_at = timezone.now()` and saves; never calls `.delete()`.
- Filterset wired via `django-filter` (already in deps): filter by `stage` and `workspace` (UUID).
- `?q=` does a case-insensitive `title__icontains | company__icontains` lookup — enough for the dashboard's typeahead.

### Active-workspace resolution

When a user belongs to multiple workspaces, mutations need to know which one to scope to. Two paths supported:

1. Request body carries `workspace` (UUID). The serializer validates it points at a workspace the user has membership in, then uses it.
2. Body omits `workspace`. The view falls back to the user's single membership; if more than one exists and no body field, return 400 with a clear message.

This keeps the MVP simple — most real users have exactly one workspace at the start. The "active workspace" concept (session-stored, last-used, multi-tab) is deferred to Track 04 where MCP also needs it.

### Serializer

`backend/opportunities/serializers.py`:

- `OpportunitySerializer(ModelSerializer)`.
- Read-only: `id`, `created_at`, `updated_at`, `created_by` (returns username), `archived_at`.
- Writable: `title`, `company`, `stage`, `notes`, `workspace` (validated against caller's memberships).
- Validation:
  - `validate_workspace`: rejects a workspace UUID where the request user has no membership.
  - `validate_stage`: relies on `OpportunityStage.choices` (DRF handles via `ChoiceField`).
- Read-only `created_by` is rendered as `{"id": …, "username": …}` to keep the wire shape future-friendly without exposing email.

### Permissions

`backend/opportunities/permissions.py`:

- `IsWorkspaceMember(permissions.BasePermission)`:
  - `has_permission`: any authenticated user can hit list/create at all (workspace scoping is in the queryset/serializer).
  - `has_object_permission`: returns True iff `obj.workspace` has a `Membership` for `request.user`. For `PATCH`/`DELETE`, additionally require `MembershipRole.OWNER` or `MembershipRole.MEMBER` (read-only viewers can only `GET`).

This permission shape will be reused verbatim by `resumes`, `interviews`, etc., once they ship — at that point we'll lift it to a shared `core/permissions.py`. Premature now (one consumer).

### Service layer

`backend/opportunities/services.py` (new): two functions, both `@transaction.atomic`:

- `create_opportunity(actor, workspace, payload) -> Opportunity`
- `archive_opportunity(actor, opportunity) -> Opportunity`

The view calls these from `perform_create` / `perform_destroy`. Putting business logic in `services.py` (not in the view) is the pattern Track 04 needs — MCP tools will call the same functions without ever touching DRF.

### Soft delete

`backend/opportunities/models.py` gains an `archived_at` field:

```py
archived_at = models.DateTimeField(null=True, blank=True)
```

A migration (`0002_archived_at.py`) adds the column, defaulting to NULL. The list/retrieve queryset filters `archived_at__isnull=True`. No partial-index in this PR — query plans on a single 0-row table aren't worth tuning.

`Meta.ordering = ("-created_at",)` stays. No new index.

`Opportunity.objects` keeps Django's default manager; archive filtering happens in the viewset. We're not introducing a custom manager because the only consumer this PR is the API; if future callers (admin, MCP) need different visibility, they'll opt in explicitly.

### Admin tweak

`backend/opportunities/admin.py` adds `archived_at` to the readonly list — admins can see archives but the public API hides them.

## Tests (per-category layout)

All under `backend/opportunities/tests/`:

- `models/opportunity_test.py` — keep all six existing tests; add one for `archived_at` defaulting to None and being writable.
- `services/opportunity_test.py` — `create_opportunity` (happy path + workspace-membership rejection); `archive_opportunity` (idempotent: archiving twice is a no-op, doesn't bump `archived_at`).
- `api/opportunity_test.py` — DRF integration tests via `APIClient`:
  - 401 anon on list/create/retrieve/patch/delete
  - 200 list returns only the caller's workspace rows
  - 200 list excludes archived rows
  - 201 create with explicit `workspace` succeeds and returns the row
  - 400 create with another workspace's UUID rejected
  - 400 create when caller has multiple memberships and omits `workspace`
  - 200 retrieve in own workspace
  - 404 retrieve in another workspace
  - 200 partial-update by owner/member
  - 403 partial-update by viewer
  - 204 delete (soft) by owner/member; row keeps existing in DB with `archived_at` set
  - 403 delete by viewer
  - filter by `?stage=interview` returns only matching rows
  - `?q=staff` matches title or company case-insensitively

Test count delta: opportunity model `+1`, services `~3`, api `~12`. Roughly +16 tests (existing 63 → ~79).

## Frontend

Zero changes. The dashboard `/dashboard/opportunities` stub stays the same. The list-view UI lands in PR H, which has the API to read.

## E2E

Zero changes. The auth harness already covers `/api/auth/`; opportunities will land an e2e once the dashboard list view exists (PR H).

## Risk & rollback

- One new migration (additive column, default NULL). Reverse migration drops the column.
- New URL surface, but gated by `IsAuthenticated` + workspace membership at every step. No anonymous access.
- Behaviour change is purely additive (no edits to `core/api_auth.py`, `core/middleware/require_2fa.py`, or `tenancy/permissions.py`).
- Rollback: revert the merge. The migration runs `migrate opportunities 0001` to drop the column.

## Open questions

- Active-workspace resolution: this PR uses request body or single-membership heuristic. A future PR will introduce a session-bound active workspace once MCP needs it. The serializer/view shape doesn't change — only the resolution function does.
- Filtering UX (sorting, server-side search, saved views) is intentionally light. The dashboard will tell us what's actually needed.
