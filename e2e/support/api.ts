import type { APIRequestContext } from "@playwright/test";

/**
 * Reset the backend DB and reseed the e2e user.
 *
 * Hits POST /api/test/_reset/, which is only live when the Django server is
 * running under SLOTFLOW_BYPASS_2FA=1 (DEBUG-gated). Throws on non-2xx so a
 * misconfigured target fails the test fast instead of through a 30s timeout.
 */
export async function resetDb(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/test/_reset/");
  if (!response.ok()) {
    throw new Error(
      `resetDb failed: ${response.status()} ${response.statusText()}. ` +
        `Is SLOTFLOW_BYPASS_2FA=1 set on the backend?`,
    );
  }
}

/**
 * Credentials for the seeded e2e user. The Django seed command reads
 * SLOTFLOW_E2E_PASSWORD from the environment; default is "e2e-local-only".
 */
export const E2E_USER = {
  username: "e2e",
  password: process.env.SLOTFLOW_E2E_PASSWORD ?? "e2e-local-only",
} as const;
