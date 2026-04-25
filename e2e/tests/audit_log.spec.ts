import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

// Stubs `**/api/audit-events/?*` so the spec can exercise the FE flow
// against deterministic fixtures. The seeded e2e workspace doesn't carry
// audit rows, and write-helpers for `AuditEvent` aren't exposed via the
// HTTP surface — BE coverage lives in `backend/audit/tests/api/list_test.py`.
test.describe("Audit log", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("filter narrows rows; metadata expands; Load more paginates", async ({ page }) => {
    type Row = {
      id: string;
      actor_repr: string;
      action: string;
      entity_type: string;
      entity_id: string;
      workspace: string | null;
      correlation_id: string;
      metadata: Record<string, unknown>;
      created_at: string;
    };

    const allRows: Row[] = [
      {
        id: "evt-1",
        actor_repr: "alice",
        action: "mcp_token.issued",
        entity_type: "mcp.McpToken",
        entity_id: "tok-1",
        workspace: null,
        correlation_id: "corr-1",
        metadata: { name: "demo" },
        created_at: "2026-04-25T10:00:00Z",
      },
      {
        id: "evt-2",
        actor_repr: "alice",
        action: "mcp_token.revoked",
        entity_type: "mcp.McpToken",
        entity_id: "tok-2",
        workspace: null,
        correlation_id: "corr-2",
        metadata: {},
        created_at: "2026-04-25T09:00:00Z",
      },
    ];

    const extraRow: Row = {
      id: "evt-3",
      actor_repr: "alice",
      action: "opportunity.archived",
      entity_type: "opportunities.Opportunity",
      entity_id: "42",
      workspace: null,
      correlation_id: "corr-3",
      metadata: {},
      created_at: "2026-04-25T08:00:00Z",
    };

    await page.route(/\/api\/audit-events\/\?.*$/, async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get("action");
      const isPage2 = url.searchParams.get("cursor") === "p2";

      if (isPage2) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            count: 1,
            next: null,
            previous: null,
            results: [extraRow],
          }),
        });
        return;
      }

      const results = action ? allRows.filter((r) => r.action === action) : allRows;
      const next = action
        ? null
        : `${url.origin}/api/audit-events/?workspace=${url.searchParams.get(
            "workspace",
          )}&cursor=p2`;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: results.length,
          next,
          previous: null,
          results,
        }),
      });
    });

    await loginAsE2EUser(page);

    await page.getByTestId(TestIds.NAV_AUDIT).click();
    await expect(page).toHaveURL("/dashboard/audit");
    await expect(page.getByTestId(TestIds.AUDIT_SECTION)).toBeVisible();

    const table = page.getByTestId(TestIds.AUDIT_TABLE);
    await expect(table).toBeVisible();
    const rows = table.locator(`[data-testid^="${TestIds.AUDIT_ROW}-"]`);
    await expect(rows).toHaveCount(2);

    // Expand metadata on the first row and assert pretty-printed JSON.
    const summary = page.getByTestId(`${TestIds.AUDIT_METADATA_EXPAND}-evt-1`);
    await summary.click();
    await expect(page.getByTestId(`${TestIds.AUDIT_METADATA_BODY}-evt-1`))
      .toContainText('"name": "demo"');

    // Filter by action narrows to a single row.
    await page.getByTestId(TestIds.AUDIT_FILTER_ACTION).fill("mcp_token.issued");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("mcp_token.issued");

    // Clear filters → both rows visible again, plus Load more for page 2.
    await page.getByTestId(TestIds.AUDIT_FILTER_CLEAR).click();
    await expect(rows).toHaveCount(2);

    const loadMore = page.getByTestId(TestIds.AUDIT_LOAD_MORE);
    await expect(loadMore).toBeVisible();
    await loadMore.click();
    await expect(rows).toHaveCount(3);
    await expect(loadMore).toBeHidden();
  });
});
