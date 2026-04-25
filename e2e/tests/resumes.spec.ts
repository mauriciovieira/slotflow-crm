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

test.describe("resumes flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("create resume, append a version, archive", async ({ page }) => {
    await login(page);

    // Navigate via sidebar to /dashboard/resumes — empty state shows.
    await page.getByTestId(TestIds.NAV_RESUMES).click();
    await expect(page).toHaveURL("/dashboard/resumes");
    await expect(page.getByTestId(TestIds.RESUMES_EMPTY)).toBeVisible();

    // New resume → form → submit → land on detail.
    await page.getByTestId(TestIds.RESUMES_NEW_BUTTON).click();
    await expect(page).toHaveURL("/dashboard/resumes/new");
    await page.getByTestId(TestIds.RESUME_CREATE_NAME).fill("Senior Eng — backend");
    await page.getByTestId(TestIds.RESUME_CREATE_SUBMIT).click();

    await expect(page.getByTestId(TestIds.RESUME_DETAIL_HEADING)).toHaveText(
      "Senior Eng — backend",
    );
    await expect(page.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_EMPTY)).toBeVisible();

    // Open the new-version composer, paste JSON, submit.
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE).click();
    await page
      .getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT)
      .fill('{"basics": {"name": "Alice"}}');
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_SUBMIT).click();

    await expect(page.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST)).toBeVisible();
    // Exactly one version row is rendered.
    const rows = page
      .getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST)
      .locator(`[data-testid^="${TestIds.RESUME_DETAIL_VERSION_ROW}-"]`);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("v1");

    // Archive → confirm → list with empty state.
    await page.getByTestId(TestIds.RESUME_DETAIL_ARCHIVE).click();
    await page.getByTestId(TestIds.RESUME_DETAIL_ARCHIVE_CONFIRM).click();
    await expect(page).toHaveURL("/dashboard/resumes");
    await expect(page.getByTestId(TestIds.RESUMES_EMPTY)).toBeVisible();
  });
});
