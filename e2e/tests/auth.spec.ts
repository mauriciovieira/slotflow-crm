import { expect, test } from "@playwright/test";

import { E2E_USER, resetDb } from "../support/api";
import { TestIds } from "../support/selectors";

test.describe("auth flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("authenticated non-admin user can sign in, see home, and sign out", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByTestId(TestIds.LOGIN_USERNAME).fill(E2E_USER.username);
    await page.getByTestId(TestIds.LOGIN_PASSWORD).fill(E2E_USER.password);

    const loginResponse = page.waitForResponse(
      (resp) => resp.url().includes("/api/auth/login/") && resp.request().method() === "POST",
    );
    await page.getByTestId(TestIds.LOGIN_SUBMIT).click();
    const finishedLogin = await loginResponse;
    expect(finishedLogin.status()).toBe(200);

    // Fail fast if the target server is not running under bypass. Uses
    // page.request so the browser session cookie is included — the top-level
    // `request` fixture has its own cookie jar and would appear anonymous.
    const me = await page.request.get("/api/auth/me/");
    expect(me.ok()).toBeTruthy();
    const body = await me.json();
    expect(
      body.is_verified,
      "bypass flag not active on target server; set SLOTFLOW_BYPASS_2FA=1",
    ).toBe(true);

    // Post-login redirect chains /dashboard → /dashboard/opportunities (the
    // default sub-route set by the dashboard router). The dashboard header
    // shows the signed-in username, and the opportunities stub is rendered in
    // the outlet.
    await expect(page).toHaveURL("/dashboard/opportunities");
    await expect(page.getByTestId(TestIds.SIGNED_IN_HEADER)).toBeVisible();
    await expect(page.getByTestId(TestIds.DASHBOARD_HEADER)).toContainText("Opportunities");
    await expect(page.getByTestId(TestIds.STUB_PANEL)).toBeVisible();

    // Sign out from the dashboard header. AuthGuard sees the session is gone
    // and navigates to /login; the primary submit button is our proxy for "the
    // login form is back on screen."
    await page.getByTestId(TestIds.SIGN_OUT_BUTTON).click();
    await expect(page).toHaveURL("/login");
    await expect(page.getByTestId(TestIds.LOGIN_SUBMIT)).toBeVisible();

    // Sanity: the anonymous marketing CTA still loads when we navigate back to /.
    await page.goto("/");
    await expect(page.getByTestId(TestIds.LANDING_CTA_PRIMARY)).toBeVisible();
  });
});
