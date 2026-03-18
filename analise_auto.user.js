// ==UserScript==
// @name         Análise Automática
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Fluxo automático de análise de AP. Detecta automaticamente o ano (2025/2026) e ajusta URLs. Intercepta confirm, evita modal via fetch, inclui tab-nudge e toggle UI.
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
  const STORAGE_ACTIVE = "ofc_auto_analise_active";
  const STORAGE_ANO = "ofc_auto_analise_ano";
  const SS_STEP = "ofc_auto_analise_step";
  const SS_LAST_IDAP = "ofc_auto_analise_last_idap";
  const DEFAULT_RESP = "1563857";

  // ======================= ANO (DETECÇÃO AUTOMÁTICA) =======================
  function getAnoSelecionado() {
    const select = document.querySelector("#lstExercicio");
    if (!select) return null;

    const opcaoSelecionada = select.querySelector("option[selected]");
    if (opcaoSelecionada) {
      return parseInt(opcaoSelecionada.value, 10);
    }

    return select.value ? parseInt(select.value, 10) : null;
  }

  function getAnoAtivo() {
    // Tenta pegar da página primeiro
    let ano = getAnoSelecionado();

    // Se não achou, tenta do storage
    if (!ano) {
      const stored = localStorage.getItem(STORAGE_ANO);
      ano = stored ? parseInt(stored, 10) : null;
    }

    // Se ainda não tem, usa 2026 como padrão
    if (!ano || (ano !== 2025 && ano !== 2026)) {
      ano = 2026;
    }

    // Salva para usar em outras páginas
    localStorage.setItem(STORAGE_ANO, String(ano));
    return ano;
  }

  // ======================= ATIVAR / DESATIVAR =======================
  function isActive() { return localStorage.getItem(STORAGE_ACTIVE) === "1"; }
  function setActive(v) { localStorage.setItem(STORAGE_ACTIVE, v ? "1" : "0"); }

  // Hash shortcuts
  if (location.hash.includes("ofcAutoAna=2")) setActive(true);
  if (location.hash.includes("ofcAutoAna=3")) setActive(false);

  // ======================= TOASTS =======================
  function ensureToastHost() {
    if (window.__ofcToastHost) return window.__ofcToastHost;
    const host = document.createElement("div");
    host.id = "ofc-auto-toasts";
    host.style.cssText = [
      "position:fixed",
      "top:12px",
      "right:12px",
      "z-index:2147483647",
      "display:flex",
      "flex-direction:column",
      "gap:8px",
      "max-width:360px",
      "pointer-events:none"
    ].join(";");
    (document.documentElement || document.body).appendChild(host);
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
        "font-size:12px",
        "line-height:1.4",
        "padding:10px 14px",
        "border-radius:10px",
        "background:rgba(1,93,166,0.95)",
        "color:#fff",
        "box-shadow:0 8px 20px rgba(0,0,0,0.2)",
        "border:1px solid rgba(255,255,255,0.15)",
        "pointer-events:none",
        "backdrop-filter:blur(8px)"
      ].join(";");
      host.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch {} }, Math.max(800, ms));
    } catch {}
  }

  // ======================= TOGGLE UI =======================
  function ensureToggle() {
    if (window.__ofcAutoToggle) {
      console.log("[AutoAnálise] Toggle já existe");
      return;
    }

    console.log("[AutoAnálise] Criando toggle...");

    const wrap = document.createElement("div");
    wrap.id = "ofc-auto-toggle";
    wrap.style.cssText = [
      "position:fixed",
      "bottom:16px",
      "right:16px",
      "z-index:2147483647",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "user-select:none"
    ].join(";");

    const pill = document.createElement("button");
    pill.type = "button";
    pill.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:10px",
      "padding:11px 15px",
      "border-radius:999px",
      "border:1px solid rgba(0,0,0,0.15)",
      "box-shadow:0 8px 20px rgba(0,0,0,0.15)",
      "cursor:pointer",
      "background:#fff",
      "color:#1a1a1a",
      "transition:all 0.2s ease",
      "pointer-events:auto"
    ].join(";");

    const dot = document.createElement("span");
    dot.style.cssText = [
      "width:10px",
      "height:10px",
      "border-radius:50%",
      "display:inline-block",
      "transition:all 0.2s ease"
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
      const on = isActive();
      const ano = getAnoAtivo();

      dot.style.background = on ? "#10b981" : "#9ca3af";
      dot.style.boxShadow = on ? "0 0 0 3px rgba(16,185,129,0.2)" : "0 0 0 3px rgba(0,0,0,0.05)";
      label.textContent = `AutoAnálise: ${on ? "ON" : "OFF"}`;
      hint.textContent = String(ano);
      pill.style.borderColor = on ? "rgba(16,185,129,0.3)" : "rgba(0,0,0,0.15)";
      pill.style.background = on ? "rgba(240,253,244,1)" : "#fff";
    }

    pill.addEventListener("mouseenter", () => {
      pill.style.transform = "translateY(-2px)";
      pill.style.boxShadow = "0 12px 24px rgba(0,0,0,0.18)";
    });

    pill.addEventListener("mouseleave", () => {
      pill.style.transform = "translateY(0)";
      pill.style.boxShadow = "0 8px 20px rgba(0,0,0,0.15)";
    });

    pill.addEventListener("click", () => {
      const next = !isActive();
      setActive(next);
      paint();
      const ano = getAnoAtivo();
      toast(next ? `🟢 AutoAnálise LIGADA (${ano})` : "⚫ AutoAnálise DESLIGADA", 2000);
      if (next) setTimeout(() => { try { main(); } catch {} }, 250);
    });

    const mount = () => {
      try {
        const target = document.body || document.documentElement;
        if (target) {
          target.appendChild(wrap);
          window.__ofcAutoToggle = true;
          paint();
          console.log("[AutoAnálise] Toggle montado com sucesso");
        } else {
          console.warn("[AutoAnálise] Sem target para montar toggle ainda");
          return false;
        }
        return true;
      } catch (e) {
        console.error("[AutoAnálise] Erro ao montar toggle:", e);
        return false;
      }
    };

    // Múltiplas tentativas de montagem
    if (!mount()) {
      // Tenta quando DOM estiver pronto
      if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => {
          console.log("[AutoAnálise] Tentando montar toggle (DOMContentLoaded)");
          mount();
        }, { once: true });
      }

      // Tenta quando window carregar
      window.addEventListener("load", () => {
        if (!window.__ofcAutoToggle) {
          console.log("[AutoAnálise] Tentando montar toggle (window.load)");
          mount();
        }
      }, { once: true });

      // Tenta após timeout
      setTimeout(() => {
        if (!window.__ofcAutoToggle) {
          console.log("[AutoAnálise] Tentando montar toggle (timeout 500ms)");
          mount();
        }
      }, 500);
    }

    // Repaint quando DOM carregar
    window.addEventListener("DOMContentLoaded", paint, { once: true });

    // Observer para atualizar ano quando mudar
    const setupObserver = () => {
      const select = document.querySelector("#lstExercicio");
      if (select) {
        const obs = new MutationObserver(() => paint());
        obs.observe(select, {
          attributes: true,
          childList: true,
          subtree: true
        });
        console.log("[AutoAnálise] Observer configurado para #lstExercicio");
      } else {
        // Tenta novamente após 1s
        setTimeout(setupObserver, 1000);
      }
    };

    setTimeout(setupObserver, 100);
  }

  // Chama ensureToggle imediatamente e também em eventos
  ensureToggle();

  if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", ensureToggle);
  }

  window.addEventListener("load", ensureToggle);

  // Toast inicial baseado no estado
  setTimeout(() => {
    const ano = getAnoAtivo();
    if (!isActive()) {
      toast(`⚫ AutoAnálise ${ano}: DESLIGADA (clique no toggle)`, 2500);
    } else {
      toast(`✅ AutoAnálise ${ano}: ATIVA`, 1800);
    }
  }, 500);

  // ======================= URLS (DINÂMICAS POR ANO) =======================
  function buildListaUrl() {
    const ano = getAnoAtivo();
    const tableName = `tb_ap${ano}`;

    try {
      const u = new URL(location.href);
      const filter = u.searchParams.get("filter") || "";
      const mResp = filter.match(/resp_analise:(\d+)/i);
      const resp = (mResp && mResp[1]) ? mResp[1] : DEFAULT_RESP;
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

  // ======================= STEP CONTROL =======================
  function getStep() { return sessionStorage.getItem(SS_STEP) || ""; }
  function setStep(s) { sessionStorage.setItem(SS_STEP, s); }
  function clearStep() { sessionStorage.removeItem(SS_STEP); }

  // ======================= UTILITIES =======================
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

  function waitFor(findFn, { interval = 300, timeout = 20000 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const t = setInterval(() => {
        let el = null;
        try { el = findFn(); } catch {}
        if (el) { clearInterval(t); resolve(el); return; }
        if (Date.now() - start > timeout) { clearInterval(t); resolve(null); }
      }, interval);
    });
  }

  // ======================= HOOK confirm() =======================
  (function injectHooks() {
    const code = `
      (function(){
        const STORAGE_ACTIVE = ${JSON.stringify(STORAGE_ACTIVE)};
        function isActive(){
          try { return localStorage.getItem(STORAGE_ACTIVE)==="1"; }
          catch(e){ return false; }
        }

        if(!window.__ofc_confirm_orig) {
          window.__ofc_confirm_orig = window.confirm;
        }

        window.confirm = function(msg){
          try{
            const t = String(msg||"");
            if(isActive() && /Confirma assinatura da análise\\?/i.test(t)) {
              return true;
            }
          }catch(e){}
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
    } catch {
      return false;
    }
  }

  // ======================= FINDERS =======================
  function findPrimeiroAnalisar() {
    const table = document.querySelector("table.tbl");
    if (!table) return null;
    const tbody = table.querySelector("tbody");
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

  function findDialogAssinar() {
    return document.querySelector("#dialogAssinar") || null;
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

  function findSalvarDh() {
    const nodes = Array.from(document.querySelectorAll("input[type='button'], button"));
    return nodes.find(b => ((b.value || b.textContent || "").trim() === "Salvar DH no OFCWeb")) || null;
  }

  function findBtnConfirmarCarregarLiq() {
    // Tenta IDs diretos primeiro
    let btn = document.querySelector("#bt_submit_analise_liq") ||
              document.querySelector("input[name='bt_submit_analise_liq']");
    if (btn) return btn;

    // Procura no dialog
    const dlg = document.querySelector("#dialogAssinar");
    if (dlg) {
      btn = dlg.querySelector("#bt_submit_analise_liq") ||
            dlg.querySelector("input[name='bt_submit_analise_liq']") ||
            Array.from(dlg.querySelectorAll("input[type='button'],button")).find((b) => {
              const v = (b.value || b.textContent || "").trim();
              const t = (b.title || "").trim();
              return /Carregar\s+Liquida[cç][aã]o/i.test(v) || /Carregar\s+Liquida[cç][aã]o/i.test(t);
            });
      if (btn) return btn;
    }

    // Procura em UI dialogs
    const ui = Array.from(document.querySelectorAll(".ui-dialog")).pop();
    if (ui) {
      btn = ui.querySelector("#bt_submit_analise_liq") ||
            ui.querySelector("input[name='bt_submit_analise_liq']") ||
            Array.from(ui.querySelectorAll("input[type='button'],button")).find((b) => {
              const v = (b.value || b.textContent || "").trim();
              const t = (b.title || "").trim();
              return /Carregar\s+Liquida[cç][aã]o/i.test(v) || /Carregar\s+Liquida[cç][aã]o/i.test(t);
            });
      if (btn) return btn;
    }

    // Última tentativa: busca geral
    btn = Array.from(document.querySelectorAll("input[type='button'],button")).find((b) => {
      const v = (b.value || b.textContent || "").trim();
      const t = (b.title || "").trim();
      return /Carregar\s+Liquida[cç][aã]o/i.test(v) || /Carregar\s+Liquida[cç][aã]o/i.test(t);
    });

    return btn || null;
  }

  // ======================= FETCH POST + REDIRECT =======================
  async function postAssinarELiquidarViaFetch() {
    const form = findForm1();
    const acao = findCampoAcao();
    if (!form || !acao) return { ok: false, reason: "form/acao ausente" };

    const idapEl = document.querySelector('input[name="idap"]');
    const idapNow = (idapEl && idapEl.value) ? String(idapEl.value).trim() : "";
    const idap = idapNow || (sessionStorage.getItem(SS_LAST_IDAP) || "");
    const dhUrl = buildDhUrl(idap);

    if (!dhUrl) return { ok: false, reason: "idap indisponível" };

    acao.value = "assinareliquidar";

    const obsEl = findTxtObservacao();
    const obsVal = obsEl ? (obsEl.value || "") : "";
    let obsExisting = form.querySelector('textarea[name="txtObservacao"], input[name="txtObservacao"]');
    if (!obsExisting) {
      const hidden = document.createElement("textarea");
      hidden.name = "txtObservacao";
      hidden.style.display = "none";
      hidden.value = obsVal;
      form.appendChild(hidden);
    }

    const action = (form.getAttribute("action") || "").trim() || location.href;

    try {
      toast("✍️ Enviando via fetch: Assinar + Carregar Liquidação…", 2400);

      const fd = new FormData(form);
      const r = await fetch(action, {
        method: "POST",
        body: fd,
        credentials: "include",
        cache: "no-store",
        redirect: "follow"
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

  function submitAssinarELiquidarDireto_FallbackSubmit() {
    const form = findForm1();
    const acao = findCampoAcao();
    if (!form || !acao) return false;

    acao.value = "assinareliquidar";

    const obsEl = findTxtObservacao();
    const obsVal = obsEl ? (obsEl.value || "") : "";
    const hidden = document.createElement("textarea");
    hidden.name = "txtObservacao";
    hidden.style.display = "none";
    hidden.value = obsVal;
    form.appendChild(hidden);

    try {
      toast("⚠️ Usando fallback submit() (pode exigir OK manual)…", 3000);
      HTMLFormElement.prototype.submit.call(form);
      toast("⏸️ Se aparecer `Assinada com sucesso`, clique OK manualmente.", 4000);
      return true;
    } catch {
      toast("⚠️ Falha ao submeter (fallback).", 2400);
      return false;
    }
  }

  async function assinarCarregar_ComFetchEComNudge() {
    const res = await postAssinarELiquidarViaFetch();

    if (!res.ok) {
      toast(`⚠️ Fetch falhou (${res.reason}). Usando fallback submit().`, 4200);
      submitAssinarELiquidarDireto_FallbackSubmit();
      return;
    }

    toast("⏳ Aguardando 5s para tab-nudge…", 2200);

    setTimeout(() => {
      const ok = tabNudgeBestEffort();
      toast(ok ? "🧪 Tab-nudge disparado." : "🧪 Tab-nudge bloqueado/ignorado.", 2400);
    }, 5000);

    setTimeout(() => {
      try {
        toast("➡️ Indo para a página de Liquidação (DH)…", 2000);
        location.replace(res.dhUrl);
      } catch {
        location.href = res.dhUrl;
      }
    }, 5500);
  }

  // ======================= FLUXOS =======================
  async function fluxoLista() {
    clearStep();
    const ano = getAnoAtivo();
    toast(`📋 Lista (${ano}): procurando o primeiro 'Analisar'…`, 2400);

    const analisar = await waitFor(findPrimeiroAnalisar, { interval: 300, timeout: 20000 });
    if (!analisar) {
      toast("⛔ Não achei o botão 'Analisar'. Desativando.", 3200);
      setActive(false);
      return;
    }

    setStep("clicked_analisar");
    toast("🖱️ Clicando em 'Analisar' (primeira linha)…", 2400);
    setTimeout(() => robustClick(analisar), 3000);
  }

  async function fluxoDetalhesAssinarECarregar() {
    const idapEl = document.querySelector('input[name="idap"]');
    const idap = (idapEl && idapEl.value) ? String(idapEl.value).trim() : "";
    const last = sessionStorage.getItem(SS_LAST_IDAP) || "";
    if (idap && last !== idap) sessionStorage.setItem(SS_LAST_IDAP, idap);

    const btAssinar = await waitFor(findBtAssinarImg, { interval: 300, timeout: 20000 });
    const dialog = await waitFor(findDialogAssinar, { interval: 300, timeout: 20000 });
    if (!btAssinar || !dialog) return;

    if (getStep() !== "opened_dialog") {
      setStep("opened_dialog");
      toast("🧾 Tela da AP: abrindo diálogo de assinatura…", 2400);
      setTimeout(() => {
        robustClick(btAssinar);
        setTimeout(() => { try { fluxoDetalhesAssinarECarregar(); } catch {} }, 2200);
      }, 2000);
      return;
    }

    if (getStep() !== "btn_liq_ready") {
      toast("⏳ Aguardando botão 'Carregar Liquidação'…", 2400);
      const btnLiq = await waitFor(findBtnConfirmarCarregarLiq, { interval: 200, timeout: 20000 });
      if (!btnLiq) {
        toast("⚠️ Não encontrei 'Carregar Liquidação'. Re-tentando…", 2400);
        setStep("opened_dialog");
        return;
      }
      setStep("btn_liq_ready");
      toast("✅ 'Carregar Liquidação' encontrado.", 1600);
    }

    if (getStep() !== "submitted_assinareliquidar") {
      setStep("submitted_assinareliquidar");
      setTimeout(() => {
        assinarCarregar_ComFetchEComNudge().catch(() => {
          toast("⚠️ Erro inesperado no fetch/nudge. Voltando etapa…", 3000);
          setStep("btn_liq_ready");
        });
      }, 1400);
    }
  }

  async function fluxoSalvarDhVoltar() {
    const btnSalvar = await waitFor(findSalvarDh, { interval: 300, timeout: 20000 });
    if (!btnSalvar) {
      toast("↩️ Não achei 'Salvar DH'. Voltando para a lista…", 2600);
      location.replace(buildListaUrl());
      return;
    }

    toast("💾 Clicando em 'Salvar DH no OFCWeb'…", 2400);

    setTimeout(() => { try { location.replace(buildListaUrl()); } catch {} }, 250);
    setTimeout(() => { robustClick(btnSalvar); }, 50);
    setTimeout(() => {
      try {
        toast("📋 Retornando para a lista…", 2000);
        window.top.location.replace(buildListaUrl());
      } catch {}
    }, 2000);
  }

  // ======================= MAIN LOOP =======================
  async function main() {
    if (!isActive()) {
      console.log("[AutoAnálise] Script desativado, aguardando...");
      return;
    }

    const href = location.href;
    console.log("[AutoAnálise] Main executando em:", href);

    if (href.startsWith(LISTA_URL_PREFIX)) {
      await fluxoLista();
      return;
    }

    if (document.querySelector("#bt_assinar") || document.querySelector("#dialogAssinar")) {
      await fluxoDetalhesAssinarECarregar();
      return;
    }

    if (Array.from(document.querySelectorAll("input[type='button'],button"))
      .some(b => ((b.value || b.textContent || "").trim() === "Salvar DH no OFCWeb"))) {
      await fluxoSalvarDhVoltar();
      return;
    }

    setTimeout(() => main(), 1200);
  }

  // Inicia o loop principal após carregar
  console.log("[AutoAnálise] Script carregado, aguardando window.load");
  window.addEventListener("load", () => {
    console.log("[AutoAnálise] Window loaded, iniciando main loop em 1s");
    setTimeout(() => {
      console.log("[AutoAnálise] Iniciando main()");
      main();
    }, 1000);
  });

})();
