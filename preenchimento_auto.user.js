// ==UserScript==
// @name         Preenchimento Automático
// @namespace    http://tampermonkey.net/
// @autor        Erik Higino
// @version      1.1
// @description  Unifica: Data Atual + Agência + Vencimento/CIT (CSV) + Consolidação de radios + DEA (RPV)
// @match        https://ofcweb.inss.gov.br/View/Form_AP_DH_Geral.php*
// @grant        GM_getResourceText
// @grant        GM_xmlhttpRequest
// @resource     AUTORIZACAO file:///Users/erikhigino/Documents/ofc/data/autorizacao.csv
// @run-at       document-start
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/preenchimento_auto.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/preenchimento_auto.user.js
// ==/UserScript==

(function () {
  "use strict";

  /* ============================================================
     0) PATCHES GLOBAIS (aplicados o mais cedo possível)
     ============================================================ */

  // Corrige bug do site: alguns onclick chamam self() como função
  if (typeof window.self !== "function") {
    window.self = function () { /* no-op */ };
  }

  // Intercepta alert de DEA para não travar o usuário com popup
  const _alert = window.alert;
  window.alert = function (msg) {
    if (typeof msg === "string" && msg.includes("Despesa de Exercício Anterior (DEA)")) {
      console.log("[OFCWeb] ALERT DEA ignorado:", msg);
      return;
    }
    return _alert.call(window, msg);
  };

  /* ============================================================
     UTILITÁRIOS
     ============================================================ */

  function apenasDigitos(s) {
    return (s || "").toString().replace(/\D+/g, "");
  }

  function setNativeValue(el, value) {
    if (!el) return;
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, String(value ?? ""));
    else el.value = String(value ?? "");

    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur",   { bubbles: true }));
  }

  function isDialogVisivel(id) {
    const el = document.querySelector(id);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  /* ============================================================
     1) DATA ATUAL (#dt_pagamento)
     ============================================================ */

  function hoje_ddmmyyyy() {
    const d = new Date();
    return [
      String(d.getDate()).padStart(2, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getFullYear()),
    ].join("/");
  }

  function preencherDataAtual() {
    const el = document.querySelector("#dt_pagamento");
    if (!el) return;
    const valor = hoje_ddmmyyyy();
    if ((el.value || "").trim() === valor) return;
    setNativeValue(el, valor);
    console.debug("[OFCWeb] dt_pagamento preenchido:", valor);
  }

  /* ============================================================
     2) AGÊNCIA (banco 104 → 2890 | banco 001 → 2234)
     ============================================================ */

  function preencherAgencia() {
    const bancoEl = document.querySelector('#ds_cod_banco, input[name="ds_cod_banco"]');
    const agEl    = document.querySelector('#ds_agencia,   input[name="ds_agencia"]');
    if (!bancoEl || !agEl) return;

    const banco   = apenasDigitos(bancoEl.value);
    const agAtual = apenasDigitos(agEl.value);
    if (agAtual !== "") return;                       // só preenche se vazio

    if (banco === "104") {
      setNativeValue(agEl, "2890");
      console.debug("[OFCWeb] Agência p/ banco 104 → 2890");
    } else if (banco === "001") {
      setNativeValue(agEl, "2234");
      console.debug("[OFCWeb] Agência p/ banco 001 → 2234");
    }
  }

  function bindAgenciaListeners() {
    const bancoEl = document.querySelector('#ds_cod_banco, input[name="ds_cod_banco"]');
    if (!bancoEl || bancoEl.dataset.tmAgenciaBound === "1") return;
    bancoEl.dataset.tmAgenciaBound = "1";
    bancoEl.addEventListener("input",  () => preencherAgencia(), true);
    bancoEl.addEventListener("change", () => preencherAgencia(), true);
  }

    function carregarCSVAutorizacao(callback) {
    // 1) tenta @resource primeiro (mantém seu comportamento atual)
    try {
      const txt = GM_getResourceText("AUTORIZACAO");
      if (txt && txt.trim()) {
        callback(txt);
        return;
      }
    } catch (e) {
      console.debug("[OFCWeb] GM_getResourceText falhou:", e);
    }

    // 2) fallback: tenta ler o mesmo file:/// via GM_xmlhttpRequest
    try {
      GM_xmlhttpRequest({
        method: "GET",
        url: "file:///Users/erikhigino/Documents/ofc/data/autorizacao.csv",
        onload: function (resp) {
          const txt = resp && typeof resp.responseText === "string" ? resp.responseText : "";
          if (txt && txt.trim()) {
            callback(txt);
          } else {
            console.debug("[OFCWeb] CSV vazio via GM_xmlhttpRequest(file://).");
          }
        },
        onerror: function (err) {
          console.debug("[OFCWeb] Falha lendo CSV via GM_xmlhttpRequest(file://):", err);
        }
      });
    } catch (e) {
      console.debug("[OFCWeb] GM_xmlhttpRequest indisponível para file://:", e);
    }
  }
  
  /* ============================================================
     3) VENCIMENTO + CIT (CSV)
     ============================================================ */

  function validarDataDDMMYYYY(s) {
    return /^\d{2}\/\d{2}\/\d{4}$/.test((s || "").trim());
  }

  function ddmmyyyyToTime(s) {
    if (!validarDataDDMMYYYY(s)) return NaN;
    const [dd, mm, yyyy] = s.split("/").map(Number);
    return new Date(yyyy, mm - 1, dd).getTime();
  }

  function parseCSV(texto) {
    const mapa = new Map();
    (texto || "")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("#"))
      .forEach(linha => {
        const sep   = linha.includes(";") ? ";" : ",";
        const partes = linha.split(sep).map(p => p.trim());
        if (partes.length < 3) return;
        const ap = apenasDigitos(partes[0]);
        if (ap) mapa.set(ap, { venc: partes[1], cit: partes[2] });
      });
    return mapa;
  }

  function obterNumeroAP() {
    for (const td of document.querySelectorAll("td")) {
      const strong = td.querySelector("span > strong");
      if (strong && (strong.textContent || "").trim() === "Nº da AP") {
        const div = td.querySelector("div");
        const ap  = apenasDigitos(div ? div.textContent : "");
        if (ap) return ap;
      }
    }
    return "";
  }

  function preencherVencimentoECIT() {
    const ap = obterNumeroAP();
    if (!ap) return;

    carregarCSVAutorizacao(function (csv) {
      if (!csv || !csv.trim()) {
        console.debug("[OFCWeb] CSV vazio/não carregado.");
        return;
      }

      const dados = parseCSV(csv).get(ap);
      if (!dados) return;

    const vencCSV = (dados.venc || "").trim();
    const citCSV  = (dados.cit  || "").trim();

    // Vencimento: substitui se página está vazia OU mais antiga que o CSV
    const dtVencEl = document.querySelector("#dt_vencimento");
    if (dtVencEl && validarDataDDMMYYYY(vencCSV)) {
      const vencPagina    = (dtVencEl.value || "").trim();
      const paginaVazia   = !vencPagina || vencPagina === "00/00/0000" || !validarDataDDMMYYYY(vencPagina);
      const tCSV          = ddmmyyyyToTime(vencCSV);
      const tPagina       = ddmmyyyyToTime(vencPagina);
      const paginaMaisAntiga = !paginaVazia && Number.isFinite(tPagina) && Number.isFinite(tCSV) && tPagina < tCSV;

      if (paginaVazia || paginaMaisAntiga) {
        setNativeValue(dtVencEl, vencCSV);
        console.debug("[OFCWeb] dt_vencimento ajustado pelo CSV:", vencCSV, "(antes:", vencPagina || "(vazio)", ")");
      }
    }

    // CIT: preenche apenas se estiver vazio (18 ou 25 dígitos)
    const citEl = document.querySelector("#ds_cit");
    if (citEl && (!citEl.value || citEl.value.trim() === "")) {
      const citDigits = apenasDigitos(citCSV);
      if (/^\d{18}$/.test(citDigits) || /^\d{25}$/.test(citDigits)) {
        setNativeValue(citEl, citDigits);
        citEl.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
        citEl.dispatchEvent(new Event("blur", { bubbles: true }));
        console.debug("[OFCWeb] ds_cit preenchido:", citDigits);
      }
    }
  }
    });
  }
  /* ============================================================
     4) CONSOLIDAÇÃO (radios + Continuar + Confirmar)
     ============================================================ */

  function executarConsolidacao(root = document) {
    // Guarda: se o diálogo de justificativa estiver aberto, não automatiza
    if (isDialogVisivel("#dialogJustificarIdBoleto")) {
      console.log("[OFCWeb] Diálogo de justificativa aberto → não automatizar cliques");
      return;
    }

    // Radio NÃO – Passivo anterior
    const radioNao = root.querySelector('input[type="radio"][name="rd_passivo"][value="N"]');
    if (radioNao && !radioNao.checked) {
      radioNao.checked = true;
      radioNao.dispatchEvent(new Event("click", { bubbles: true }));
      console.log("[OFCWeb] Radio 'NÃO' selecionado");
    }

    // Radio Consolidação – 5º nível
    const radioConsolidacao = root.querySelector('input[type="radio"][value="1"]');
    if (radioConsolidacao && !radioConsolidacao.checked) {
      radioConsolidacao.checked = true;
      radioConsolidacao.dispatchEvent(new Event("click", { bubbles: true }));
      console.log("[OFCWeb] Radio 'Consolidação' selecionado");
    }

    // Botão Continuar
    const btnContinuar = root.querySelector('input[type="button"][value="Continuar"]');
    if (btnContinuar && !btnContinuar.dataset.autoClicked) {
      btnContinuar.dataset.autoClicked = "true";
      console.log("[OFCWeb] Clicando em 'Continuar'");
      btnContinuar.click();
      return; // aguarda próxima tela
    }

    // Botão Confirmar – APENAS no diálogo de envio (#dialog)
    const dialogEnvio = root.querySelector("#dialog");
    if (dialogEnvio && isDialogVisivel("#dialog")) {
      const btnConfirmar = dialogEnvio.querySelector('input[type="button"][value="Confirmar"]');
      if (btnConfirmar && !btnConfirmar.dataset.autoClicked) {
        btnConfirmar.dataset.autoClicked = "true";
        console.log("[OFCWeb] Clicando em 'Confirmar' (#dialog – envio DH)");
        btnConfirmar.click();
      }
    }
  }

  /* ============================================================
     5) DEA (RPV) – marca NÃO e submete o form diretamente
     ============================================================ */

  function tentarExecutarDEA() {
    const form       = document.querySelector("form#form1, form[name='form1']");
    const idapEl     = document.querySelector("input#idap[name='idap']");
    const radioNaoDEA = document.querySelector('input[type="radio"][name="rd_dea"][value="N"]');

    // Só atua quando esta tela específica existe
    if (!form || !idapEl || !radioNaoDEA) return false;

    if (!radioNaoDEA.checked) {
      radioNaoDEA.click();
      radioNaoDEA.checked = true; // redundância intencional
      console.log("[OFCWeb] DEA marcado como NÃO");
    }

    if (form.dataset.autoSubmitted === "true") return true;

    const idap = String(idapEl.value || "").trim();
    if (!idap) return false;

    form.dataset.autoSubmitted = "true";
    form.setAttribute("action", `Form_AP_DH_Geral.php?idap=${encodeURIComponent(idap)}`);
    console.log("[OFCWeb] Submetendo form DEA para:", form.getAttribute("action"));
    form.submit();
    return true;
  }

  function loopDEA() {
    if (tentarExecutarDEA()) return;
    setTimeout(loopDEA, 200);
  }

  /* ============================================================
     ORQUESTRAÇÃO PRINCIPAL
     ============================================================ */

  // DEA começa assim que o DOM estiver disponível (precisa ser rápido)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loopDEA);
  } else {
    loopDEA();
  }

  // Tick unificado para as demais funções (com debounce simples)
  let agendado = false;
  function tick() {
    if (agendado) return;
    agendado = true;
    setTimeout(() => {
      agendado = false;
      preencherDataAtual();
      bindAgenciaListeners();
      preencherAgencia();
      preencherVencimentoECIT();
      executarConsolidacao();
    }, 120);
  }

  // Disparos escalonados para páginas que carregam elementos tardiamente
  tick();
  setTimeout(tick, 400);
  setTimeout(tick, 1200);
  setTimeout(tick, 2500);
  setTimeout(tick, 4000);

  new MutationObserver(() => tick())
    .observe(document.documentElement, { childList: true, subtree: true });

})();
