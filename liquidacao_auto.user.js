// ==UserScript==
// @name         Liquidação Automática
// @namespace    http://tampermonkey.net/
// @author       Erik Higino
// @version      5.1
// @description  Auto-liquidação DH. Detecta automaticamente o ano (2025/2026), seleção de ITEMs obrigatória, delays (5s/5s/5s), toggle moderno e resiliente.
// @match        https://ofcweb.inss.gov.br/View/Consultar_Liquidar.php*
// @match        https://ofcweb.inss.gov.br/View/Define_Formulario_Liquidacao_DH.php*
// @match        https://ofcweb.inss.gov.br/View/Form_AP_DH_Geral.php*
// @match        https://ofcweb.inss.gov.br/View/Form_AP_DH_RPB.php*
// @match        https://ofcweb.inss.gov.br/View/Form_AP_DH_*.php*
// @grant        none
// @run-at       document-end
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/liquidacao_auto.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/liquidacao_auto.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ======================= CONFIG =======================
  const RESP_ANALISE = "1563857";
  const STORAGE_ANO = "ofc_autoliquidar_ano";

  const SS = {
    STEP: "ofc_dh_step",
    TS: "ofc_dh_ts",
    BACK_SCHEDULED: "ofc_dh_back_scheduled",
    CONFIRM_UNTIL: "ofc_dh_confirm_until",
    NEED_PICK_ITEMS: "ofc_dh_need_pick_items",
    PICKER_OPEN: "ofc_dh_picker_open",
  };

  const log = (...a) => console.log(`[AUTO-DH ${getAnoAtivo()}]`, ...a);

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
    let ano = getAnoSelecionado();

    if (!ano) {
      const stored = localStorage.getItem(STORAGE_ANO);
      ano = stored ? parseInt(stored, 10) : null;
    }

    if (!ano || (ano !== 2025 && ano !== 2026)) {
      ano = 2026;
    }

    localStorage.setItem(STORAGE_ANO, String(ano));
    return ano;
  }

  // ======================= STORAGE DINÂMICO POR ANO =======================
  function getStorage() {
    const ano = getAnoAtivo();
    return {
      ACTIVE: `ofc_autoliquidar_${ano}_active`,
      ITEMS: `ofc_autoliquidar_${ano}_items_selected`,
      ITEMS_VER: `ofc_autoliquidar_${ano}_items_selected_v`,
      TEMP_ITEMS: `AUTO_DH_TEMP_ITEMS_${ano}`,
    };
  }

  function setActive(v) {
    const s = getStorage();
    localStorage.setItem(s.ACTIVE, v ? "1" : "0");
  }

  function isActive() {
    const s = getStorage();
    return localStorage.getItem(s.ACTIVE) === "1";
  }

  // ======================= URLs DINÂMICAS =======================
  function getListaUrlBase() {
    const ano = getAnoAtivo();
    return `https://ofcweb.inss.gov.br/View/Consultar_Liquidar.php?&porpagina=100&order=id_ap:DESC&filter=tb_ap${ano}.resp_analise:${RESP_ANALISE}&ultimo_evento=`;
  }

  function isLista() {
    const ano = getAnoAtivo();
    const cur = normalizeUrl(location.href);
    return cur.includes("/View/Consultar_Liquidar.php") &&
      cur.includes(`filter=tb_ap${ano}.resp_analise:${RESP_ANALISE}`);
  }

  function goListaBase(replace = true) {
    toast("↩️ Voltando para a lista…", 2200);
    if (replace) location.replace(getListaUrlBase());
    else location.href = getListaUrlBase();
  }

  // ======================= UTILITIES =======================
  function getStep() { return sessionStorage.getItem(SS.STEP) || ""; }
  function setStep(s) { sessionStorage.setItem(SS.STEP, s); }
  function clearStep() {
    sessionStorage.removeItem(SS.STEP);
    sessionStorage.removeItem(SS.TS);
    sessionStorage.removeItem(SS.CONFIRM_UNTIL);
  }
  function setTS(ms) { sessionStorage.setItem(SS.TS, String(ms)); }
  function getTS() { return parseInt(sessionStorage.getItem(SS.TS) || "0", 10); }

  function normalizeUrl(u) { return (u || "").split("#")[0]; }

  // ======================= TOAST MODERNIZADO =======================
  let lastToast = { msg: "", at: 0 };

  function toast(msg, ms = 2200) {
    const now = Date.now();
    if (lastToast.msg === msg && (now - lastToast.at) < 1200) return;
    lastToast = { msg, at: now };

    let el = document.getElementById("ofc-auto-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "ofc-auto-toast";
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "80px",
        zIndex: 999998,
        padding: "12px 16px",
        borderRadius: "12px",
        background: "rgba(17,24,39,0.95)",
        color: "#fff",
        fontSize: "13px",
        fontWeight: "500",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(8px)",
        opacity: "0",
        transform: "translateY(12px)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
        pointerEvents: "none",
        maxWidth: "420px",
        lineHeight: "1.4"
      });
      document.body.appendChild(el);
    }

    el.textContent = msg;
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(12px)";
    }, ms);
  }

  // ======================= SELEÇÃO DE ITENS =======================
  function getSelectedItems() {
    try {
      const s = getStorage();
      const raw = localStorage.getItem(s.ITEMS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(String) : [];
    } catch {
      return [];
    }
  }

  function setSelectedItems(items) {
    const s = getStorage();
    localStorage.setItem(s.ITEMS, JSON.stringify(items.map(String)));
    localStorage.setItem(s.ITEMS_VER, String(Date.now()));
  }

  function hasItemFilter() {
    return getSelectedItems().length > 0;
  }

  function extractItemsFromTable() {
    const set = new Set();
    const rows = document.querySelectorAll("table.tbl tbody tr.tbl-row");
    for (const row of rows) {
      const cells = row.querySelectorAll("td.tbl-cell");
      if (!cells || cells.length < 7) continue;
      const item = (cells[6]?.textContent || "").trim();
      if (item) set.add(item);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }

  // ======================= MODAL MODERNIZADO =======================
  function ensureItemPickerModal() {
    if (!isLista()) return;
    if (document.getElementById("ofc-item-picker")) return;

    const mustPick =
      sessionStorage.getItem(SS.NEED_PICK_ITEMS) === "1" || !hasItemFilter();
    if (!mustPick) return;

    sessionStorage.setItem(SS.PICKER_OPEN, "1");

    const items = extractItemsFromTable();
    if (!items.length) {
      toast("⚠️ Não encontrei ITEMs na tabela para selecionar.", 3500);
      setActive(false);
      clearStep();
      alert(`AUTO DH ${getAnoAtivo()} foi desativado: não foi possível listar ITEMs para seleção.`);
      sessionStorage.removeItem(SS.PICKER_OPEN);
      return;
    }

    const s = getStorage();
    const temp = sessionStorage.getItem(s.TEMP_ITEMS);
    let prev = new Set();
    try {
      prev = new Set(temp ? JSON.parse(temp) : getSelectedItems());
    } catch {
      prev = new Set(getSelectedItems());
    }

    // Overlay
    const overlay = document.createElement("div");
    overlay.id = "ofc-item-picker";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.6)",
      backdropFilter: "blur(4px)",
      zIndex: 1000000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      animation: "fadeIn 0.2s ease"
    });

    // Card
    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "min(720px, 96vw)",
      maxHeight: "min(80vh, 720px)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
      color: "#fff",
      borderRadius: "16px",
      boxShadow: "0 25px 70px rgba(0,0,0,0.5)",
      border: "1px solid rgba(255,255,255,0.15)",
      position: "relative",
      animation: "slideUp 0.3s ease"
    });

    // Adiciona animações CSS
    const style = document.createElement("style");
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    // Header
    const header = document.createElement("div");
    Object.assign(header.style, {
      padding: "20px 24px",
      borderBottom: "1px solid rgba(255,255,255,0.1)",
      background: "rgba(255,255,255,0.03)"
    });

    const title = document.createElement("div");
    title.textContent = `💾 Selecione os ITEMs para liquidar (${getAnoAtivo()})`;
    Object.assign(title.style, {
      fontSize: "16px",
      fontWeight: "700",
      marginBottom: "6px",
      color: "#fff"
    });

    const hint = document.createElement("div");
    hint.textContent = "Sem selecionar pelo menos 1 ITEM, o robô não inicia. Fechar esta janela desativa o AUTO DH.";
    Object.assign(hint.style, {
      fontSize: "13px",
      opacity: "0.75",
      lineHeight: "1.4",
      color: "#cbd5e1"
    });

    // Botão X
    const closeX = document.createElement("button");
    closeX.type = "button";
    closeX.textContent = "✕";
    Object.assign(closeX.style, {
      position: "absolute",
      top: "16px",
      right: "16px",
      width: "36px",
      height: "36px",
      borderRadius: "12px",
      border: "1px solid rgba(255,255,255,0.2)",
      background: "rgba(255,255,255,0.08)",
      color: "#fff",
      cursor: "pointer",
      fontSize: "16px",
      fontWeight: "600",
      transition: "all 0.2s ease"
    });

    closeX.addEventListener("mouseenter", () => {
      closeX.style.background = "rgba(239,68,68,0.2)";
      closeX.style.borderColor = "rgba(239,68,68,0.4)";
    });

    closeX.addEventListener("mouseleave", () => {
      closeX.style.background = "rgba(255,255,255,0.08)";
      closeX.style.borderColor = "rgba(255,255,255,0.2)";
    });

    function cleanupOverlay() {
      document.removeEventListener("keydown", onKey, true);
      try { document.body.removeChild(overlay); } catch {}
      sessionStorage.removeItem(SS.PICKER_OPEN);
    }

    function mandatoryExit() {
      cleanupOverlay();
      sessionStorage.removeItem(s.TEMP_ITEMS);
      setActive(false);
      clearStep();
      sessionStorage.removeItem(SS.BACK_SCHEDULED);
      sessionStorage.removeItem(SS.NEED_PICK_ITEMS);
      localStorage.removeItem(s.ITEMS);
      localStorage.removeItem(s.ITEMS_VER);

      toast(`⏹ AUTO DH ${getAnoAtivo()} DESATIVADO (seleção de ITEM é obrigatória).`, 3200);
      alert(`AUTO DH ${getAnoAtivo()} foi desativado: a seleção de ITEM é obrigatória.`);
    }

    closeX.addEventListener("click", mandatoryExit);

    function onKey(e) {
      if (e.key === "Escape") mandatoryExit();
    }
    document.addEventListener("keydown", onKey, true);

    header.appendChild(title);
    header.appendChild(hint);
    header.appendChild(closeX);

    // Grid container (scrollable)
    const scrollContainer = document.createElement("div");
    Object.assign(scrollContainer.style, {
      flex: "1",
      overflow: "auto",
      padding: "20px 24px"
    });

    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      gap: "10px"
    });

    function snapshotTemp() {
      const chosenNow = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked')).map(x => x.value);
      sessionStorage.setItem(s.TEMP_ITEMS, JSON.stringify(chosenNow));
    }

    for (const it of items) {
      const lbl = document.createElement("label");
      Object.assign(lbl.style, {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "12px",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        userSelect: "none",
        transition: "all 0.2s ease"
      });

      lbl.addEventListener("mouseenter", () => {
        lbl.style.background = "rgba(255,255,255,0.1)";
        lbl.style.borderColor = "rgba(255,255,255,0.2)";
        lbl.style.transform = "translateY(-2px)";
      });

      lbl.addEventListener("mouseleave", () => {
        lbl.style.background = "rgba(255,255,255,0.06)";
        lbl.style.borderColor = "rgba(255,255,255,0.12)";
        lbl.style.transform = "translateY(0)";
      });

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = it;
      cb.checked = prev.has(it);
      cb.addEventListener("change", snapshotTemp);
      Object.assign(cb.style, {
        transform: "scale(1.1)",
        cursor: "pointer",
        accentColor: "#10b981"
      });

      const txt = document.createElement("span");
      txt.textContent = it;
      Object.assign(txt.style, {
        fontSize: "13px",
        fontWeight: "500",
        color: "#ffffff",
        textShadow: "0 1px 2px rgba(0,0,0,0.4)"
      });

      lbl.appendChild(cb);
      lbl.appendChild(txt);
      grid.appendChild(lbl);
    }

    scrollContainer.appendChild(grid);

    // Footer com ações
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      padding: "20px 24px",
      borderTop: "1px solid rgba(255,255,255,0.1)",
      display: "flex",
      gap: "10px",
      justifyContent: "space-between",
      background: "rgba(255,255,255,0.03)"
    });

    function mkBtn(label, bg, hoverBg) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      Object.assign(b.style, {
        padding: "11px 18px",
        borderRadius: "11px",
        border: "1px solid rgba(255,255,255,0.2)",
        background: bg,
        color: "#fff",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: "600",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
        transition: "all 0.2s ease"
      });

      b.addEventListener("mouseenter", () => {
        b.style.background = hoverBg;
        b.style.transform = "translateY(-1px)";
        b.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
      });

      b.addEventListener("mouseleave", () => {
        b.style.background = bg;
        b.style.transform = "translateY(0)";
        b.style.boxShadow = "none";
      });

      return b;
    }

    const leftActions = document.createElement("div");
    Object.assign(leftActions.style, { display: "flex", gap: "10px" });

    const btnAll = mkBtn("✓ Marcar todos", "#475569", "#64748b");
    btnAll.addEventListener("click", () => {
      overlay.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = true);
      snapshotTemp();
    });

    const btnNone = mkBtn("✗ Desmarcar todos", "#475569", "#64748b");
    btnNone.addEventListener("click", () => {
      overlay.querySelectorAll('input[type="checkbox"]').forEach(x => x.checked = false);
      snapshotTemp();
    });

    leftActions.appendChild(btnAll);
    leftActions.appendChild(btnNone);

    const btnStart = mkBtn("🚀 Iniciar liquidação", "#10b981", "#059669");
    btnStart.addEventListener("click", () => {
      const chosen = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked')).map(x => x.value);
      if (!chosen.length) {
        toast("⚠️ Selecione ao menos 1 ITEM (obrigatório).", 3200);
        return;
      }

      setSelectedItems(chosen);
      sessionStorage.removeItem(s.TEMP_ITEMS);
      sessionStorage.removeItem(SS.PICKER_OPEN);
      sessionStorage.removeItem(SS.NEED_PICK_ITEMS);

      cleanupOverlay();

      toast(`✅ Itens selecionados: ${chosen.join(", ")}. Iniciando…`, 3800);
      setTimeout(runOnce, 450);
    });

    footer.appendChild(leftActions);
    footer.appendChild(btnStart);

    card.appendChild(header);
    card.appendChild(scrollContainer);
    card.appendChild(footer);
    overlay.appendChild(card);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) mandatoryExit();
    });

    document.body.appendChild(overlay);
  }

  // ======================= HASH =======================
  function applyHashControl() {
    const h = String(location.hash || "");
    if (/ofcAuto=1/i.test(h)) {
      if (!isActive()) toast(`🔔 Liquidação automática (${getAnoAtivo()}) ATIVADA`);
      setActive(true);
      if (isLista()) sessionStorage.setItem(SS.NEED_PICK_ITEMS, "1");
    }
    if (/ofcAuto=0/i.test(h)) {
      if (isActive()) toast(`⏹ Liquidação automática (${getAnoAtivo()}) DESATIVADA`);
      setActive(false);
      clearStep();
      sessionStorage.removeItem(SS.BACK_SCHEDULED);
      sessionStorage.removeItem(SS.NEED_PICK_ITEMS);
      sessionStorage.removeItem(SS.PICKER_OPEN);
      const s = getStorage();
      sessionStorage.removeItem(s.TEMP_ITEMS);
    }
  }

  // ======================= TOGGLE MODERNIZADO =======================
  function ensureFloatingToggle() {
    if (document.getElementById("ofc-auto-toggle-dh")) {
      log("Toggle já existe");
      return;
    }

    log("Criando toggle...");

    const wrap = document.createElement("div");
    wrap.id = "ofc-auto-toggle-dh";
    Object.assign(wrap.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: 999999,
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      userSelect: "none"
    });

    const pill = document.createElement("button");
    pill.type = "button";
    Object.assign(pill.style, {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "4px",
      padding: "12px 16px",
      borderRadius: "14px",
      border: "1px solid rgba(0,0,0,0.15)",
      boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
      cursor: "pointer",
      background: "#fff",
      color: "#1a1a1a",
      transition: "all 0.2s ease",
      pointerEvents: "auto",
      minWidth: "180px"
    });

    const topRow = document.createElement("div");
    Object.assign(topRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      width: "100%"
    });

    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      display: "inline-block",
      transition: "all 0.2s ease"
    });

    const label = document.createElement("span");
    Object.assign(label.style, {
      fontSize: "13px",
      fontWeight: "600"
    });

    topRow.appendChild(dot);
    topRow.appendChild(label);

    const hint = document.createElement("span");
    Object.assign(hint.style, {
      fontSize: "11px",
      opacity: "0.65",
      fontWeight: "500",
      marginLeft: "20px"
    });

    pill.appendChild(topRow);
    pill.appendChild(hint);
    wrap.appendChild(pill);

    function paint() {
      const on = isActive();
      const ano = getAnoAtivo();

      dot.style.background = on ? "#10b981" : "#9ca3af";
      dot.style.boxShadow = on ? "0 0 0 3px rgba(16,185,129,0.2)" : "0 0 0 3px rgba(0,0,0,0.05)";
      label.textContent = `Liquidação: ${on ? "ON" : "OFF"}`;
      hint.textContent = `💾 DH ${ano}`;
      pill.style.borderColor = on ? "rgba(16,185,129,0.3)" : "rgba(0,0,0,0.15)";
      pill.style.background = on ? "rgba(240,253,244,1)" : "#fff";
    }

    pill.addEventListener("mouseenter", () => {
      pill.style.transform = "translateY(-2px)";
      pill.style.boxShadow = "0 12px 28px rgba(0,0,0,0.25)";
    });

    pill.addEventListener("mouseleave", () => {
      pill.style.transform = "translateY(0)";
      pill.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
    });

    pill.addEventListener("click", () => {
      const next = !isActive();
      setActive(next);
      paint();
      const ano = getAnoAtivo();

      if (next) {
        toast(`🔔 Liquidação automática (${ano}) ATIVADA`, 1800);
        clearStep();
        sessionStorage.removeItem(SS.BACK_SCHEDULED);
        sessionStorage.setItem(SS.NEED_PICK_ITEMS, "1");
        sessionStorage.removeItem(SS.PICKER_OPEN);
        const s = getStorage();
        sessionStorage.removeItem(s.TEMP_ITEMS);

        if (!isLista()) {
          toast("ℹ️ Volte para a lista para escolher os ITEMs (obrigatório).", 2600);
        }

        setTimeout(runOnce, 300);
      } else {
        toast(`⏹ Liquidação automática (${ano}) DESATIVADA`, 1800);
        clearStep();
        sessionStorage.removeItem(SS.BACK_SCHEDULED);
        sessionStorage.removeItem(SS.PICKER_OPEN);
        const s = getStorage();
        sessionStorage.removeItem(s.TEMP_ITEMS);
        localStorage.removeItem(s.ITEMS);
        localStorage.removeItem(s.ITEMS_VER);
        sessionStorage.setItem(SS.NEED_PICK_ITEMS, "1");
      }
    });

    const mount = () => {
      try {
        const target = document.body || document.documentElement;
        if (target) {
          target.appendChild(wrap);
          window.__ofcAutoToggleDH = true;
          paint();
          log("Toggle montado com sucesso");
          return true;
        } else {
          log("Sem target para montar toggle ainda");
          return false;
        }
      } catch (e) {
        console.error("[AUTO-DH] Erro ao montar toggle:", e);
        return false;
      }
    };

    // Múltiplas tentativas de montagem
    if (!mount()) {
      // Tenta quando DOM estiver pronto
      if (document.readyState === 'loading') {
        document.addEventListener("DOMContentLoaded", () => {
          log("Tentando montar toggle (DOMContentLoaded)");
          mount();
        }, { once: true });
      }

      // Tenta quando window carregar
      window.addEventListener("load", () => {
        if (!window.__ofcAutoToggleDH) {
          log("Tentando montar toggle (window.load)");
          mount();
        }
      }, { once: true });

      // Tenta após timeout
      setTimeout(() => {
        if (!window.__ofcAutoToggleDH) {
          log("Tentando montar toggle (timeout 500ms)");
          mount();
        }
      }, 500);

      // Tenta após timeout maior
      setTimeout(() => {
        if (!window.__ofcAutoToggleDH) {
          log("Tentando montar toggle (timeout 1500ms)");
          mount();
        }
      }, 1500);
    }

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
        log("Observer configurado para #lstExercicio");
      } else {
        setTimeout(setupObserver, 1000);
      }
    };

    setTimeout(setupObserver, 100);
  }

  // ======================= CONFIRM TRANSMISSÃO =======================
  const nativeConfirm = window.confirm.bind(window);
  window.confirm = function (msg) {
    const s = String(msg || "");
    if (isActive() && /Confirma\s+a\s+transmiss[aã]o\?/i.test(s)) {
      const until = parseInt(sessionStorage.getItem(SS.CONFIRM_UNTIL) || "0", 10);
      if (until && Date.now() < until) {
        toast("⏳ Aguardando 5s para confirmar a transmissão…", 2200);
        while (Date.now() < until) { /* busy-wait controlado */ }
      }
      toast("✅ Transmissão confirmada.", 1800);
      return true;
    }
    return nativeConfirm(msg);
  };

  // ======================= LISTA HELPERS =======================
  function rowItemValue(row) {
    const cells = row.querySelectorAll("td.tbl-cell");
    if (!cells || cells.length < 7) return "";
    return (cells[6]?.textContent || "").trim();
  }

  function findFirstDHMatchingItems() {
    const selected = new Set(getSelectedItems());
    const filterOn = selected.size > 0;

    const rows = document.querySelectorAll("table.tbl tbody tr.tbl-row");
    for (const row of rows) {
      const item = rowItemValue(row);
      if (filterOn && !selected.has(item)) continue;

      const a = Array.from(row.querySelectorAll("td.tbl-controls a[onclick]"))
        .find(x => /Define_Formulario_Liquidacao_DH\.php\?idap=/i.test(x.getAttribute("onclick") || ""));
      if (a) return a;
    }
    return null;
  }

  function getPage() {
    const m = normalizeUrl(location.href).match(/[?&]page=(\d+)/i);
    return m ? parseInt(m[1], 10) : 1;
  }

  function maxPage() {
    const sel = document.querySelector('select[name="tbl-page"]');
    if (!sel) return 1;
    const vals = Array.from(sel.options).map(o => +o.value || 1);
    return vals.length ? Math.max(...vals) : 1;
  }

  function goPage(p) {
    const u = new URL(normalizeUrl(location.href));
    u.searchParams.set("page", String(p));
    toast(`📄 Indo para a página ${p}…`, 1400);
    location.href = u.toString();
  }

  // ======================= FLUXOS =======================
  function fluxoLista() {
    if (!isLista()) return;
    if (!isActive()) return;

    if (!hasItemFilter()) {
      sessionStorage.setItem(SS.NEED_PICK_ITEMS, "1");
      ensureItemPickerModal();
      return;
    }

    ensureItemPickerModal();
    if (sessionStorage.getItem(SS.PICKER_OPEN) === "1" || document.getElementById("ofc-item-picker")) return;

    const dh = findFirstDHMatchingItems();
    if (dh) {
      clearStep();
      sessionStorage.removeItem(SS.BACK_SCHEDULED);
      toast("➡️ DH encontrado (item selecionado). Abrindo…", 1700);
      setTimeout(() => dh.click(), 850);
      return;
    }

    const p = getPage(), m = maxPage();
    if (p < m) {
      setTimeout(() => goPage(p + 1), 700);
      return;
    }

    const ano = getAnoAtivo();
    setActive(false);
    clearStep();
    sessionStorage.removeItem(SS.BACK_SCHEDULED);

    const s = getStorage();
    localStorage.removeItem(s.ITEMS);
    localStorage.removeItem(s.ITEMS_VER);
    sessionStorage.setItem(SS.NEED_PICK_ITEMS, "1");

    toast(`✅ FINALIZADO: não há mais DH (para os itens selecionados).`, 3400);
    alert(`Liquidação automática (${ano}) finalizada: não há mais DH para os itens selecionados.`);
    setTimeout(() => goListaBase(true), 500);
  }

  function isDhFormPage() {
    const h = normalizeUrl(location.href);
    return h.includes("/View/Form_AP_DH_") || h.includes("/View/Form_AP_DH_Geral.php");
  }

  function findBtnGerarDH() {
    return (
      document.querySelector("#bt_doc_habil") ||
      Array.from(document.querySelectorAll('input[type="button"]'))
        .find(b => (b.value || "").trim().toLowerCase() === "gerar documento hábil")
    );
  }

  function findBtnConfirmarDialog() {
    return (
      document.querySelector('#dialog input[value="Confirmar"]') ||
      Array.from(document.querySelectorAll('input[type="button"][value="Confirmar"]'))
        .find(b => /Confirma a transmiss/i.test(b.getAttribute("onclick") || ""))
    );
  }

  function fluxoDH() {
    if (!isActive()) return;
    if (!isDhFormPage()) return;

    const now = Date.now();
    const step = getStep();
    const ts = getTS();

    const btnGerar = findBtnGerarDH();
    if (btnGerar && step !== "gerar_clicked" && step !== "confirm_clicked" && step !== "after_transmit") {
      setStep("gerar_clicked");
      setTS(now);
      toast('🧾 Clicando em "Gerar Documento Hábil"…', 2000);
      setTimeout(() => { try { btnGerar.click(); } catch { } }, 450);
      return;
    }

    const btnConfirmar = findBtnConfirmarDialog();
    if (step === "gerar_clicked") {
      const elapsed = now - ts;
      if (elapsed < 5000) {
        toast(`⏳ Aguardando ${Math.ceil((5000 - elapsed) / 1000)}s para "Confirmar"…`, 1200);
        return;
      }

      if (btnConfirmar) {
        setStep("confirm_clicked");
        setTS(Date.now());
        sessionStorage.setItem(SS.CONFIRM_UNTIL, String(Date.now() + 5000));
        toast('✅ Clicando em "Confirmar" (após 5s)…', 2000);
        setTimeout(() => { try { btnConfirmar.click(); } catch { } }, 400);
        return;
      }

      toast('⏳ Aguardando aparecer o botão "Confirmar"…', 1500);
      return;
    }

    if (step === "confirm_clicked") {
      setStep("after_transmit");
      setTS(Date.now());
      toast("📤 Transmissão encaminhada. Aguardando 5s para voltar à lista…", 2400);
      return;
    }

    if (step === "after_transmit") {
      const elapsed = now - ts;
      if (elapsed < 5000) {
        toast(`⏳ Voltando para a lista em ${Math.ceil((5000 - elapsed) / 1000)}s…`, 1200);
        return;
      }
      clearStep();
      sessionStorage.removeItem(SS.BACK_SCHEDULED);
      goListaBase(true);
      return;
    }
  }

  // ======================= RUNNER =======================
  let running = false;

  function runOnce() {
    if (sessionStorage.getItem(SS.PICKER_OPEN) === "1" || document.getElementById("ofc-item-picker")) return;
    if (running) return;

    running = true;
    try {
      applyHashControl();
      ensureFloatingToggle();

      if (isLista() && isActive()) ensureItemPickerModal();

      const h = normalizeUrl(location.href);
      if (h.includes("/Consultar_Liquidar.php")) fluxoLista();
      if (isDhFormPage()) fluxoDH();
    } finally {
      running = false;
    }
  }

  function startLoop() {
    log("Script carregado");

    // Tenta criar toggle imediatamente
    ensureFloatingToggle();

    // Tenta criar toggle quando DOM carregar
    if (document.readyState === 'loading') {
      document.addEventListener("DOMContentLoaded", () => {
        log("DOMContentLoaded - garantindo toggle");
        ensureFloatingToggle();
      });
    }

    // Tenta criar toggle quando window carregar
    window.addEventListener("load", () => {
      log("Window loaded - garantindo toggle");
      ensureFloatingToggle();
    });

    runOnce();

    setInterval(() => {
      try { ensureFloatingToggle(); } catch { }
      if (!isActive()) return;
      runOnce();
    }, 900);
  }

  startLoop();

})();
