import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { E2E_USER, resetDb } from "../support/api";
import { TestIds } from "../support/selectors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_FIXTURE = path.resolve(__dirname, "..", "fixtures", "resume-sample.json");

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

test.describe("resume import flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("upload a JSON file as a new ResumeVersion", async ({ page }) => {
    await login(page);

    // Resume + first version (UI flow).
    await page.getByTestId(TestIds.NAV_RESUMES).click();
    await page.getByTestId(TestIds.RESUMES_NEW_BUTTON).click();
    await page.getByTestId(TestIds.RESUME_CREATE_NAME).fill("Senior Eng — backend");
    await page.getByTestId(TestIds.RESUME_CREATE_SUBMIT).click();
    await expect(page.getByTestId(TestIds.RESUME_DETAIL_HEADING)).toHaveText(
      "Senior Eng — backend",
    );
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_TOGGLE).click();
    await page
      .getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_DOCUMENT)
      .fill('{"basics": {"name": "Initial"}}');
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_SUBMIT).click();
    await expect(page.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST)).toBeVisible();

    // Import the sample fixture as v2.
    await page.getByTestId(TestIds.RESUME_DETAIL_IMPORT_TOGGLE).click();
    await page
      .getByTestId(TestIds.RESUME_DETAIL_IMPORT_FILE)
      .setInputFiles(SAMPLE_FIXTURE);
    await page.getByTestId(TestIds.RESUME_DETAIL_IMPORT_NOTES).fill("from sample fixture");
    await page.getByTestId(TestIds.RESUME_DETAIL_IMPORT_SUBMIT).click();

    // Versions list now contains v2 (newest first), and the import form is gone.
    const rows = page
      .getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST)
      .locator(`[data-testid^="${TestIds.RESUME_DETAIL_VERSION_ROW}-"]`);
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("v2");
    await expect(page.getByTestId(TestIds.RESUME_DETAIL_IMPORT_FORM)).toHaveCount(0);
  });
});
