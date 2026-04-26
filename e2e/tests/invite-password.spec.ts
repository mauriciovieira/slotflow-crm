import { expect, test } from "@playwright/test";
import { TestIds } from "../support/selectors";
import { resetDb } from "../support/api";
import { seedInvite } from "../support/invites";

test.beforeEach(async ({ request }) => {
  await resetDb(request);
});

test("invitee accepts via password and lands on /2fa/setup", async ({
  page,
  request,
}) => {
  const invite = await seedInvite(request, { email: "alice@x.com" });

  await page.goto(invite.accept_url);
  await expect(page.getByTestId(TestIds.ACCEPT_INVITE_PAGE)).toBeVisible();
  await expect(page.getByTestId(TestIds.ACCEPT_INVITE_EMAIL)).toHaveText(
    "alice@x.com",
  );

  // Scroll the ToS body to the bottom to enable the checkbox.
  const scrollEl = page.getByTestId(TestIds.ACCEPT_INVITE_TOS_SCROLL);
  await scrollEl.evaluate((el) => {
    (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight;
  });

  await page.getByTestId(TestIds.ACCEPT_INVITE_TOS_CHECKBOX).check();
  await page
    .getByTestId(TestIds.ACCEPT_INVITE_PASSWORD)
    .fill("Sup3r-Secret-Pw!");
  await page.getByTestId(TestIds.ACCEPT_INVITE_SUBMIT).click();

  await expect(page).toHaveURL(/\/2fa\/setup/);
});
