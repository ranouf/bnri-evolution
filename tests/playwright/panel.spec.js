import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("affiche le tableau de bord BNRI avec des données de portefeuille", async ({ page }) => {
  await page.setViewportSize({ height: 800, width: 1280 });
  await page.route("https://monportefeuilleplus.ca/**", (route) =>
    route.fulfill({ body: '<!doctype html><html lang="fr"><body></body></html>' }),
  );
  await page.goto("https://monportefeuilleplus.ca/nbin/home");
  await page.addStyleTag({ path: path.resolve("src/styles.css") });
  await page.addScriptTag({ path: path.resolve("src/analytics.js") });
  await page.addScriptTag({ path: path.resolve("src/content.js") });

  await page.evaluate(() => {
    const emit = (url, data, requestId = null) =>
      window.postMessage(
        { detail: { data, requestId, url }, source: "bnri-evolution-page", type: "api-response" },
        location.origin,
      );

    emit(
      "https://iiroc.investments.apis.monportefeuilleplus.ca/orion-api/v1/1/portfolios/summary",
      {
        data: {
          portfolioSummaryList: [
            {
              accountSummaries: [
                {
                  account: { acctCurrCd: "CAD", acctNo: "100A", acctTypeDesc: "Comptant" },
                  accountsSummaryEvalByCurrency: { CAD: { total: 42000 } },
                },
                {
                  account: { acctCurrCd: "CAD", acctNo: "100W", acctTypeDesc: "CELI" },
                  accountsSummaryEvalByCurrency: { CAD: { total: 68000 } },
                },
              ],
            },
          ],
        },
      },
    );

    emit(
      "https://iiroc.investments.apis.monportefeuilleplus.ca/orion-api/v1/1/accounts/history",
      {
        data: {
          activityList: [
            {
              account: { acctNo: "100A", acctTypeDesc: "Comptant" },
              activityDesc: "DÉPÔT INITIAL",
              activityType: "Dépôt",
              netAmount: 100000,
              tradeDt: "2026-04-16",
            },
            {
              account: { acctNo: "100A", acctTypeDesc: "Comptant" },
              activityDesc: "COTISATION AU CELI",
              activityType: "Au cmpt. Enrg.",
              netAmount: -64000,
              tradeDt: "2026-04-28",
            },
            {
              account: { acctNo: "100W", acctTypeDesc: "CELI" },
              activityDesc: "COTISATION",
              activityType: "Cotisation",
              netAmount: 64000,
              tradeDt: "2026-04-28",
            },
            {
              account: { acctNo: "100W", acctTypeDesc: "CELI" },
              activityDesc: "FRAIS DE GESTION",
              activityType: "Frais",
              commissionAmount: 25,
              netAmount: -25,
              tradeDt: "2026-05-01",
            },
          ],
        },
      },
      "history",
    );

    window.postMessage(
      {
        detail: {
          detail: "/orion-api/v1/1/accounts/history/",
          id: "activity",
          status: "done",
        },
        source: "bnri-evolution-page",
        type: "progress",
      },
      location.origin,
    );
  });

  await page.getByRole("button", { name: "Ouvrir BNRI Évolution" }).click();

  await expect(page.getByText("Votre portefeuille en un coup d’œil")).toBeVisible();
  await expect(page.getByText("110 000,00 $")).toBeVisible();
  await expect(page.getByText("10 000,00 $").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rendements annuels" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Valeur par compte" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CELI" })).toBeVisible();
  await expect(page.getByText("/orion-api/v1/1/accounts/history/")).toHaveCount(0);

  fs.mkdirSync(".codex", { recursive: true });
  await page.screenshot({ path: ".codex/bnri-panel-final.png" });
});
