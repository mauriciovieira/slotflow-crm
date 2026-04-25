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

test.describe("interview step resumes flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("link resume version to a step then unlink", async ({ page }) => {
    await login(page);

    // Opportunity.
    await page.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE).fill("Staff Engineer");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY).fill("Acme");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_LIST)).toBeVisible();

    // Resume + v1.
    await page.getByTestId(TestIds.NAV_RESUMES).click();
    await page.getByTestId(TestIds.RESUMES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.RESUME_CREATE_NAME).fill("Senior Eng — backend");
    await page.getByTestId(TestIds.RESUME_CREATE_SUBMIT).click();
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE).click();
    await page
      .getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT)
      .fill('{"basics": {"name": "Alice"}}');
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_SUBMIT).click();
    await expect(page.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST)).toBeVisible();

    // Cycle + step.
    await page.getByTestId(TestIds.NAV_INTERVIEWS).click();
    await page.getByTestId(TestIds.INTERVIEWS_NEW_BUTTON).click();
    await page
      .getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_OPPORTUNITY)
      .selectOption({ label: "Staff Engineer — Acme" });
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_NAME).fill("Onsite loop");
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.INTERVIEW_CYCLE_DETAIL_HEADING)).toHaveText(
      "Onsite loop",
    );

    await page.getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_TOGGLE).click();
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_KIND).selectOption("phone");
    await page.getByTestId(TestIds.INTERVIEW_CYCLE_NEW_STEP_SUBMIT).click();
    await expect(page.getByTestId(TestIds.INTERVIEW_CYCLE_STEPS_LIST)).toBeVisible();

    // Find the step row, then its resumes section + link toggle (suffix-by-step-id).
    const stepRow = page
      .getByTestId(TestIds.INTERVIEW_CYCLE_STEPS_LIST)
      .locator(`[data-testid^="${TestIds.INTERVIEW_CYCLE_STEP_ROW}-"]`)
      .first();
    const linkToggle = stepRow.locator(
      `[data-testid^="${TestIds.INTERVIEW_STEP_RESUMES_LINK_TOGGLE}-"]`,
    );
    await linkToggle.click();

    await page
      .getByTestId(TestIds.INTERVIEW_STEP_RESUMES_LINK_RESUME)
      .selectOption({ label: "Senior Eng — backend" });
    await expect(
      page.getByTestId(TestIds.INTERVIEW_STEP_RESUMES_LINK_VERSION),
    ).toContainText("v1");
    await page
      .getByTestId(TestIds.INTERVIEW_STEP_RESUMES_LINK_VERSION)
      .selectOption({ label: "v1" });
    await page.getByTestId(TestIds.INTERVIEW_STEP_RESUMES_LINK_SUBMIT).click();

    // Linked-resumes list shows one row referencing the resume + v1.
    const linkedList = stepRow.locator(
      `[data-testid^="${TestIds.INTERVIEW_STEP_RESUMES_LIST}-"]`,
    );
    await expect(linkedList).toBeVisible();
    const linkRows = linkedList.locator(
      `[data-testid^="${TestIds.INTERVIEW_STEP_RESUMES_ROW}-"]`,
    );
    await expect(linkRows).toHaveCount(1);
    await expect(linkRows.first()).toContainText("Senior Eng — backend");
    await expect(linkRows.first()).toContainText("v1");

    // Unlink → confirm.
    const unlinkBtn = linkRows
      .first()
      .locator(`[data-testid^="${TestIds.INTERVIEW_STEP_RESUMES_UNLINK}-"]`);
    await unlinkBtn.click();
    const confirmBtn = linkRows
      .first()
      .locator(`[data-testid^="${TestIds.INTERVIEW_STEP_RESUMES_UNLINK_CONFIRM}-"]`);
    await confirmBtn.click();

    const empty = stepRow.locator(
      `[data-testid^="${TestIds.INTERVIEW_STEP_RESUMES_EMPTY}-"]`,
    );
    await expect(empty).toBeVisible();
  });
});
