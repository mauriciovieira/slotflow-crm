import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

test.describe("opportunities kanban board", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("drag a card from Applied to Interview moves it server-side", async ({ page }) => {
    await loginAsE2EUser(page);

    // Need an opportunity to drag. Create through the UI so the path
    // mirrors a real user.
    await page.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE).fill("Senior Engineer");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY).fill("Acme");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_LIST)).toBeVisible();

    // Switch to the board.
    await page.getByTestId(TestIds.OPPORTUNITIES_VIEW_TOGGLE_BOARD).click();
    await expect(page).toHaveURL("/dashboard/opportunities/board");
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_BOARD)).toBeVisible();

    // Card sits in the Applied column initially.
    const appliedCol = page.getByTestId(`${TestIds.OPPORTUNITIES_BOARD_COLUMN}-applied`);
    const interviewCol = page.getByTestId(
      `${TestIds.OPPORTUNITIES_BOARD_COLUMN}-interview`,
    );
    const card = appliedCol.locator(
      `[data-testid^="${TestIds.OPPORTUNITIES_BOARD_CARD}-"]`,
    );
    await expect(card).toHaveCount(1);
    await expect(
      interviewCol.locator(`[data-testid^="${TestIds.OPPORTUNITIES_BOARD_CARD}-"]`),
    ).toHaveCount(0);

    // Drag to the Interview column. Wait for the PATCH to land before
    // asserting so we're not racing the optimistic UI write.
    const patchResponse = page.waitForResponse(
      (resp) =>
        /\/api\/opportunities\/[^/]+\/$/.test(resp.url()) &&
        resp.request().method() === "PATCH",
    );
    await card.first().dragTo(interviewCol);
    const patched = await patchResponse;
    expect(patched.status()).toBe(200);

    // Reload to confirm the change is server-side, not just optimistic.
    await page.reload();
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_BOARD)).toBeVisible();
    await expect(
      interviewCol.locator(`[data-testid^="${TestIds.OPPORTUNITIES_BOARD_CARD}-"]`),
    ).toHaveCount(1);
    await expect(appliedCol.locator(
      `[data-testid^="${TestIds.OPPORTUNITIES_BOARD_CARD}-"]`,
    )).toHaveCount(0);
  });
});
