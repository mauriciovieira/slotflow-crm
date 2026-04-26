import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

test.describe("opportunity stage history", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("changing stage records a transition row", async ({ page }) => {
    await loginAsE2EUser(page);

    // Need an opportunity to mutate. Create one through the UI rather than
    // seeding via the API so the spec exercises the same write path users do.
    await page.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE).fill("Senior Engineer");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY).fill("Acme");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_LIST)).toBeVisible();

    // Open the new opportunity's detail screen by clicking the title
    // link (the row itself isn't a clickable target — only the title
    // column wraps a `<Link>` to the detail route).
    await page.getByRole("link", { name: "Senior Engineer" }).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITY_DETAIL_FORM)).toBeVisible();

    // Initially the history section is empty (no transitions yet).
    const section = page.getByTestId(TestIds.OPPORTUNITY_STAGE_HISTORY_SECTION);
    await expect(section).toBeVisible();
    await expect(
      page.getByTestId(TestIds.OPPORTUNITY_STAGE_HISTORY_EMPTY),
    ).toBeVisible();

    // Change stage applied → interview, save. The detail screen navigates
    // back to the list on save success, so we re-open the detail screen
    // afterwards to inspect the history that the BE just recorded.
    await page
      .getByTestId(TestIds.OPPORTUNITY_DETAIL_STAGE)
      .selectOption("interview");
    await page.getByTestId(TestIds.OPPORTUNITY_DETAIL_SAVE).click();
    await expect(page).toHaveURL("/dashboard/opportunities");

    await page.getByRole("link", { name: "Senior Engineer" }).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITY_DETAIL_FORM)).toBeVisible();

    // History list now shows the transition row.
    const list = page.getByTestId(TestIds.OPPORTUNITY_STAGE_HISTORY_LIST);
    await expect(list).toBeVisible();
    const rows = list.locator(
      `[data-testid^="${TestIds.OPPORTUNITY_STAGE_HISTORY_ROW}-"]`,
    );
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Applied");
    await expect(rows.first()).toContainText("Interview");
  });
});
