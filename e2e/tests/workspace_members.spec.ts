import { expect, test } from "@playwright/test";

import { resetDb } from "../support/api";
import { loginAsE2EUser } from "../support/auth";
import { TestIds } from "../support/selectors";

// The seeded e2e workspace has one user. To exercise the members surface
// (multi-row table + invitations + role toggle) deterministically we
// stub the `/api/workspaces/<id>/(members|invitations)/*` endpoints via
// `page.route`. Real BE coverage lives in
// `backend/tenancy/tests/{api,services}/`.
test.describe("workspace members", () => {
  test.beforeEach(async ({ request }) => {
    await resetDb(request);
  });

  test("invite member → see pending row → revoke", async ({ page }) => {
    const wsRe = /\/api\/workspaces\/([0-9a-f-]+)\/(members|invitations)/;
    type Member = {
      id: string;
      user_id: string;
      username: string;
      email: string;
      role: "owner" | "member" | "viewer";
      created_at: string;
    };
    type Invitation = {
      id: string;
      email: string;
      role: "owner" | "member" | "viewer";
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
      created_at: string;
      is_active: boolean;
      token?: string;
    };

    const members: Member[] = [
      {
        id: "m-self",
        user_id: "u-self",
        username: "e2e",
        email: "e2e@example.com",
        role: "owner",
        created_at: "2026-04-01T00:00:00Z",
      },
      {
        id: "m-bob",
        user_id: "u-bob",
        username: "bob",
        email: "bob@example.com",
        role: "member",
        created_at: "2026-04-01T00:00:00Z",
      },
    ];
    const invitations: Invitation[] = [];

    await page.route(wsRe, async (route) => {
      const url = new URL(route.request().url());
      const segments = url.pathname.split("/").filter(Boolean);
      // segments: ["api", "workspaces", "<ws_id>", "members"|"invitations", ...]
      const collection = segments[3];
      const targetId = segments[4];
      const method = route.request().method();

      if (collection === "members") {
        if (method === "GET" && !targetId) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(members),
          });
          return;
        }
        if (method === "PATCH" && targetId) {
          const body = JSON.parse(route.request().postData() ?? "{}");
          const member = members.find((m) => m.id === targetId);
          if (member) member.role = body.role;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(member ?? {}),
          });
          return;
        }
      }

      if (collection === "invitations") {
        if (method === "GET" && !targetId) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(
              invitations.filter((i) => !i.revoked_at && !i.accepted_at),
            ),
          });
          return;
        }
        if (method === "POST" && !targetId) {
          const body = JSON.parse(route.request().postData() ?? "{}");
          const inv: Invitation = {
            id: `inv-${invitations.length + 1}`,
            email: body.email,
            role: body.role,
            expires_at: "2026-05-10T00:00:00Z",
            accepted_at: null,
            revoked_at: null,
            created_at: "2026-04-26T00:00:00Z",
            is_active: true,
            token: "stub-token-xyz",
          };
          invitations.push(inv);
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify(inv),
          });
          return;
        }
        if (method === "DELETE" && targetId) {
          const inv = invitations.find((i) => i.id === targetId);
          if (inv) inv.revoked_at = new Date().toISOString();
          await route.fulfill({ status: 204, body: "" });
          return;
        }
      }

      await route.fallback();
    });

    // Stub `/api/auth/me/` so the FE thinks the e2e user is named "e2e"
    // matching our `members` fixture.
    await page.route(/\/api\/auth\/me\/$/, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          username: "e2e",
          has_totp_device: true,
          is_verified: true,
        }),
      });
    });

    await loginAsE2EUser(page);
    await page.goto("/dashboard/settings");

    // Members table renders.
    await expect(page.getByTestId(TestIds.SETTINGS_MEMBERS_TABLE)).toBeVisible();
    await expect(page.getByTestId(`${TestIds.SETTINGS_MEMBERS_ROW}-m-bob`)).toContainText("bob");

    // Invite a teammate.
    await page
      .getByTestId(TestIds.SETTINGS_MEMBERS_INVITE_EMAIL)
      .fill("new@example.com");
    await page.getByTestId(TestIds.SETTINGS_MEMBERS_INVITE_SUBMIT).click();

    // Pending row shows up.
    const pendingRow = page.getByTestId(`${TestIds.SETTINGS_MEMBERS_PENDING_ROW}-inv-1`);
    await expect(pendingRow).toContainText("new@example.com");

    // Accept link surfaces.
    await expect(page.getByTestId(TestIds.SETTINGS_MEMBERS_PENDING_LINK)).toContainText(
      "stub-token-xyz",
    );

    // Revoke removes the row.
    await page.getByTestId(`${TestIds.SETTINGS_MEMBERS_PENDING_REVOKE}-inv-1`).click();
    await expect(pendingRow).toBeHidden();
  });
});
