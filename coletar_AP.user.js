// ==UserScript==
// @name         Coletar APs
// @namespace    http://tampermonkey.net/
// @author       Erik Higino
// @version      1.4
// @description  Captura APs SOMENTE da coluna "Nº AP" e envia ao servidor unificado. Forçado para 2025/2026.
// @match        https://ofcweb.inss.gov.br/View/Registrar_Analise_Ap_OFC.php*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-end
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/coletar_AP.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/coletar_AP.user.js
// ==/UserScript==

(function () {
  "use strict";

  const ENDPOINT = "http://127.0.0.1:8765/aps";

  // FORÇA: somente esses 2 endereços (sem auto-ano)
  const ALLOWED = new Set([
    "https://ofcweb.inss.gov.br/View/Registrar_Analise_Ap_OFC.php?&porpagina=10000&order=id_ap:DESC&filter=tb_ap2026.resp_analise:1563857&ultimo_evento=",
    "https://ofcweb.inss.gov.br/View/Registrar_Analise_Ap_OFC.php?&porpagina=10000&order=id_ap:DESC&filter=tb_ap2025.resp_analise:1563857&ultimo_evento=",
  ]);

  // APs no seu HTML podem ser 3-4 dígitos (ex.: 1090), então NÃO use 5-10.
  const AP_RX = /^\d{1,10}$/;

  let debounceTimer = null;

  function canonicalHref() {
    return location.href.split("#")[0];
  }

  function urlValida() {
    return ALLOWED.has(canonicalHref());
  }

  function toast(msg) {
    const id = "tm-toast-ap";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 999999,
        padding: "10px 14px",
        borderRadius: "10px",
        background: "rgba(0,0,0,.88)",
        color: "#fff",
        fontSize: "14px",
        boxShadow: "0 6px 20px rgba(0,0,0,.25)",
        opacity: "0",
        transition: "opacity .2s ease",
        pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    setTimeout(() => (el.style.opacity = "0"), 3500);
  }

  function norm(s) {
    return String(s || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
  }

  function coletarAPsDaPagina() {
    const aps = [];
    const rows = document.querySelectorAll("tr.tbl-row");

    for (const tr of rows) {
      const tds = tr.querySelectorAll("td");
      // 0 = checkbox | 1 = Nº AP (conforme HTML)
      if (!tds || tds.length < 2) continue;

      const ap = norm(tds[1].textContent);
      if (AP_RX.test(ap)) aps.push(ap);
    }

    return [...new Set(aps)];
  }

  function enviarParaPython(aps) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: ENDPOINT,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify({ aps }),
        onload: (r) => {
          try {
            resolve(JSON.parse(r.responseText || "{}"));
          } catch {
            resolve({});
          }
        },
        onerror: () => resolve({}),
      });
    });
  }

  async function executar() {
    if (!urlValida()) return;

    const rows = document.querySelectorAll("tr.tbl-row");
    const aps = coletarAPsDaPagina();

    console.debug("[TM-AP] scan", { href: canonicalHref(), rows: rows.length, qtd: aps.length });

    if (!aps.length) return;

    console.debug("[TM-AP] APs capturadas:", aps);

    const resp = await enviarParaPython(aps);

    // log para diagnosticar o "captura mas não grava"
    console.debug("[TM-AP] resp server:", resp);

    const added = Number(resp?.added || 0);
    if (added > 0) toast(`✅ ${added} AP(s) gravada(s) em autorizacao.csv`);
  }

  function agendar() {
    if (!urlValida()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(executar, 400);
  }

  agendar();
  new MutationObserver(agendar).observe(document.documentElement, { childList: true, subtree: true });

  (function interceptHistory() {
    const push = history.pushState;
    const replace = history.replaceState;

    history.pushState = function () {
      push.apply(this, arguments);
      window.dispatchEvent(new Event("tm:urlchange"));
    };
    history.replaceState = function () {
      replace.apply(this, arguments);
      window.dispatchEvent(new Event("tm:urlchange"));
    };

    window.addEventListener("popstate", () => window.dispatchEvent(new Event("tm:urlchange")));
    window.addEventListener("tm:urlchange", agendar);
  })();
})();
