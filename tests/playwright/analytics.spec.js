import { expect, test } from "@playwright/test";
import path from "node:path";

test("calcule les gains dans le navigateur avec le moteur partagé", async ({ page }) => {
  await page.goto("about:blank");
  await page.addScriptTag({ path: path.resolve("src/analytics.js") });

  const gains = await page.evaluate(() =>
    window.BnriAnalytics.gainSeries(
      [
        [Date.UTC(2025, 11, 31), 150000],
        [Date.UTC(2026, 9, 29), 170000],
      ],
      [
        [Date.UTC(2025, 11, 31), 120000],
        [Date.UTC(2026, 9, 29), 130000],
      ],
    ),
  );

  expect(gains).toEqual([
    [Date.UTC(2025, 11, 31), 30000],
    [Date.UTC(2026, 9, 29), 40000],
  ]);
});
