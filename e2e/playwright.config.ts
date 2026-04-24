// Playwright config for the slotflow e2e suite.
// Spawns `make dev` (or reuses a running one) with SLOTFLOW_BYPASS_2FA=1 so
// Playwright can drive the real auth flow without computing TOTP codes.
import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  fullyParallel: false,
  // Single worker: auth.spec.ts (Task 5) uses POST /api/test/_reset/ in
  // beforeEach to flush the DB. Parallel workers would race on the shared DB.
  // Revisit when per-worker DB isolation lands.
  workers: 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "make -C .. dev",
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      SLOTFLOW_BYPASS_2FA: "1",
      // `make dev` also starts the Celery worker. For local Playwright runs,
      // force an in-memory broker and result backend so the e2e stack does
      // not require Redis to be available. In CI, leave Celery config
      // untouched so the job exercises its provisioned Redis-backed setup.
      ...(process.env.CI
        ? {}
        : {
            CELERY_BROKER_URL: "memory://",
            CELERY_RESULT_BACKEND: "cache+memory://",
          }),
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
