import { expect, test } from "@playwright/test";
import { TestIds } from "../support/selectors";
import { resetDb } from "../support/api";
import { seedInvite } from "../support/invites";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("expired invite renders Expired error variant", async ({ page, request }) => {
  const invite = await seedInvite(request, {
    email: "alice@x.com",
    expired: true,
  });
  await page.goto(invite.accept_url);
  await expect(page.getByTestId(TestIds.SIGNUP_INVITATION_EXPIRED)).toBeVisible();
});
