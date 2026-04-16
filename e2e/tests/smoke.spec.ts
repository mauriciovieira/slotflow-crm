import { expect, test } from "@playwright/test";

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("static fixture renders", async ({ page }) => {
  const htmlPath = path.join(__dirname, "..", "fixtures", "site", "index.html");
  await page.goto(`file://${htmlPath}`);

  await expect(page.getByTestId("title")).toHaveText("Slotflow");
  await expect(page.getByTestId("subtitle")).toHaveText("CI smoke fixture");
});
