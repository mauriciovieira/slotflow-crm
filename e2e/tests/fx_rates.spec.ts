import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

test.describe("FX rates settings", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("add a manual FX rate then delete it", async ({ page }) => {
    await loginAsE2EUser(page);

    await page.getByTestId(TestIds.NAV_SETTINGS).click();
    await expect(page).toHaveURL("/dashboard/settings");
    await expect(page.getByTestId(TestIds.SETTINGS_FX_SECTION)).toBeVisible();
    await expect(page.getByTestId(TestIds.SETTINGS_FX_EMPTY)).toBeVisible();

    await page.getByTestId(TestIds.SETTINGS_FX_FORM_CURRENCY).fill("EUR");
    await page.getByTestId(TestIds.SETTINGS_FX_FORM_RATE).fill("0.92");
    await page.getByTestId(TestIds.SETTINGS_FX_FORM_SUBMIT).click();

    const list = page.getByTestId(TestIds.SETTINGS_FX_LIST);
    await expect(list).toBeVisible();
    const rows = list.locator(`[data-testid^="${TestIds.SETTINGS_FX_ROW}-"]`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("EUR");
    await expect(rows.first()).toContainText("0.92");

    // Delete with inline confirm.
    const delBtn = rows
      .first()
      .locator(`[data-testid^="${TestIds.SETTINGS_FX_DELETE}-"]`);
    await delBtn.click();
    const confirmBtn = rows
      .first()
      .locator(`[data-testid^="${TestIds.SETTINGS_FX_DELETE_CONFIRM}-"]`);
    await confirmBtn.click();

    await expect(page.getByTestId(TestIds.SETTINGS_FX_EMPTY)).toBeVisible();
  });
});
