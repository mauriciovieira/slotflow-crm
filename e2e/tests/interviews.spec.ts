import { expect, test } from "@playwright/test";

import { E2E_USER, resetDb } from "../support/api";
import { TestIds } from "../support/selectors";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByTestId(TestIds.LOGIN_USERNAME).fill(E2E_USER.username);
  await page.getByTestId(TestIds.LOGIN_PASSWORD).fill(E2E_USER.password);
  const loginResponse = page.waitForResponse(
    (resp) => resp.url().includes("/api/auth/login/") && resp.request().method() === "POST",
  );
  await page.getByTestId(TestIds.LOGIN_SUBMIT).click();
  const finished = await loginResponse;
  expect(finished.status()).toBe(200);
  await expect(page).toHaveURL("/dashboard/opportunities");
}

test.describe("interviews flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("create cycle, add a step, advance status", async ({ page }) => {
    await login(page);

    // Need an opportunity for the cycle to attach to. Use the opportunities
    // UI flow rather than seeding via API — keeps the spec representative
    // of a real user flow while still being deterministic. The seed only
    // provisions the user + workspace, not opportunities.
    await page.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON).click();
    await expect(page).toHaveURL("/dashboard/opportunities/new");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE).fill("Staff Engineer");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY).fill("Acme");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_LIST)).toBeVisible();

    // Now to interviews — empty state.
    await page.getByTestId(TestIds.NAV_INTERVIEWS).click();
    await expect(page).toHaveURL("/dashboard/interviews");
    await expect(page.getByTestId(TestIds.INTERVIEWS_EMPTY)).toBeVisible();

    // New cycle.
    await page.getByTestId(TestIds.INTERVIEWS_NEW_BUTTON).click();
    await expect(page).toHaveURL("/dashboard/interviews/new");
    await page
      .getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_OPPORTUNITY)
      .selectOption({ label: "Staff Engineer — Acme" });
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_NAME).fill("Onsite loop");
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_SUBMIT).click();

    await expect(page.getByTestId(TestIds.INTERVIEW_CYCLE_DETAIL_HEADING)).toHaveText(
      "Onsite loop",
    );
    await expect(page.getByTestId(TestIds.INTERVIEW_CYCLE_STEPS_EMPTY)).toBeVisible();

    // Add a step.
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_TOGGLE).click();
    await page
      .getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_KIND)
      .selectOption("phone");
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_SUBMIT).click();

    await expect(page.getByTestId(TestIds.INTERVIEW_CYCLE_STEPS_LIST)).toBeVisible();
    const rows = page
      .getByTestId(TestIds.INTERVIEW_CYCLE_STEPS_LIST)
      .locator(`[data-testid^="${TestIds.INTERVIEW_CYCLE_STEP_ROW}-"]`);
    await expect(rows).toHaveCount(1);

    // Advance status to completed via the inline dropdown.
    const select = rows
      .first()
      .locator(`[data-testid^="${TestIds.INTERVIEW_CYCLE_STEP_STATUS_SELECT}-"]`);
    await select.selectOption("completed");
    await expect(select).toHaveValue("completed");

    // Back to list — last_step_status should now read "Completed".
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_DETAIL_BACK).click();
    await expect(page).toHaveURL("/dashboard/interviews");
    await expect(page.getByTestId(TestIds.INTERVIEWS_LIST)).toContainText("Completed");
  });
});
