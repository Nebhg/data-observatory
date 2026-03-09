import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const reviewLabel = process.env.REVIEW_LABEL || "review";

const reviewRoutes = [
  { name: "home", route: "/" },
  { name: "markets", route: "/markets" },
  { name: "runs", route: "/runs" },
];

async function capture(page: Page, name: string) {
  const outputDir = path.join("test-results", "browser-review", reviewLabel);
  await fs.mkdir(outputDir, { recursive: true });
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: true,
  });
}

test.describe("browser review", () => {
  for (const entry of reviewRoutes) {
    test(`captures ${entry.name} @review`, async ({ page }) => {
      await page.goto(entry.route, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();
      await capture(page, entry.name);
    });
  }
});