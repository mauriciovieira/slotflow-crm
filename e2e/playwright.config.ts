import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
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
    reuseExistingServer: true,
    env: {
      SLOTFLOW_BYPASS_2FA: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
});
