import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

test.describe("resume render flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("View HTML opens the rendered resume in a new tab", async ({ page, context }) => {
    await loginAsE2EUser(page);

    // Resume + first version with a known basics.name.
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
      .fill('{"basics": {"name": "Alice Example"}}');
    await page.getByTestId(TestIds.RESUME_DETAIL_NEW_VERSION_SUBMIT).click();

    // The version row exposes a "View HTML" link with target="_blank".
    // Use Playwright's expectPage to grab the new tab when the link is
    // clicked, then assert the rendered HTML contains the candidate name.
    const versionsList = page.getByTestId(TestIds.RESUME_DETAIL_VERSIONS_LIST);
    await expect(versionsList).toBeVisible();
    const renderLink = versionsList.locator(
      `[data-testid^="${TestIds.RESUME_DETAIL_VERSION_RENDER_LINK}-"]`,
    );
    await expect(renderLink).toBeVisible();

    const newPagePromise = context.waitForEvent("page");
    await renderLink.click();
    const rendered = await newPagePromise;
    await rendered.waitForLoadState("domcontentloaded");

    const body = await rendered.textContent("body");
    expect(body).toContain("Alice Example");
  });
});
