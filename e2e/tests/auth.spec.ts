import { expect, test } from "@playwright/test";

import { E2E_USER, resetDb } from "../support/api";
import { TestIds } from "../support/selectors";

test.describe("auth flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("authenticated non-admin user can sign in, see home, and sign out", async ({
    page,
    request,
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

    // Fail fast if the target server is not running under bypass.
    const me = await request.get("/api/auth/me/");
    expect(me.ok()).toBeTruthy();
    const body = await me.json();
    expect(
      body.is_verified,
      "bypass flag not active on target server; set SLOTFLOW_BYPASS_2FA=1",
    ).toBe(true);

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId(TestIds.SIGNED_IN_HEADER)).toBeVisible();

    await page.getByTestId(TestIds.SIGN_OUT_BUTTON).click();

    await expect(page.getByTestId(TestIds.LANDING_CTA_PRIMARY)).toBeVisible();
  });
});
