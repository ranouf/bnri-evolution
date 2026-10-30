(() => {
  "use strict";

  const API_ORIGIN = "https://iiroc.investments.apis.monportefeuilleplus.ca/";
  const PAGE_SOURCE = "bnri-evolution-page";
  const CONTENT_SOURCE = "bnri-evolution-content";
  const NativeXHR = window.XMLHttpRequest;
  const nativeFetch = window.fetch.bind(window);
  const recentResponses = [];
  const sessionHeaders = new Headers({ Accept: "application/json" });

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

  const rememberHeader = (name, value) => {
    if (["authorization", "language", "site-code"].includes(name.toLowerCase())) {
      sessionHeaders.set(name, value);
    }
  };

  const parseJson = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const routePayload = (url, payload, requestId = null) => {
    if (!payload || typeof payload !== "object") return;
    emit(url, payload, requestId);
  };

  class ObservedXHR extends NativeXHR {
    constructor() {
      super();
      this.__bnriUrl = "";
      this.addEventListener("load", () => {
        if (!this.__bnriUrl.startsWith(API_ORIGIN) || this.status >= 400) return;
        const payload =
          this.responseType === "json"
            ? this.response
            : this.responseType === "" || this.responseType === "text"
              ? parseJson(this.responseText)
              : null;
        routePayload(this.__bnriUrl, payload);
      });
    }

    open(method, url, ...rest) {
      this.__bnriUrl = new URL(String(url), location.href).href;
      return super.open(method, url, ...rest);
    }

    setRequestHeader(name, value) {
      rememberHeader(name, value);
      return super.setRequestHeader(name, value);
    }
  }

  window.XMLHttpRequest = ObservedXHR;
  window.fetch = async (...args) => {
    const input = args[0];
    const url = new URL(typeof input === "string" ? input : input.url, location.href).href;
    const headers = new Headers(args[1]?.headers ?? input?.headers ?? {});
    for (const [name, value] of headers) rememberHeader(name, value);
    const response = await nativeFetch(...args);
    if (url.startsWith(API_ORIGIN)) {
      response
        .clone()
        .json()
        .then((payload) => routePayload(url, payload))
        .catch(() => undefined);
    }
    return response;
  };

  const requestJson = async (url, requestId) => {
    if (!url.startsWith(API_ORIGIN)) throw new Error("Adresse API non autorisée");
    const response = await nativeFetch(url, {
      credentials: "include",
      headers: sessionHeaders,
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    routePayload(url, await response.json(), requestId);
  };

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
