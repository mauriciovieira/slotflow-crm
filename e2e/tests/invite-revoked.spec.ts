import { expect, test } from "@playwright/test";
import { TestIds } from "../support/selectors";
import { resetDb } from "../support/api";
import { seedInvite } from "../support/invites";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("revoked invite renders Revoked error variant", async ({ page, request }) => {
  const invite = await seedInvite(request, {
    email: "alice@x.com",
    status: "revoked",
  });
  await page.goto(invite.accept_url);
  await expect(page.getByTestId(TestIds.ACCEPT_INVITE_REVOKED)).toBeVisible();
});
