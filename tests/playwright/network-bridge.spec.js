import { expect, test } from "@playwright/test";
import fs from "node:fs";

const apiOrigin = "https://iiroc.investments.apis.monportefeuilleplus.ca";

test("la lecture des réponses API préserve les requêtes du portail", async ({ page }) => {
  await page.route("https://monportefeuilleplus.ca/nbin/home", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="fr"><body>
        <h1 id="heading">…</h1><p id="promise"></p><p id="xhr"></p><p id="api"></p>
        <script>
          document.querySelector("#xhr").textContent = String(window.XMLHttpRequest === window.originalXHR);
          const dictionaryRequest = fetch("/assets/dictionary/menu-fr.json");
          document.querySelector("#promise").textContent = String(dictionaryRequest === window.nativePromise);
          dictionaryRequest.then((response) => response.json()).then((dictionary) => {
            document.querySelector("#heading").textContent = dictionary.summary;
          });
          window.addEventListener("message", (event) => {
            if (event.data?.source === "bnri-evolution-page" && event.data?.type === "api-response") {
              document.querySelector("#api").textContent = String(event.data.detail.data.data.value);
            }
          });
          const xhr = new XMLHttpRequest();
          xhr.open("GET", "${apiOrigin}/orion-api/v1/1/portfolios/summary");
          xhr.send();
        </script></body></html>`,
    }),
  );
  await page.route("https://monportefeuilleplus.ca/assets/dictionary/menu-fr.json", (route) =>
    route.fulfill({ json: { summary: "Sommaire" } }),
  );
  await page.route(`${apiOrigin}/orion-api/v1/1/portfolios/summary`, (route) =>
    route.fulfill({
      headers: {
        "access-control-allow-origin": "https://monportefeuilleplus.ca",
        "access-control-allow-credentials": "true",
      },
      json: { data: { value: 42 } },
    }),
  );
  const bridge = fs.readFileSync("src/network-bridge.js", "utf8");
  await page.addInitScript({
    content: `window.originalXHR = window.XMLHttpRequest;
      const originalFetch = window.fetch.bind(window);
      window.fetch = (...args) => {
        const promise = originalFetch(...args);
        window.nativePromise = promise;
        return promise;
      };
      ${bridge}`,
  });

  await page.goto("https://monportefeuilleplus.ca/nbin/home");
  await expect(page.getByRole("heading", { name: "Sommaire" })).toBeVisible();
  await expect(page.locator("#promise")).toHaveText("true");
  await expect(page.locator("#xhr")).toHaveText("true");
  await expect(page.locator("#api")).toHaveText("42");
  await page.screenshot({ path: ".vs/bnri-labels.png" });
});
