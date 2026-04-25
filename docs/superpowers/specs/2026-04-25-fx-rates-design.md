# FX Rates — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** First slice of Track 06 (Insights/FX). Add a foreign-exchange rate model with a `convert(amount, from, to, date)` service, a Settings → FX Rates UI page that lists rates and accepts manual overrides, and a Celery task scaffold for daily refresh from a public source.

## Goal

Establish enough FX plumbing to power compensation comparison later: store rates per (currency, base_currency, date), let the user override entries by hand, and provide a single `convert(...)` entry point that future Insights features can call.

## Non-goals

- Live API integration with a paid FX provider — the Celery task wires into the existing `fx` queue but is a stub for now (returns hard-coded rates).
- Historical reconstruction across many years — index supports it, but the seed only loads recent dates.
- Currency-pair selection on the user side — base_currency is workspace-scoped (default USD), the UI shows rates relative to that base.
- Sub-day granularity — one rate per (currency, base_currency, date).

## Architecture

### Backend (`backend/fx/`)

**Model (`fx/models.py`):**

```python
class FxRate(TimeStampedModel):
    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = ForeignKey("tenancy.Workspace", on_delete=CASCADE, related_name="fx_rates")
    currency = CharField(max_length=8)              # e.g. "EUR"
    base_currency = CharField(max_length=8)         # e.g. "USD"
    rate = DecimalField(max_digits=18, decimal_places=8)  # 1 base = `rate` `currency`
    date = DateField()
    source = CharField(max_length=32, default="manual")   # manual | task | seed
    created_by = ForeignKey(USER, on_delete=SET_NULL, null=True, blank=True, related_name="created_fx_rates")

    class Meta:
        ordering = ("-date", "currency")
        constraints = [UniqueConstraint(fields=("workspace", "currency", "base_currency", "date"),
                                        name="uniq_fx_rate_per_day")]
        indexes = [Index(fields=("workspace", "currency", "-date"))]
```

`source` distinguishes a hand-entered override from one populated by the (stub) Celery task.

Migration `backend/fx/migrations/0001_initial.py`.

**Service (`fx/services.py`):**

- `upsert_fx_rate(*, actor, workspace, currency, base_currency, rate, date, source="manual") -> FxRate`. Membership + write-role gate on `workspace`. Updates the row if `(workspace, currency, base_currency, date)` exists, else creates. Audit `fx_rate.upserted` with metadata snapshot.
- `convert(*, workspace, amount, from_currency, to_currency, date) -> Decimal`. Looks up the most recent `FxRate` on or before `date` for both `from_currency` and `to_currency` (relative to a single base). Returns `amount * (rate_to / rate_from)`. Raises `FxRateMissing` if no rate exists for either side. No audit (read-only, called many times per Insights compute).

**Celery task (`fx/tasks.py`):**

`@shared_task(name="fx.refresh_rates", queue="fx")` `refresh_rates_for_workspace(workspace_id)`: stub that calls `upsert_fx_rate` with hard-coded sample rates (USD↔EUR, USD↔BRL, USD↔GBP) for `today`. Replace the rate source in a follow-up. The task is registered in `CELERY_TASK_ROUTES` (already pointed at the `fx` queue per repo settings).

**Permissions:** reuse `opportunities.permissions.IsWorkspaceMember` (workspace-scoped, write-role gated). For the read endpoint, viewers are allowed.

**Serializers / Views:**

- `FxRateSerializer` — read shape with `created_by` rendered as `{id, username}`.
- `FxRateUpsertSerializer` — write shape: `currency, base_currency, rate, date`.
- `FxRateViewSet(ModelViewSet)` at `/api/fx-rates/`:
  - `GET` list scoped to caller's memberships; filter `?workspace=<uuid>`, `?currency=EUR`, `?date_from=YYYY-MM-DD`, `?date_to=YYYY-MM-DD`.
  - `POST` upsert (create/update) — calls service.
  - `DELETE <uuid>` removes a manual-source row. The view delegates to the `delete_fx_rate` service which writes a `fx_rate.deleted` audit row and rejects non-manual sources (`task` / `seed`) with a 400. Operators needing to drop an automated row do it through the Django admin.

URL: `path("api/fx-rates/", include("fx.urls"))`.

**Tests** (per-app per-category):
- `tests/models/fx_rate_test.py`: defaults, unique constraint per (workspace, currency, base, date).
- `tests/services/upsert_test.py`, `tests/services/convert_test.py`, `tests/services/task_test.py`.
- `tests/api/fx_rate_test.py`.

### Frontend (`frontend/src/`)

**Hook (`lib/fxRatesHooks.ts`):**

- `useFxRates(workspaceId?)` — `GET /api/fx-rates/` (optional `?workspace=` filter).
- `useUpsertFxRate()` — `POST`.
- `useDeleteFxRate(id)` — `DELETE`.

Cache key: `["fx-rates", "list", workspaceId ?? ""]`.

**Screen (`screens/Settings.tsx`):**

The current `Settings` slug renders `<StubPanel />`. Replace with a real `Settings` screen that hosts an FX rates section:
- Table: `currency / base / rate / date / source / created_by`.
- "Add rate" inline form: currency + base + rate + date + submit.
- "Delete" button per row (manual-source rows only; task/seed rows show "—").
- Loading / error / empty states.

Router swap: `settings` slug → `<Settings />` (was `<StubPanel />`). Update `router.test.tsx` to match.

**TestIds:** new ids for the FX section. Mirror to `e2e/support/selectors.ts`.

**Frontend tests (Vitest):** list states, upsert form happy path, delete confirm.

### E2E (`e2e/tests/fx_rates.spec.ts`)

Signed-in seeded e2e user:

1. Reset → login (via `loginAsE2EUser`).
2. Click Settings nav.
3. Add an FX rate (currency `EUR`, base `USD`, rate `0.92`, today's date).
4. Assert the row appears in the table.
5. Delete it.
6. Assert the empty state.

## Test plan

- Backend pytest gains ~18 cases. 360 → ~378.
- Frontend vitest gains ~6 cases (router test update + ~5 settings cases). 145 → ~151.
- E2E gains 1 spec.

## Risk & rollback

- One additive table (`fx_fxrate`) with one migration. No FK changes elsewhere.
- New URL surface gated by `IsAuthenticated` + workspace membership (read-only for viewers).
- Frontend swaps a stub slug to a live route; reversion is one revert commit.
- Celery task is a stub — no live network calls, no rate-limit risk.

## Out of scope reminders

- No live FX provider integration.
- No conversion in any UI surface yet (that's the next slice).
- No multi-base support per workspace (default USD only for now; the field exists so it can be relaxed later).
