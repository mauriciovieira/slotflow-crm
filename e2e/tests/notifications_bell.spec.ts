import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

// The bell shows notifications fanned out from `audit.write_audit_event`
// for workspace-scoped actions taken by *other* users. The seeded e2e
// workspace has only one user, so producing a real notification through
// the BE flow would require seeding a second member. We stub the
// `/api/notifications/*` endpoints via `page.route` to exercise the FE
// flow deterministically. BE coverage lives in
// `backend/notifications/tests/{api,services}/`.
test.describe("notifications bell", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("badge shows unread count → open panel → mark read → count drops", async ({ page }) => {
    type Row = {
      id: string;
      kind: string;
      payload: Record<string, unknown>;
      workspace: string | null;
      read_at: string | null;
      created_at: string;
    };

    const rows: Row[] = [
      {
        id: "n-1",
        kind: "opportunity.archived",
        payload: { actor_repr: "bob", title: "Senior Engineer", company: "Acme" },
        workspace: "ws-1",
        read_at: null,
        created_at: "2026-04-25T10:00:00Z",
      },
    ];

    await page.route(/\/api\/notifications\/unread-count\/$/, async (route) => {
      const unread = rows.filter((r) => r.read_at === null).length;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: unread }),
      });
    });

    await page.route(/\/api\/notifications\/$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          count: rows.length,
          next: null,
          previous: null,
          results: rows,
        }),
      });
    });

    await page.route(/\/api\/notifications\/mark-read\/$/, async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}");
      const ids: string[] = body.ids ?? [];
      let marked = 0;
      const now = new Date().toISOString();
      for (const row of rows) {
        if (ids.includes(row.id) && row.read_at === null) {
          row.read_at = now;
          marked += 1;
        }
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ marked }),
      });
    });

    await loginAsE2EUser(page);

    // Badge should reflect the one stubbed unread row.
    const badge = page.getByTestId(TestIds.NOTIFICATIONS_BADGE);
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("1");

    // Open the panel.
    await page.getByTestId(TestIds.NOTIFICATIONS_BELL).click();
    await expect(page.getByTestId(TestIds.NOTIFICATIONS_PANEL)).toBeVisible();
    const item = page.getByTestId(`${TestIds.NOTIFICATIONS_ITEM}-n-1`);
    await expect(item).toContainText("Senior Engineer");
    await expect(item).toContainText("bob");

    // Mark read → row dims, badge disappears.
    await page.getByTestId(`${TestIds.NOTIFICATIONS_MARK_READ}-n-1`).click();
    await expect(badge).toBeHidden();
    // The mark-read button on this row vanishes once it's read.
    await expect(
      page.getByTestId(`${TestIds.NOTIFICATIONS_MARK_READ}-n-1`),
    ).toBeHidden();
  });
});
