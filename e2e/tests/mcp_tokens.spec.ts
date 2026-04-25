import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

// MCP endpoints require a fresh OTP session (15-min window) on top of
// session auth. The dev 2FA bypass intentionally does NOT extend to the
// freshness gate (a deliberate security boundary). To exercise the FE
// issue → plaintext → revoke flow without bending that boundary, we stub
// the MCP API at the network layer. The BE serializer / view shape is
// covered by `backend/mcp/tests/api/mcp_token_test.py`.
test.describe("MCP tokens settings", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("issue a token, see plaintext once, then revoke", async ({ page }) => {
    type MockToken = {
      id: string;
      name: string;
      last_four: string;
      expires_at: string | null;
      created_at: string;
      updated_at: string;
      revoked_at: string | null;
      last_used_at: string | null;
    };

    const tokens: MockToken[] = [];

    await page.route("**/api/mcp/tokens/", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(tokens),
        });
        return;
      }
      if (req.method() === "POST") {
        const payload = JSON.parse(req.postData() || "{}");
        const now = new Date().toISOString();
        const record: MockToken = {
          id: `tok-${tokens.length + 1}`,
          name: payload.name ?? "",
          last_four: "abcd",
          expires_at: null,
          created_at: now,
          updated_at: now,
          revoked_at: null,
          last_used_at: null,
        };
        tokens.push(record);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ...record,
            plaintext: "mcp_e2e_plaintext_value_xyz",
          }),
        });
        return;
      }
      await route.fulfill({ status: 405, body: "" });
    });

    await page.route(/\/api\/mcp\/tokens\/[^/]+\/$/, async (route) => {
      const req = route.request();
      if (req.method() === "DELETE") {
        const m = req.url().match(/\/api\/mcp\/tokens\/([^/]+)\/$/);
        const id = m ? m[1] : "";
        const row = tokens.find((t) => t.id === id);
        if (row) row.revoked_at = new Date().toISOString();
        await route.fulfill({ status: 204, body: "" });
        return;
      }
      await route.fulfill({ status: 405, body: "" });
    });

    await loginAsE2EUser(page);

    await page.getByTestId(TestIds.NAV_SETTINGS).click();
    await expect(page).toHaveURL("/dashboard/settings");
    await expect(page.getByTestId(TestIds.SETTINGS_MCP_SECTION)).toBeVisible();
    await expect(page.getByTestId(TestIds.SETTINGS_MCP_EMPTY)).toBeVisible();

    await page.getByTestId(TestIds.SETTINGS_MCP_ISSUE_TOGGLE).click();
    await page.getByTestId(TestIds.SETTINGS_MCP_ISSUE_NAME).fill("My laptop");
    await page.getByTestId(TestIds.SETTINGS_MCP_ISSUE_SUBMIT).click();

    const panel = page.getByTestId(TestIds.SETTINGS_MCP_PLAINTEXT_PANEL);
    await expect(panel).toBeVisible();
    const plaintext = page.getByTestId(TestIds.SETTINGS_MCP_PLAINTEXT_VALUE);
    await expect(plaintext).toHaveValue("mcp_e2e_plaintext_value_xyz");

    await page.getByTestId(TestIds.SETTINGS_MCP_PLAINTEXT_DISMISS).click();
    await expect(panel).toBeHidden();

    const list = page.getByTestId(TestIds.SETTINGS_MCP_LIST);
    await expect(list).toBeVisible();
    const rows = list.locator(`[data-testid^="${TestIds.SETTINGS_MCP_ROW}-"]`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("My laptop");

    const revokeBtn = rows
      .first()
      .locator(`[data-testid^="${TestIds.SETTINGS_MCP_REVOKE}-"]`)
      .first();
    await revokeBtn.click();
    const confirmBtn = rows
      .first()
      .locator(`[data-testid^="${TestIds.SETTINGS_MCP_REVOKE_CONFIRM}-"]`);
    await confirmBtn.click();

    // After revoke the row remains in the list (revoked rows render dimmed
    // with no revoke button) — assert the revoke control is gone, not an
    // empty-list state.
    await expect(rows).toHaveCount(1);
    await expect(
      rows
        .first()
        .locator(`[data-testid^="${TestIds.SETTINGS_MCP_REVOKE}-"]`)
        .first(),
    ).toBeHidden();
  });
});
