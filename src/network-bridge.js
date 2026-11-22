(() => {
  "use strict";

  const API_ORIGIN = "https://iiroc.investments.apis.monportefeuilleplus.ca/";
  const PAGE_SOURCE = "bnri-evolution-page";
  const CONTENT_SOURCE = "bnri-evolution-content";
  const nativeFetch = window.fetch.bind(window);
  const recentResponses = [];
  const observedSummaries = new Set();

  const emit = (url, data, requestId = null) => {
    const detail = { data, requestId, url };
    recentResponses.push(detail);
    if (recentResponses.length > 60) recentResponses.shift();
    window.postMessage({ detail, source: PAGE_SOURCE, type: "api-response" }, location.origin);
  };

  const emitProgress = (id, status, detail) =>
    window.postMessage(
      { detail: { detail, id, status }, source: PAGE_SOURCE, type: "progress" },
      location.origin,
    );

  const routePayload = (url, payload, requestId = null) => {
    if (!payload || typeof payload !== "object") return;
    emit(url, payload, requestId);
  };

  const requestJson = async (url, requestId) => {
    if (!url.startsWith(API_ORIGIN)) throw new Error("Adresse API non autorisée");
    const response = await nativeFetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    routePayload(url, await response.json(), requestId);
  };

  new PerformanceObserver((list) => {
    for (const { name } of list.getEntries()) {
      if (
        !name.startsWith(API_ORIGIN) ||
        !new URL(name).pathname.endsWith("/portfolios/summary") ||
        observedSummaries.has(name)
      )
        continue;
      observedSummaries.add(name);
      requestJson(name, null).catch((error) => emit(name, { __bnriError: error.message }));
    }
  }).observe({ type: "resource", buffered: true });

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.source !== CONTENT_SOURCE
    )
      return;
    if (event.data.type === "api-request") {
      const { requestId, url } = event.data.detail;
      requestJson(url, requestId).catch((error) =>
        emit(url, { __bnriError: error.message }, requestId),
      );
      return;
    }
    if (event.data.type === "sync") {
      for (const detail of recentResponses) {
        window.postMessage({ detail, source: PAGE_SOURCE, type: "api-response" }, location.origin);
      }
      emitProgress("bridge", "done", "Connexion au portail établie");
    }
  });

  emitProgress("bridge", "done", "Connexion au portail établie");
})();
