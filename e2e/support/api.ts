import type { APIRequestContext } from "@playwright/test";

// Matches the backend's empty-string-safe fallback in api_test_reset.py and
// seed_e2e_user.py so an exported-but-empty SLOTFLOW_E2E_PASSWORD still lines
// up with the seeded credentials instead of sending/using an empty value.
const E2E_PASSWORD = (process.env.SLOTFLOW_E2E_PASSWORD ?? "").trim() || "e2e-local-only";

/**
 * Reset the backend DB and reseed the e2e user.
 *
 * Hits POST /api/test/_reset/, which is only live when the Django server is
 * running under SLOTFLOW_BYPASS_2FA=1 (DEBUG-gated). Throws on non-2xx so a
 * misconfigured target fails the test fast instead of through a 30s timeout.
 */
export async function resetDb(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/test/_reset/", {
    headers: {
      // The reset endpoint requires this header to match SLOTFLOW_E2E_PASSWORD
      // on the server, preventing arbitrary cross-site POSTs from wiping the DB.
      "X-Reset-Token": E2E_PASSWORD,
    },
  });
  if (!response.ok()) {
    const rawBody = (await response.text()).trim();
    let detail = rawBody;
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as { detail?: unknown };
        if (typeof parsed.detail === "string" && parsed.detail.trim()) {
          detail = parsed.detail.trim();
        }
      } catch {
        // Keep the raw response text when the body isn't JSON.
      }
    }
    const hint =
      response.status() === 403
        ? "Is SLOTFLOW_BYPASS_2FA=1 set on the backend, and does X-Reset-Token match SLOTFLOW_E2E_PASSWORD?"
        : "Is SLOTFLOW_BYPASS_2FA=1 set on the backend?";
    throw new Error(
      `resetDb failed: ${response.status()} ${response.statusText()}` +
        (detail ? ` - ${detail}` : "") +
        `. ${hint}`,
    );
  }
}

/**
 * Credentials for the seeded e2e user. The Django seed command reads
 * SLOTFLOW_E2E_PASSWORD from the environment; default is "e2e-local-only".
 */
export const E2E_USER = {
  username: "e2e",
  password: E2E_PASSWORD,
} as const;
