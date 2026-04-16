import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    headless: true,
  },
});
