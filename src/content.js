(() => {
  "use strict";

  const API_ORIGIN = "https://iiroc.investments.apis.monportefeuilleplus.ca";
  const PAGE_SOURCE = "bnri-evolution-page";
  const CONTENT_SOURCE = "bnri-evolution-content";
  const money = new Intl.NumberFormat("fr-CA", {
    currency: "CAD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
  const percent = new Intl.NumberFormat("fr-CA", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
  const allocationPercent = new Intl.NumberFormat("fr-CA", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  });
  const state = {
    accounts: [],
    history: [],
    open: false,
    planAccounts: new Map(),
    progress: "Connexion au portail…",
    summary: null,
  };
  let root;

  const unwrap = (payload) => payload?.data ?? payload;
  const asNumber = (value) => Number(value ?? 0);
  const accountNumber = (item) => item?.account?.acctNo ?? item?.acctNo ?? "";
  const accountType = (item) =>
    item?.account?.acctTypeDesc ?? item?.acctTypeDesc ?? item?.account?.acctTypeCd ?? "Compte";
  const accountCurrency = (item) => item?.account?.acctCurrCd ?? item?.acctCurrCd ?? "CAD";
  const accountEvaluation = (item) => {
    const evaluations =
      item?.accountsSummaryEvalByCurrency ??
      item?.accountSummaryEvalByCurrency ??
      item?.summaryEvalByCurrency ??
      {};
    return (
      evaluations.CAD ??
      evaluations[accountCurrency(item)] ??
      item?.accountsSummaryEval ??
      item?.accountSummaryEval ??
      item
    );
  };
  const accountValue = (item) => {
    const evaluation = accountEvaluation(item);
    return asNumber(
      evaluation?.total ??
        evaluation?.marketValueAmt ??
        evaluation?.accountsSummaryEvalTotal?.total,
    );
  };

  const normalizeAccounts = (summary) =>
    (summary?.portfolioSummaryList ?? []).flatMap((portfolio) =>
      (portfolio.accountSummaries ?? []).map((item) => ({
        currency: accountCurrency(item),
        label: accountType(item),
        number: accountNumber(item),
        value: accountValue(item),
      })),
    );

  const descriptionOf = (item) =>
    Array.isArray(item.activityDesc)
      ? item.activityDesc.join(" ")
      : String(item.activityDesc ?? "");
  const operationText = (item) => `${item.activityType ?? ""} ${descriptionOf(item)}`.trim();
  const dateOf = (item) => new Date(item.tradeDt ?? item.processingDt ?? item.settlementDt);
  const isContribution = (item) =>
    /cotisation|contribution|d[ée]p[oô]t|deposit|versement|transfert entrant/i.test(
      operationText(item),
    );
  const isInternalContribution = (item) => /cotisation/i.test(operationText(item));
  const isWithdrawal = (item) =>
    /retrait|withdrawal|transfert sortant|au cmpt\. enrg/i.test(operationText(item));
  const isInternalWithdrawal = (item) => /au cmpt\. enrg/i.test(operationText(item));
  const isFee = (item) => /frais|fee|commission|tps|tvq|gst|qst/i.test(operationText(item));

  const transactionsFor = (number) =>
    number
      ? state.history.filter((item) => String(accountNumber(item)) === String(number))
      : state.history;

  const cashFlow = (items, accountScoped) =>
    items.reduce((total, item) => {
      const amount = asNumber(item.netAmount);
      if (isWithdrawal(item)) {
        return accountScoped || !isInternalWithdrawal(item) ? total - Math.abs(amount) : total;
      }
      if (isContribution(item) && (accountScoped || !isInternalContribution(item))) {
        return total + Math.abs(amount);
      }
      return total;
    }, 0);

  const fees = (items) =>
    items.reduce((total, item) => {
      const commission = Math.abs(asNumber(item.commissionAmount));
      return total + (commission || (isFee(item) ? Math.abs(asNumber(item.netAmount)) : 0));
    }, 0);

  const contributionRows = (items) =>
    items
      .filter((item) => isContribution(item) && !isWithdrawal(item))
      .map((item) => ({
        account: accountType(item),
        amount: Math.abs(asNumber(item.netAmount)),
        date: dateOf(item),
        operation: item.activityType,
      }))
      .sort((left, right) => right.date - left.date);

  const totalValue = () => state.accounts.reduce((total, account) => total + account.value, 0);
  const metricsFor = (account) => {
    const items = transactionsFor(account?.number);
    const value = account?.value ?? totalValue();
    const invested = cashFlow(items, Boolean(account));
    const gain = value - invested;
    return {
      feeTotal: fees(items),
      gain,
      invested,
      returnRate: invested ? (gain / invested) * 100 : 0,
      value,
    };
  };

  const annualRows = () => {
    const currentYear = new Date().getFullYear();
    const years = [...new Set(state.history.map((item) => dateOf(item).getFullYear()))]
      .filter(Number.isFinite)
      .sort((left, right) => right - left);
    const total = metricsFor();
    return years.map((year) => {
      const items = state.history.filter((item) => dateOf(item).getFullYear() === year);
      const invested = cashFlow(items, false);
      return {
        feeTotal: fees(items),
        gain: year === currentYear ? total.gain : null,
        invested,
        returnRate: year === currentYear ? total.returnRate : null,
        year,
      };
    });
  };

  const request = (url, requestId) =>
    window.postMessage(
      { detail: { requestId, url }, source: CONTENT_SOURCE, type: "api-request" },
      location.origin,
    );

  const requestDetails = () => {
    const numbers = state.accounts.map(({ number }) => number).filter(Boolean);
    if (!numbers.length) return;
    const query = numbers.map((number) => `acctNo=${encodeURIComponent(number)}`).join("&");
    request(`${API_ORIGIN}/orion-api/v1/1/accounts/history?${query}&period=TWO_YEARS`, "history");
    for (const account of state.accounts.filter(({ label }) =>
      /CELI|REER|REEE|FHSA|LIRA/i.test(label),
    )) {
      const type = /CELI/i.test(account.label)
        ? "TFSA"
        : /REER/i.test(account.label)
          ? "RRSP"
          : null;
      if (type) {
        request(
          `${API_ORIGIN}/orion-api/v1/1/planAccts/${type}?acctNo=${encodeURIComponent(account.number)}&year=${new Date().getFullYear()}`,
          `plan:${account.number}`,
        );
      }
    }
  };

  const receive = ({ data, requestId, url }) => {
    const payload = unwrap(data);
    if (data?.__bnriError) {
      state.progress = data.__bnriError;
      render();
      return;
    }
    if (requestId === "history" || url.includes("/accounts/history")) {
      state.history = payload.activityList ?? [];
      state.progress = `${state.history.length} opération(s) analysée(s)`;
    } else if (requestId?.startsWith("plan:")) {
      state.planAccounts.set(requestId.slice(5), payload);
    } else if (url.includes("/portfolios/summary")) {
      state.summary = payload;
      state.accounts = normalizeAccounts(payload);
      state.progress = `${state.accounts.length} compte(s) détecté(s)`;
      requestDetails();
    }
    render();
  };

  const card = (label, value, tone = "") =>
    `<article class="be-card ${tone}"><span>${label}</span><strong>${value}</strong></article>`;

  const contributionTable = (items) => {
    const rows = contributionRows(items).slice(0, 12);
    if (!rows.length) return '<p class="be-empty">Aucune cotisation détectée sur la période.</p>';
    return `<div class="be-table-wrap"><table><thead><tr><th>Date</th><th>Compte</th><th>Opération</th><th>Montant</th></tr></thead><tbody>${rows
      .map(
        (item) =>
          `<tr><td>${item.date.toLocaleDateString("fr-CA")}</td><td>${item.account}</td><td>${item.operation}</td><td>${money.format(item.amount)}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  };

  const annualTable = () => {
    const rows = annualRows();
    if (!rows.length) return '<p class="be-empty">Aucun historique annuel disponible.</p>';
    return `<div class="be-table-wrap"><table><thead><tr><th>Année</th><th>Capital net</th><th>Gain</th><th>Rendement</th><th>Frais</th></tr></thead><tbody>${rows
      .map(
        (item) =>
          `<tr><td><strong>${item.year}</strong></td><td>${money.format(item.invested)}</td><td>${item.gain === null ? "—" : money.format(item.gain)}</td><td>${item.returnRate === null ? "—" : `${percent.format(item.returnRate)} %`}</td><td>${money.format(item.feeTotal)}</td></tr>`,
      )
      .join("")}</tbody></table></div>`;
  };

  const allocation = () => {
    const total = totalValue();
    return `<div class="be-allocation">${state.accounts
      .map((account) => {
        const ratio = total ? (account.value / total) * 100 : 0;
        return `<div class="be-allocation-row"><div><span>${account.label}</span><strong>${allocationPercent.format(ratio)} %</strong></div><div class="be-allocation-track"><span style="width: ${Math.max(0, Math.min(100, ratio))}%"></span></div></div>`;
      })
      .join("")}</div>`;
  };

  const accountSection = (account) => {
    const metrics = metricsFor(account);
    return `<section class="be-account">
      <div class="be-account-title"><div><small>${account.currency}</small><h3>${account.label}</h3></div><strong>${money.format(metrics.value)}</strong></div>
      <div class="be-metrics">
        ${card("Capital net", money.format(metrics.invested))}
        ${card("Gain cumulé", money.format(metrics.gain), metrics.gain >= 0 ? "positive" : "negative")}
        ${card("Rendement estimé", `${percent.format(metrics.returnRate)} %`, metrics.returnRate >= 0 ? "positive" : "negative")}
        ${card("Frais détectés", money.format(metrics.feeTotal))}
      </div>
    </section>`;
  };

  const panel = () => {
    const total = metricsFor();
    if (!state.accounts.length) {
      return `<div class="be-loading"><div class="be-loader"></div><h3>Analyse du portefeuille</h3><p>${state.progress}</p><small>Ouvrez le sommaire BNRI ou actualisez la page.</small></div>`;
    }
    return `<div class="be-content">
      <section class="be-hero">
        <div><small>VUE CONSOLIDÉE</small><h2>Votre portefeuille en un coup d’œil</h2><p>${state.progress}</p></div>
        <strong>${money.format(total.value)}</strong>
      </section>
      <div class="be-metrics be-total-metrics">
        ${card("Capital net", money.format(total.invested))}
        ${card("Gain cumulé", money.format(total.gain), total.gain >= 0 ? "positive" : "negative")}
        ${card("Rendement estimé", `${percent.format(total.returnRate)} %`, total.returnRate >= 0 ? "positive" : "negative")}
        ${card("Frais détectés", money.format(total.feeTotal))}
      </div>
      <section class="be-section"><div class="be-section-heading"><div><small>PAR ANNÉE</small><h2>Rendements annuels</h2></div><span>24 mois</span></div>${annualTable()}</section>
      <section class="be-section"><div class="be-section-heading"><div><small>RÉPARTITION</small><h2>Valeur par compte</h2></div></div>${allocation()}</section>
      <section class="be-section"><div class="be-section-heading"><div><small>PAR COMPTE</small><h2>Performance détaillée</h2></div><span>${state.accounts.length} comptes</span></div>${state.accounts.map(accountSection).join("")}</section>
      <section class="be-section"><div class="be-section-heading"><div><small>MOUVEMENTS</small><h2>Cotisations récentes</h2></div></div>${contributionTable(state.history)}</section>
      <p class="be-note">Les rendements sont des estimations fondées sur la valeur actuelle et les mouvements détectés sur les 24 derniers mois. Les transferts internes sont neutralisés dans la vue consolidée. Un tiret indique qu'aucune valeur de clôture annuelle n'est disponible.</p>
    </div>`;
  };

  const render = () => {
    if (!root) return;
    root.classList.toggle("be-open", state.open);
    root.innerHTML = `<button class="be-launch" type="button" aria-label="Ouvrir BNRI Évolution"><span class="be-mark">B</span><span><strong>BNRI</strong><small>ÉVOLUTION</small></span></button>
      <aside class="be-panel" aria-label="BNRI Évolution" ${state.open ? "" : "hidden"}>
        <header><div class="be-brand"><span class="be-mark">B</span><div><strong>BNRI Évolution</strong><small>Analyse de portefeuille</small></div></div><button class="be-close" type="button" aria-label="Fermer">×</button></header>
        ${panel()}
      </aside>`;
    root.querySelector(".be-launch")?.addEventListener("click", () => {
      state.open = true;
      render();
    });
    root.querySelector(".be-close")?.addEventListener("click", () => {
      state.open = false;
      render();
    });
  };

  const mount = () => {
    root = document.createElement("div");
    root.id = "bnri-evolution-extension";
    document.documentElement.append(root);
    render();
    window.addEventListener("message", (event) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.source !== PAGE_SOURCE
      )
        return;
      if (event.data.type === "api-response") receive(event.data.detail);
      if (event.data.type === "progress") {
        state.progress = event.data.detail.detail;
        render();
      }
    });
    window.postMessage({ source: CONTENT_SOURCE, type: "sync" }, location.origin);
  };

  if (document.documentElement) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
