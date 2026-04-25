import { expect, type Page } from "@playwright/test";

import { E2E_USER } from "./api";
import { TestIds } from "./selectors";

/**
 * Sign in as the seeded e2e user, wait for the login response to land,
 * and assert the post-login redirect to /dashboard/opportunities.
 *
 * Existing specs (`auth.spec.ts`, `resumes.spec.ts`, `opportunity_resumes.spec.ts`,
 * etc.) inline equivalent logic; new specs should use this helper, and
 * those older ones can migrate incrementally.
 */
export async function loginAsE2EUser(page: Page): Promise<void> {
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
