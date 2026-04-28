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
  await expect(page.getByTestId(TestIds.SIGNUP_INVITATION_PAGE)).toBeVisible();
  await expect(page.getByTestId(TestIds.SIGNUP_INVITATION_EMAIL)).toHaveText(
    "alice@x.com",
  );

  // Scroll the ToS body to the bottom to enable the checkbox. Programmatic
  // scrollTop changes don't always emit a scroll event in headless Chromium,
  // so dispatch one explicitly to trigger the React onScroll handler.
  const scrollEl = page.getByTestId(TestIds.SIGNUP_INVITATION_TOS_SCROLL);
  await scrollEl.evaluate((el) => {
    const node = el as HTMLElement;
    node.scrollTop = node.scrollHeight;
    node.dispatchEvent(new Event("scroll"));
  });

  await page.getByTestId(TestIds.SIGNUP_INVITATION_TOS_CHECKBOX).check();
  await page
    .getByTestId(TestIds.SIGNUP_INVITATION_PASSWORD)
    .fill("Sup3r-Secret-Pw!");
  await page.getByTestId(TestIds.SIGNUP_INVITATION_SUBMIT).click();

  await expect(page).toHaveURL(/\/2fa\/setup/);
});
