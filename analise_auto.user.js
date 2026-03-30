// ==UserScript==
// @name         Análise Automática
// @namespace    http://tampermonkey.net/
// @author       Erik Higino
// @version      4.0
// @description  Fluxo automático de análise de AP. Detecta automaticamente o ano (2025/2026) e ajusta URLs. Máquina de estados com delays de 5s em cada etapa.
// @match        https://ofcweb.inss.gov.br/View/Registrar_Analise_Ap_OFC.php*
// @match        https://ofcweb.inss.gov.br/View/*
// @grant        none
// @run-at       document-start
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/analise_auto.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/analise_auto.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ======================= CONFIG =======================
  const LISTA_URL_PREFIX = "https://ofcweb.inss.gov.br/View/Registrar_Analise_Ap_OFC.php";
  const STORAGE_ACTIVE   = "ofc_auto_analise_active";
  const STORAGE_ANO      = "ofc_auto_analise_ano";
  const DEFAULT_RESP     = "1563857";
  const DELAY_MS         = 5000; // delay padrão entre cada etapa

  // Chaves de sessionStorage para a máquina de estados
  const SS = {
    STEP:     "ofc_auto_analise_step",
    TS:       "ofc_auto_analise_ts",
    LAST_IDAP:"ofc_auto_analise_last_idap",
  };

  // ======================= ANO =======================
  function getAnoSelecionado() {
    const select = document.querySelector("#lstExercicio");
    if (!select) return null;
    const opcao = select.querySelector("option[selected]");
    if (opcao) return parseInt(opcao.value, 10);
    return select.value ? parseInt(select.value, 10) : null;
  }

  function getAnoAtivo() {
    let ano = getAnoSelecionado();
    if (!ano) {
      const stored = localStorage.getItem(STORAGE_ANO);
      ano = stored ? parseInt(stored, 10) : null;
    }
    if (!ano || (ano !== 2025 && ano !== 2026)) ano = 2026;
    localStorage.setItem(STORAGE_ANO, String(ano));
    return ano;
  }

  // ======================= ATIVAR / DESATIVAR =======================
  function isActive() { return localStorage.getItem(STORAGE_ACTIVE) === "1"; }
  function setActive(v) { localStorage.setItem(STORAGE_ACTIVE, v ? "1" : "0"); }

  // Hash shortcuts (mantidos da versão original)
  if (location.hash.includes("ofcAutoAna=2")) setActive(true);
  if (location.hash.includes("ofcAutoAna=3")) setActive(false);

  // ======================= MÁQUINA DE ESTADOS =======================
  function getStep() { return sessionStorage.getItem(SS.STEP) || ""; }
  function setStep(s) { sessionStorage.setItem(SS.STEP, s); }
  function clearStep() {
    sessionStorage.removeItem(SS.STEP);
    sessionStorage.removeItem(SS.TS);
  }
  function setTS(ms) { sessionStorage.setItem(SS.TS, String(ms)); }
  function getTS()   { return parseInt(sessionStorage.getItem(SS.TS) || "0", 10); }

  // Verifica se o delay de 5s já passou desde o último setTS()
  function delayOk() {
    const elapsed = Date.now() - getTS();
    if (elapsed < DELAY_MS) {
      const restante = Math.ceil((DELAY_MS - elapsed) / 1000);
      toast(`⏳ Aguardando ${restante}s…`, 1200);
      return false;
    }
    return true;
  }

  // ======================= URLS =======================
  function buildListaUrl() {
    const ano = getAnoAtivo();
    const tableName = `tb_ap${ano}`;
    try {
      const u = new URL(location.href);
      const filter = u.searchParams.get("filter") || "";
      const mResp  = filter.match(/resp_analise:(\d+)/i);
      const resp   = (mResp && mResp[1]) ? mResp[1] : DEFAULT_RESP;
      return `${LISTA_URL_PREFIX}?&porpagina=10000&order=id_ap:DESC&filter=${tableName}.resp_analise:${resp}&ultimo_evento=`;
    } catch {
      return `${LISTA_URL_PREFIX}?&porpagina=10000&order=id_ap:DESC&filter=${tableName}.resp_analise:${DEFAULT_RESP}&ultimo_evento=`;
    }
  }

  function buildDhUrl(idap) {
    const ap = String(idap || "").trim();
    if (!ap) return "";
    return `https://ofcweb.inss.gov.br/View/Form_AP_DH_Geral.php?idap=${encodeURIComponent(ap)}`;
  }

  // ======================= TOAST =======================
  function ensureToastHost() {
    if (window.__ofcToastHost) return window.__ofcToastHost;
    const host = document.createElement("div");
    host.id = "ofc-auto-toasts";
    host.style.cssText = [
      "position:fixed", "top:12px", "right:12px",
      "z-index:2147483647", "display:flex", "flex-direction:column",
      "gap:8px", "max-width:360px", "pointer-events:none"
    ].join(";");
    (document.body || document.documentElement).appendChild(host);
    window.__ofcToastHost = host;
    return host;
  }

  function toast(msg, ms = 2200) {
    try {
      const host = ensureToastHost();
      const el = document.createElement("div");
      el.textContent = String(msg || "");
      el.style.cssText = [
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        "font-size:12px", "line-height:1.4", "padding:10px 14px",
        "border-radius:10px", "background:rgba(1,93,166,0.95)", "color:#fff",
        "box-shadow:0 8px 20px rgba(0,0,0,0.2)",
        "border:1px solid rgba(255,255,255,0.15)",
        "pointer-events:none", "backdrop-filter:blur(8px)"
      ].join(";");
      host.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch {} }, Math.max(800, ms));
    } catch {}
  }

  // ======================= TOGGLE UI =======================
  function ensureToggle() {
    if (window.__ofcAutoToggle) return;

    const wrap = document.createElement("div");
    wrap.id = "ofc-auto-toggle";
    wrap.style.cssText = [
      "position:fixed", "bottom:16px", "right:16px",
      "z-index:2147483647",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "user-select:none"
    ].join(";");

    const pill = document.createElement("button");
    pill.type = "button";
    pill.style.cssText = [
      "display:flex", "align-items:center", "gap:10px",
      "padding:11px 15px", "border-radius:999px",
      "border:1px solid rgba(0,0,0,0.15)",
      "box-shadow:0 8px 20px rgba(0,0,0,0.15)",
      "cursor:pointer", "background:#fff", "color:#1a1a1a",
      "transition:all 0.2s ease", "pointer-events:auto"
    ].join(";");

    const dot = document.createElement("span");
    dot.style.cssText = [
      "width:10px", "height:10px", "border-radius:50%",
      "display:inline-block", "transition:all 0.2s ease"
    ].join(";");

    const label = document.createElement("span");
    label.style.cssText = "font-size:13px;font-weight:600;";

    const hint = document.createElement("span");
    hint.style.cssText = "font-size:11px;opacity:0.65;font-weight:500;";

    pill.appendChild(dot);
    pill.appendChild(label);
    pill.appendChild(hint);
    wrap.appendChild(pill);

    function paint() {
      const on  = isActive();
      const ano = getAnoAtivo();
      dot.style.background  = on ? "#10b981" : "#9ca3af";
      dot.style.boxShadow   = on ? "0 0 0 3px rgba(16,185,129,0.2)" : "0 0 0 3px rgba(0,0,0,0.05)";
      label.textContent     = `AutoAnálise: ${on ? "ON" : "OFF"}`;
      hint.textContent      = String(ano);
      pill.style.borderColor = on ? "rgba(16,185,129,0.3)" : "rgba(0,0,0,0.15)";
      pill.style.background  = on ? "rgba(240,253,244,1)" : "#fff";
    }

    pill.addEventListener("mouseenter", () => {
      pill.style.transform  = "translateY(-2px)";
      pill.style.boxShadow  = "0 12px 24px rgba(0,0,0,0.18)";
    });
    pill.addEventListener("mouseleave", () => {
      pill.style.transform  = "translateY(0)";
      pill.style.boxShadow  = "0 8px 20px rgba(0,0,0,0.15)";
    });

    pill.addEventListener("click", () => {
      const next = !isActive();
      setActive(next);
      paint();
      const ano = getAnoAtivo();
      if (next) {
        clearStep();
        toast(`🟢 AutoAnálise LIGADA (${ano})`, 2000);
      } else {
        clearStep();
        toast("⚫ AutoAnálise DESLIGADA", 2000);
      }
    });

    const mount = () => {
      try {
        const target = document.body || document.documentElement;
        if (!target) return false;
        target.appendChild(wrap);
        window.__ofcAutoToggle = true;
        paint();
        return true;
      } catch { return false; }
    };

    if (!mount()) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", mount, { once: true });
      }
      window.addEventListener("load", () => { if (!window.__ofcAutoToggle) mount(); }, { once: true });
      setTimeout(() => { if (!window.__ofcAutoToggle) mount(); }, 500);
      setTimeout(() => { if (!window.__ofcAutoToggle) mount(); }, 1500);
    }

    // Atualiza ano no toggle quando o select mudar
    const setupObserver = () => {
      const select = document.querySelector("#lstExercicio");
      if (select) {
        new MutationObserver(paint).observe(select, { attributes: true, childList: true, subtree: true });
      } else {
        setTimeout(setupObserver, 1000);
      }
    };
    setTimeout(setupObserver, 100);

    window.addEventListener("DOMContentLoaded", paint, { once: true });
  }

  ensureToggle();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureToggle);
  }
  window.addEventListener("load", ensureToggle);

  // Toast inicial de estado
  setTimeout(() => {
    const ano = getAnoAtivo();
    toast(isActive() ? `✅ AutoAnálise ${ano}: ATIVA` : `⚫ AutoAnálise ${ano}: DESLIGADA (clique no toggle)`, 2500);
  }, 500);

  // ======================= HOOK confirm() =======================
  // Injeta no contexto da página (não no sandbox do userscript) para
  // interceptar o confirm nativo disparado pelo site.
  (function injectHooks() {
    const code = `
      (function(){
        const STORAGE_ACTIVE = ${JSON.stringify(STORAGE_ACTIVE)};
        function isActive(){
          try { return localStorage.getItem(STORAGE_ACTIVE) === "1"; } catch { return false; }
        }
        if (!window.__ofc_confirm_orig) {
          window.__ofc_confirm_orig = window.confirm;
        }
        window.confirm = function(msg){
          try {
            if (isActive() && /Confirma assinatura da análise\\?/i.test(String(msg || ""))) return true;
          } catch {}
          return window.__ofc_confirm_orig.call(window, msg);
        };
      })();
    `;
    try {
      const s = document.createElement("script");
      s.textContent = code;
      (document.documentElement || document.head).appendChild(s);
      s.remove();
    } catch {}
  })();

  // ======================= TAB-NUDGE =======================
  function tabNudgeBestEffort() {
    try {
      const w = window.open("about:blank", "_blank", "noopener,noreferrer,width=220,height=140");
      if (!w) return false;
      try { w.focus(); } catch {}
      setTimeout(() => { try { w.close(); } catch {} }, 350);
      setTimeout(() => { try { window.focus(); } catch {} }, 700);
      return true;
    } catch { return false; }
  }

  // ======================= UTILITÁRIOS =======================
  function robustClick(el) {
    if (!el) return false;
    try { el.click(); return true; } catch {}
    try {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    } catch {}
    const oc = el.getAttribute && el.getAttribute("onclick");
    if (oc) { try { eval(oc); return true; } catch {} }
    return false;
  }

  function normalizeUrl(u) { return (u || "").split("#")[0]; }

  // ======================= FINDERS =======================
  function findPrimeiroAnalisar() {
    const tbody = document.querySelector("table.tbl tbody");
    if (!tbody) return null;
    const firstRow = tbody.querySelector("tr");
    if (!firstRow) return null;
    const img = Array.from(firstRow.querySelectorAll("td.tbl-controls img"))
      .find(i => (i.getAttribute("src") || "").includes("botao_analisar.png"));
    if (!img) return null;
    return img.closest("a[onclick]") || img.closest("[onclick]") || img;
  }

  function findBtAssinarImg() {
    return document.querySelector("#bt_assinar") ||
           document.querySelector('img[name="bt_assinar"]') ||
           null;
  }

  function findBtnCarregarLiquidacao() {
    // Tenta IDs diretos
    let btn = document.querySelector("#bt_submit_analise_liq") ||
              document.querySelector("input[name='bt_submit_analise_liq']");
    if (btn) return btn;

    // Procura em diálogos
    for (const container of [
      document.querySelector("#dialogAssinar"),
      Array.from(document.querySelectorAll(".ui-dialog")).pop()
    ]) {
      if (!container) continue;
      btn = container.querySelector("#bt_submit_analise_liq") ||
            container.querySelector("input[name='bt_submit_analise_liq']") ||
            Array.from(container.querySelectorAll("input[type='button'],button"))
              .find(b => /Carregar\s+Liquida[cç][aã]o/i.test(b.value || b.textContent || ""));
      if (btn) return btn;
    }

    // Busca geral como último recurso
    return Array.from(document.querySelectorAll("input[type='button'],button"))
      .find(b => /Carregar\s+Liquida[cç][aã]o/i.test(b.value || b.textContent || "")) || null;
  }

  function findSalvarDh() {
    return Array.from(document.querySelectorAll("input[type='button'],button"))
      .find(b => (b.value || b.textContent || "").trim() === "Salvar DH no OFCWeb") || null;
  }

  function findForm1() {
    return document.querySelector("#form1") || document.forms.form1 || null;
  }

  function findTxtObservacao() {
    return document.querySelector("#txtObservacao") || null;
  }

  function findCampoAcao() {
    return document.querySelector("#acao") || null;
  }

  // ======================= FETCH POST =======================
  async function postAssinarELiquidarViaFetch(idap) {
    const form = findForm1();
    const acao = findCampoAcao();
    if (!form || !acao) return { ok: false, reason: "form/acao ausente" };

    const dhUrl = buildDhUrl(idap);
    if (!dhUrl) return { ok: false, reason: "idap indisponível" };

    acao.value = "assinareliquidar";

    const obsEl  = findTxtObservacao();
    const obsVal = obsEl ? (obsEl.value || "") : "";
    if (!form.querySelector('textarea[name="txtObservacao"], input[name="txtObservacao"]')) {
      const hidden = document.createElement("textarea");
      hidden.name  = "txtObservacao";
      hidden.style.display = "none";
      hidden.value = obsVal;
      form.appendChild(hidden);
    }

    const action = (form.getAttribute("action") || "").trim() || location.href;

    try {
      toast("✍️ Enviando: Assinar + Carregar Liquidação…", 2400);
      const fd = new FormData(form);
      const r  = await fetch(action, {
        method: "POST", body: fd,
        credentials: "include", cache: "no-store", redirect: "follow"
      });
      if (!r || (r.status && r.status >= 400)) {
        return { ok: false, reason: "status_http_" + (r ? r.status : "sem_resposta") };
      }
      toast("✅ POST OK. Preparando redirecionamento para DH…", 2200);
      return { ok: true, dhUrl };
    } catch (e) {
      return { ok: false, reason: (e && e.message) ? e.message : String(e) };
    }
  }

  function submitFallback() {
    const form = findForm1();
    const acao = findCampoAcao();
    if (!form || !acao) return false;
    acao.value = "assinareliquidar";
    const obsEl  = findTxtObservacao();
    const hidden = document.createElement("textarea");
    hidden.name  = "txtObservacao";
    hidden.style.display = "none";
    hidden.value = obsEl ? (obsEl.value || "") : "";
    form.appendChild(hidden);
    try {
      toast("⚠️ Usando fallback submit()…", 3000);
      HTMLFormElement.prototype.submit.call(form);
      return true;
    } catch { return false; }
  }

  // ======================= IDENTIFICADORES DE PÁGINA =======================
  function isListaPage() {
    return normalizeUrl(location.href).startsWith(LISTA_URL_PREFIX);
  }

  function isDetalheAnaliseePage() {
    return !!(document.querySelector("#bt_assinar") || document.querySelector("#dialogAssinar"));
  }

  function isSalvarDhPage() {
    return !!findSalvarDh();
  }

  function isDhFormPage() {
    const h = normalizeUrl(location.href);
    return h.includes("/View/Form_AP_DH_");
  }

  // ======================= RUNNER PRINCIPAL (tick de 900ms) =======================
  // Mesma arquitetura do script de Liquidação:
  // um setInterval de 900ms que verifica o estado atual e avança
  // apenas quando o delay de 5s foi cumprido.

  let ticking = false;

  function tick() {
    if (ticking) return;
    ticking = true;
    try {
      run();
    } finally {
      ticking = false;
    }
  }

  function run() {
    if (!isActive()) return;

    // ------ PÁGINA: LISTA ------
    if (isListaPage()) {
      const step = getStep();

      // Estado inicial ou retorno: procura o botão Analisar e clica
      if (step === "") {
        const btn = findPrimeiroAnalisar();
        if (!btn) {
          toast("⛔ Não há mais AP para analisar. Desativando.", 3200);
          setActive(false);
          clearStep();
          return;
        }
        setStep("analisar_clicked");
        setTS(Date.now());
        toast("🖱️ Clicando em 'Analisar' (primeira linha)…", 2000);
        robustClick(btn);
        return;
      }

      // Aguarda 5s após o clique antes de fazer qualquer outra coisa
      // (a página já terá navegado; este branch só cobre o caso de a
      //  navegação demorar e o interval disparar na mesma página)
      if (step === "analisar_clicked") {
        if (!delayOk()) return;
        // Se após 5s ainda estiver na lista, tenta de novo
        setStep("");
        return;
      }

      // Retorno pós-DH: após 5s na lista, limpa estado e reinicia
      if (step === "voltou_lista") {
        if (!delayOk()) return;
        setStep("");
        toast("🔄 Reiniciando ciclo…", 1600);
        return;
      }

      return;
    }

    // ------ PÁGINA: DETALHE DE ANÁLISE (bt_assinar / dialogAssinar) ------
    if (isDetalheAnaliseePage()) {
      // Captura idap assim que estiver disponível
      const idapEl = document.querySelector('input[name="idap"]');
      const idap   = idapEl ? String(idapEl.value || "").trim() : "";
      if (idap && sessionStorage.getItem(SS.LAST_IDAP) !== idap) {
        sessionStorage.setItem(SS.LAST_IDAP, idap);
      }

      const step = getStep();

      // Etapa 1: clicou em Analisar e chegou aqui → abre o diálogo de assinatura
      if (step === "analisar_clicked" || step === "") {
        if (!delayOk()) return; // espera 5s após o clique na lista
        const btn = findBtAssinarImg();
        if (!btn) { toast("⏳ Aguardando botão 'Assinar'…", 1500); return; }
        setStep("dialog_aberto");
        setTS(Date.now());
        toast("🧾 Abrindo diálogo de assinatura…", 2000);
        robustClick(btn);
        return;
      }

      // Etapa 2: diálogo aberto → espera 5s e clica em Carregar Liquidação
      if (step === "dialog_aberto") {
        if (!delayOk()) return;
        const btnLiq = findBtnCarregarLiquidacao();
        if (!btnLiq) { toast("⏳ Aguardando 'Carregar Liquidação'…", 1500); return; }
        setStep("liq_clicado");
        setTS(Date.now());
        toast("📋 Clicando em 'Carregar Liquidação'…", 2000);
        robustClick(btnLiq);
        return;
      }

      // Etapa 3: clicou em Carregar Liquidação → espera 5s e faz o POST
      if (step === "liq_clicado") {
        if (!delayOk()) return;
        const idapSalvo = sessionStorage.getItem(SS.LAST_IDAP) || idap;
        setStep("post_enviado");
        setTS(Date.now());
        // Execução do fetch é assíncrona mas o controle de estado é síncrono
        postAssinarELiquidarViaFetch(idapSalvo).then((res) => {
          if (!res.ok) {
            toast(`⚠️ Fetch falhou (${res.reason}). Usando fallback…`, 3500);
            submitFallback();
            // Mesmo no fallback, aguarda e tenta redirecionar
          }
          // Tab-nudge após 5s do POST
          setTimeout(() => {
            const ok = tabNudgeBestEffort();
            toast(ok ? "🧪 Tab-nudge disparado." : "🧪 Tab-nudge bloqueado.", 2000);
          }, DELAY_MS);
          // Redireciona para o formulário DH após 5s adicionais
          setTimeout(() => {
            const dhUrl = buildDhUrl(idapSalvo);
            if (dhUrl) {
              toast("➡️ Indo para o formulário DH…", 2000);
              try { location.replace(dhUrl); } catch { location.href = dhUrl; }
            } else {
              // Sem idap: volta para lista
              toast("⚠️ idap não encontrado. Voltando para a lista…", 2500);
              setStep("voltou_lista");
              setTS(Date.now());
              try { location.replace(buildListaUrl()); } catch { location.href = buildListaUrl(); }
            }
          }, DELAY_MS * 2); // 10s total: 5s nudge + 5s redirect
        }).catch(() => {
          toast("⚠️ Erro inesperado. Voltando à etapa anterior…", 3000);
          setStep("dialog_aberto");
          setTS(Date.now() - DELAY_MS); // força retry imediato
        });
        return;
      }

      // Se chegou aqui em outro step, aguarda
      toast("⏳ Aguardando…", 1200);
      return;
    }

    // ------ PÁGINA: FORMULÁRIO DH (Form_AP_DH_Geral) ------
    // O script OFCWeb Unificado cuida desta página.
    // A Análise Automática só precisa aguardar 5s e voltar para a lista.
    if (isDhFormPage()) {
      const step = getStep();

      if (step === "post_enviado" || step === "") {
        if (step === "") {
          // Chegou na página DH → marca o timestamp
          setStep("post_enviado");
          setTS(Date.now());
          toast("📄 Página DH carregada. Aguardando 5s…", 2000);
          return;
        }
        if (!delayOk()) return;
        // Tenta clicar em Salvar DH se existir, senão volta direto
        const btnSalvar = findSalvarDh();
        if (btnSalvar) {
          setStep("salvar_clicado");
          setTS(Date.now());
          toast("💾 Clicando em 'Salvar DH no OFCWeb'…", 2000);
          robustClick(btnSalvar);
          return;
        }
        // Sem botão Salvar: volta para lista direto
        setStep("voltou_lista");
        setTS(Date.now());
        toast("↩️ Voltando para a lista…", 2000);
        try { location.replace(buildListaUrl()); } catch { location.href = buildListaUrl(); }
        return;
      }

      if (step === "salvar_clicado") {
        if (!delayOk()) return;
        setStep("voltou_lista");
        setTS(Date.now());
        toast("↩️ Voltando para a lista…", 2000);
        try { location.replace(buildListaUrl()); } catch { location.href = buildListaUrl(); }
        return;
      }

      return;
    }

    // ------ PÁGINA: SALVAR DH (fallback — caso chegue aqui fora do Form_AP_DH_) ------
    if (isSalvarDhPage()) {
      const step = getStep();
      if (step !== "salvar_clicado") {
        setStep("salvar_clicado");
        setTS(Date.now());
        toast("💾 Clicando em 'Salvar DH no OFCWeb'…", 2000);
        robustClick(findSalvarDh());
        return;
      }
      if (!delayOk()) return;
      setStep("voltou_lista");
      setTS(Date.now());
      toast("↩️ Voltando para a lista…", 2000);
      try { location.replace(buildListaUrl()); } catch { location.href = buildListaUrl(); }
      return;
    }
  }

  // ======================= INICIALIZAÇÃO =======================
  function startLoop() {
    console.log("[AutoAnálise] Script carregado (v4.0 – máquina de estados 5s)");

    // Garante toggle e dispara primeiro tick após DOM estar pronto
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        ensureToggle();
        setTimeout(tick, 1000);
      });
    } else {
      ensureToggle();
      setTimeout(tick, 1000);
    }

    window.addEventListener("load", () => {
      ensureToggle();
    });

    // Loop de 900ms — idêntico ao da Liquidação
    setInterval(() => {
      try { ensureToggle(); } catch {}
      if (!isActive()) return;
      tick();
    }, 900);
  }

  startLoop();

})();
