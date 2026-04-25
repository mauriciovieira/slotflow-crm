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

test.describe("opportunity resumes link flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("link resume version to opportunity then unlink", async ({ page }) => {
    await login(page);

    // Create an opportunity via UI.
    await page.getByTestId(TestIds.OPPORTUNITIES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_TITLE).fill("Staff Engineer");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_COMPANY).fill("Acme");
    await page.getByTestId(TestIds.OPPORTUNITY_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITIES_LIST)).toBeVisible();

    // Create a resume + first version via UI so we have something to link.
    await page.getByTestId(TestIds.NAV_RESUMES).click();
    await expect(page.getByTestId(TestIds.RESUMES_EMPTY)).toBeVisible();
    await page.getByTestId(TestIds.RESUMES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.RESUME_CREATE_NAME).fill("Senior Eng — backend");
    await page.getByTestId(TestIds.RESUME_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.RESUME_DETAIL_HEADING)).toHaveText(
      "Senior Eng — backend",
    );
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE).click();
    await page
      .getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT)
      .fill('{"basics": {"name": "Alice"}}');
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_SUBMIT).click();
    await expect(page.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST)).toBeVisible();

    // Open the opportunity detail.
    await page.getByTestId(TestIds.NAV_OPPORTUNITIES).click();
    await page.getByRole("link", { name: "Staff Engineer" }).click();
    await expect(page.getByTestId(TestIds.OPPORTUNITY_DETAIL_FORM)).toBeVisible();
    await expect(page.getByTestId(TestIds.OPPORTUNITY_RESUMES_SECTION)).toBeVisible();
    await expect(page.getByTestId(TestIds.OPPORTUNITY_RESUMES_EMPTY)).toBeVisible();

    // Link the resume version.
    await page.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_TOGGLE).click();
    await page
      .getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_RESUME)
      .selectOption({ label: "Senior Eng — backend" });
    // Wait until the version dropdown gets populated.
    await expect(
      page.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_VERSION),
    ).toContainText("v1");
    await page
      .getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_VERSION)
      .selectOption({ label: "v1" });
    await page.getByTestId(TestIds.OPPORTUNITY_RESUMES_LINK_SUBMIT).click();

    // The link list shows one row referencing the resume name + v1.
    await expect(page.getByTestId(TestIds.OPPORTUNITY_RESUMES_LIST)).toBeVisible();
    const rows = page
      .getByTestId(TestIds.OPPORTUNITY_RESUMES_LIST)
      .locator(`[data-testid^="${TestIds.OPPORTUNITY_RESUMES_ROW}-"]`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Senior Eng — backend");
    await expect(rows.first()).toContainText("v1");
    await expect(rows.first()).toContainText("Submitted");

    // Unlink → confirm.
    const unlinkButton = rows
      .first()
      .locator(`[data-testid^="${TestIds.OPPORTUNITY_RESUMES_UNLINK}-"]`);
    await unlinkButton.click();
    const confirmButton = rows
      .first()
      .locator(`[data-testid^="${TestIds.OPPORTUNITY_RESUMES_UNLINK_CONFIRM}-"]`);
    await confirmButton.click();

    await expect(page.getByTestId(TestIds.OPPORTUNITY_RESUMES_EMPTY)).toBeVisible();
  });
});
