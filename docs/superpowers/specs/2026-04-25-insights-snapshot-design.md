# Insights — Compensation Snapshot — Full Slice (BE + FE + e2e)

**Date:** 2026-04-25
**Status:** Approved
**Scope:** Second slice of Track 06. Add compensation fields to `Opportunity`, a `compute_compensation_snapshot` service that sums active expected comp converted via `fx.services.convert`, a DRF endpoint, and an Insights dashboard screen with total + per-opportunity breakdown.

## Goal

Give the user a single number ("if every opportunity I'm tracking landed at the offered comp, here's the total in USD") plus a per-opportunity breakdown so they can spot the outliers driving the headline.

## Non-goals

- Probability-weighting (e.g. multiply by stage). Future iteration.
- Time-series / "snapshot over time". Future iteration.
- Per-component breakdown (base / bonus / equity). For now, one `expected_total_compensation` field.
- Editing comp inline on the Insights screen — caller goes back to OpportunityDetail.

## Architecture

### Backend

**Opportunity field additions (`opportunities/models.py`):**

```python
expected_total_compensation = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
compensation_currency = CharField(max_length=8, blank=True, default="")
```

Both nullable/blank so existing rows are unaffected. Migration `0004_opportunity_compensation_fields`. Empty `compensation_currency` is valid only when `expected_total_compensation IS NULL`; the service skips rows missing either field.

`OpportunitySerializer` exposes both. `create_opportunity` / OpportunityViewSet PATCH thread the values through.

**Service (`insights/services.py`):**

```python
@dataclass
class CompensationSnapshot:
    workspace_id: str
    target_currency: str
    date: date
    total: Decimal
    line_items: list["CompensationLineItem"]
    skipped: list["SkippedOpportunity"]   # missing comp fields, missing fx rate

@dataclass
class CompensationLineItem:
    opportunity_id: str
    title: str
    company: str
    stage: str
    source_amount: Decimal
    source_currency: str
    converted_amount: Decimal
```

`compute_compensation_snapshot(*, workspace, target_currency, date) -> CompensationSnapshot`. Walks active (non-archived) opportunities scoped to `workspace`. For each row with both `expected_total_compensation` and `compensation_currency` set, calls `fx.services.convert(...)`. Catches `FxRateMissing` and adds the row to `skipped` with a reason; the snapshot still returns the partial total. Read-only — no audit row (Insights compute is potentially called frequently).

No membership check inside `compute_compensation_snapshot` — the caller (DRF view) already enforces it.

**DRF endpoint:**

`GET /api/insights/compensation-snapshot/?workspace=<uuid>&currency=USD&date=YYYY-MM-DD`. Required: `workspace`. Optional: `currency` (default `USD`), `date` (default today). Validates inputs. Returns the snapshot serialized as JSON; `Decimal`s rendered as strings to keep precision.

URL: `path("api/insights/", include("insights.urls"))`.

**Tests:**
- `tests/services/snapshot_test.py`: empty list, single opp same-currency, multi-currency conversion, missing fx → skipped, archived excluded, viewer + member both allowed (via the API path).
- `tests/api/snapshot_test.py`: anon 401/403; happy path with 2 opps; bad UUID 400; cross-workspace 403/404; default currency = USD; default date = today.

### Frontend

**Hook (`lib/insightsHooks.ts`):**

- `useCompensationSnapshot({workspaceId, currency, date})` — `GET /api/insights/compensation-snapshot/...`. Disabled when `workspaceId` empty.

**Nav (`dashboardNav.ts`):**

Insert `{ slug: "insights", label: "Insights", testId: TestIds.NAV_INSIGHTS }` between `interviews` and `settings`. Add the testId.

**Screen (`screens/Insights.tsx`):**

- Header with currency + date picker (defaults: active workspace's currency intent; today).
- Big "total" card.
- Per-opportunity table: title / company / stage pill / source amount / converted amount.
- Skipped list (collapsible) — opps missing comp fields or fx rate.
- Loading / error / empty states.

**OpportunityCreate / OpportunityDetail:**

Add `expected_total_compensation` (number) + `compensation_currency` (text, uppercase on submit) fields to both forms. Empty submits send `null` for the number. `OpportunityDetail` also surfaces them so the existing `Save changes` PATCH can update them.

**Router:** swap `insights` slug from `<StubPanel />` to `<Insights />`. Update `router.test.tsx`.

**TestIds:** new `NAV_INSIGHTS` + Insights screen + opportunity-form comp fields. Mirror to `e2e/support/selectors.ts`.

**Vitest:** insights screen states; opportunity create/detail comp-field round-trip.

### E2E

`e2e/tests/insights_snapshot.spec.ts`:

1. Reset → login (via `loginAsE2EUser`).
2. Create opportunity with `expected_total_compensation = 200000`, `compensation_currency = "USD"`.
3. Click Insights nav.
4. Assert total reads "200,000.00 USD" and the per-opp row shows the title + amount.

## Test plan

- Backend pytest gains ~14 cases (~6 service, ~6 api, ~2 model). 390 → ~404.
- Frontend vitest gains ~6 cases (router + insights + comp form fields). 151 → ~157.
- E2E gains 1 spec.

## Risk & rollback

- Two additive nullable columns on `Opportunity`. Migration is reversible.
- New URL surface gated by `IsAuthenticated` + workspace membership.
- Frontend swaps a stub slug + adds two opportunity-form fields; reversion is one revert.
- `compute_compensation_snapshot` performance: linear scan over active opportunities × 1 FX lookup each. `convert` already returns Decimal. Acceptable up to ~1000 opps; cache later if needed.

## Out of scope reminders

- No probability weighting.
- No time-series snapshots.
- No CSV / chart export.
- No granular comp components.
