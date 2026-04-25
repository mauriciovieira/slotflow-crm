import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

test.describe("Insights compensation snapshot", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("snapshot reflects an opportunity with comp metadata", async ({ page }) => {
    await loginAsE2EUser(page);

    // Create an opportunity with comp via the UI flow.
    await page.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE).fill("Staff Engineer");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY).fill("Acme");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMP_AMOUNT).fill("200000");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMP_CURRENCY).fill("USD");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_LIST)).toBeVisible();

    // Open Insights — snapshot picks up the row.
    await page.getByTestId(TestIds.NAV_INSIGHTS).click();
    await expect(page).toHaveURL("/dashboard/insights");
    await expect(page.getByTestId(TestIds.INSIGHTS_SECTION)).toBeVisible();
    await expect(page.getByTestId(TestIds.INSIGHTS_TOTAL)).toContainText("200,000.00 USD");

    const list = page.getByTestId(TestIds.INSIGHTS_LINE_ITEMS);
    await expect(list).toBeVisible();
    const rows = list.locator(`[data-testid^="${TestIds.INSIGHTS_LINE_ITEM}-"]`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Staff Engineer");
    await expect(rows.first()).toContainText("Acme");
  });
});
