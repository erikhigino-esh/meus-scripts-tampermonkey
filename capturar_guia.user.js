// ==UserScript==
// @name         OFCWeb - Captura Guia PDF → CSV v2 (somente Depósito Judicial | porta 8766)
// @namespace    http://tampermonkey.net/
// @author       Erik Higino
// @version      2.0
// @description  Captura apenas "Guias de Depósito Judicial via Boleto de Cobrança" (PDF no padrão /uploads/AAAA/MM/AP<digitos>_*.pdf). Interface melhorada com estatísticas.
// @match        https://ofcweb.inss.gov.br/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/capturar_guia.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/capturar_guia.user.js
// ==/UserScript==

(function () {
  "use strict";

  const API = "http://127.0.0.1:8766/append_pdf_url";
  const API_STATS = "http://127.0.0.1:8766/stats";
  const TOKEN = "guia2026";
  const KEY = "ofcweb_captura_pdf_on";
  const KEY_LAST = "ofcweb_captura_pdf_last_url";
  const KEY_STATS = "ofcweb_captura_pdf_stats";

  function isOn() { return !!GM_getValue(KEY, false); }

  // =============================
  // Estatísticas locais (sessão)
  // =============================
  let sessionStats = {
    aceitos: 0,
    rejeitados: 0,
    duplicados: 0,
    erros: 0
  };

  function getSessionStats() {
    try {
      const stored = GM_getValue(KEY_STATS, null);
      if (stored) {
        sessionStats = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[Captura PDF] Erro ao carregar estatísticas:", e);
    }
    return sessionStats;
  }

  function saveSessionStats() {
    try {
      GM_setValue(KEY_STATS, JSON.stringify(sessionStats));
    } catch (e) {
      console.warn("[Captura PDF] Erro ao salvar estatísticas:", e);
    }
  }

  function resetSessionStats() {
    sessionStats = { aceitos: 0, rejeitados: 0, duplicados: 0, erros: 0 };
    saveSessionStats();
    updateStatsUI();
    toast("📊 Estatísticas resetadas");
  }

  getSessionStats();

  // =============================
  // Validação de PDF
  // =============================
  function isValidUploadPdfUrl(urlStr) {
    try {
      const u = new URL(urlStr, location.href);
      if (u.protocol !== "https:") return false;
      if (u.hostname !== "ofcweb.inss.gov.br") return false;
      const re = /^\/uploads\/\d{4}\/\d{2}\/AP\d+_.+\.pdf$/i;
      return re.test(u.pathname);
    } catch (_) {
      return false;
    }
  }

  function isThisTabValidPdf() {
    return isValidUploadPdfUrl(location.href);
  }

  function setOn(v) {
    const wantOn = !!v;

    if (wantOn && !isThisTabValidPdf()) {
      GM_setValue(KEY, false);
      updateUI();
      toast("⚠️ Toggle só pode ser ligado dentro do PDF no padrão /uploads/AAAA/MM/AP...pdf", 3000);
      return;
    }

    GM_setValue(KEY, wantOn);
    updateUI();
  }

  // =============================
  // UI MELHORADA
  // =============================
  if (!isThisTabValidPdf()) {
    return;
  }

  const wrap = document.createElement("div");
  wrap.style.cssText = [
    "position:fixed",
    "right:14px",
    "top:14px",
    "z-index:999999",
    "display:flex",
    "flex-direction:column",
    "gap:10px",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  ].join(";");

  // Card principal
  const card = document.createElement("div");
  card.style.cssText = [
    "background:#fff",
    "border-radius:14px",
    "box-shadow:0 10px 30px rgba(0,0,0,0.2)",
    "padding:16px",
    "min-width:280px",
    "border:1px solid rgba(0,0,0,0.1)"
  ].join(";");

  // Header
  const header = document.createElement("div");
  header.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "margin-bottom:12px"
  ].join(";");

  const title = document.createElement("div");
  title.style.cssText = "font-size:14px;font-weight:700;color:#1a1a1a;";
  title.textContent = "📋 Captura de Guias";

  const badge = document.createElement("div");
  badge.id = "capture-badge";
  badge.style.cssText = [
    "font-size:10px",
    "font-weight:600",
    "padding:3px 8px",
    "border-radius:999px",
    "text-transform:uppercase",
    "letter-spacing:0.3px"
  ].join(";");

  header.appendChild(title);
  header.appendChild(badge);

  // Toggle button
  const btnToggle = document.createElement("button");
  btnToggle.type = "button";
  btnToggle.id = "btn-toggle";
  btnToggle.style.cssText = [
    "width:100%",
    "padding:12px 16px",
    "border-radius:10px",
    "border:0",
    "cursor:pointer",
    "font-size:13px",
    "font-weight:600",
    "transition:all 0.2s ease",
    "color:#fff",
    "margin-bottom:8px"
  ].join(";");

  // Botão enviar agora
  const btnSendNow = document.createElement("button");
  btnSendNow.type = "button";
  btnSendNow.textContent = "Enviar este PDF agora";
  btnSendNow.style.cssText = [
    "width:100%",
    "padding:10px 14px",
    "border-radius:10px",
    "border:1px solid rgba(0,0,0,0.15)",
    "cursor:pointer",
    "font-size:12px",
    "font-weight:500",
    "transition:all 0.2s ease",
    "background:#f8f9fa",
    "color:#495057",
    "margin-bottom:10px"
  ].join(";");

  // Estatísticas
  const statsBox = document.createElement("div");
  statsBox.id = "stats-box";
  statsBox.style.cssText = [
    "background:rgba(0,0,0,0.03)",
    "border-radius:10px",
    "padding:10px",
    "font-size:11px",
    "margin-bottom:8px"
  ].join(";");

  // Status
  const status = document.createElement("div");
  status.id = "status-text";
  status.style.cssText = [
    "font-size:11px",
    "color:#6c757d",
    "line-height:1.4",
    "margin-top:8px",
    "padding-top:8px",
    "border-top:1px solid rgba(0,0,0,0.08)"
  ].join(";");
  status.textContent = "Status: aguardando…";

  // Botão reset stats
  const btnReset = document.createElement("button");
  btnReset.type = "button";
  btnReset.textContent = "↻ Resetar Estatísticas";
  btnReset.style.cssText = [
    "width:100%",
    "padding:8px",
    "border-radius:8px",
    "border:1px solid rgba(220,53,69,0.3)",
    "cursor:pointer",
    "font-size:10px",
    "font-weight:500",
    "background:#fff",
    "color:#dc3545",
    "transition:all 0.2s ease"
  ].join(";");

  card.appendChild(header);
  card.appendChild(btnToggle);
  card.appendChild(btnSendNow);
  card.appendChild(statsBox);
  card.appendChild(status);
  card.appendChild(btnReset);
  wrap.appendChild(card);
  document.documentElement.appendChild(wrap);

  function updateUI() {
    const on = isOn();

    // Badge
    badge.textContent = on ? "ATIVO" : "INATIVO";
    badge.style.background = on ? "rgba(40,167,69,0.15)" : "rgba(220,53,69,0.15)";
    badge.style.color = on ? "#28a745" : "#dc3545";

    // Toggle button
    btnToggle.textContent = on ? "✓ Captura Ativada" : "✗ Captura Desativada";
    btnToggle.style.background = on ? "#28a745" : "#dc3545";

    // Status
    if (!on) {
      status.textContent = "Status: Desativado (clique no botão acima para ativar)";
      status.style.color = "#dc3545";
    } else {
      status.style.color = "#6c757d";
    }

    updateStatsUI();
  }

  function updateStatsUI() {
    const total = sessionStats.aceitos + sessionStats.rejeitados + sessionStats.duplicados + sessionStats.erros;

    statsBox.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px;color:#495057;">Sessão Atual:</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="color:#28a745;font-weight:700;">✓</span>
          <span style="color:#6c757d;">Aceitos:</span>
          <strong style="color:#28a745;">${sessionStats.aceitos}</strong>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="color:#ffc107;font-weight:700;">↻</span>
          <span style="color:#6c757d;">Duplicados:</span>
          <strong style="color:#ffc107;">${sessionStats.duplicados}</strong>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="color:#fd7e14;font-weight:700;">✗</span>
          <span style="color:#6c757d;">Rejeitados:</span>
          <strong style="color:#fd7e14;">${sessionStats.rejeitados}</strong>
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="color:#dc3545;font-weight:700;">⚠</span>
          <span style="color:#6c757d;">Erros:</span>
          <strong style="color:#dc3545;">${sessionStats.erros}</strong>
        </div>
      </div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,0,0,0.08);text-align:center;font-weight:600;color:#495057;">
        Total: ${total}
      </div>
    `;
  }

  // Hover effects
  btnToggle.addEventListener("mouseenter", () => {
    btnToggle.style.transform = "translateY(-1px)";
    btnToggle.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  });

  btnToggle.addEventListener("mouseleave", () => {
    btnToggle.style.transform = "translateY(0)";
    btnToggle.style.boxShadow = "none";
  });

  btnSendNow.addEventListener("mouseenter", () => {
    btnSendNow.style.background = "#e9ecef";
  });

  btnSendNow.addEventListener("mouseleave", () => {
    btnSendNow.style.background = "#f8f9fa";
  });

  btnReset.addEventListener("mouseenter", () => {
    btnReset.style.background = "rgba(220,53,69,0.05)";
  });

  btnReset.addEventListener("mouseleave", () => {
    btnReset.style.background = "#fff";
  });

  // Event listeners
  btnToggle.addEventListener("click", () => {
    const next = !isOn();
    setOn(next);
    if (isOn()) {
      toast("✅ Captura ativada");
      sendPdfUrl(location.href, "auto-toggle");
    } else {
      toast("⚫ Captura desativada");
    }
  });

  btnSendNow.addEventListener("click", () => {
    sendPdfUrl(location.href, "manual-this-tab");
  });

  btnReset.addEventListener("click", () => {
    if (confirm("Resetar estatísticas da sessão atual?")) {
      resetSessionStats();
    }
  });

  updateUI();

  function toast(msg, ms = 2000, type = "info") {
    const el = document.createElement("div");
    el.textContent = msg;

    const colors = {
      info: "#0d6efd",
      success: "#28a745",
      warning: "#ffc107",
      error: "#dc3545"
    };

    el.style.cssText = [
      "position:fixed",
      "right:14px",
      "top:420px",
      "z-index:9999999",
      "padding:12px 16px",
      `background:${colors[type] || colors.info}`,
      "color:#fff",
      "border-radius:10px",
      "font-size:13px",
      "font-weight:500",
      "box-shadow:0 8px 20px rgba(0,0,0,0.25)",
      "max-width:320px",
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
    ].join(";");

    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  // ===== POST =====
  function postJSON(payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: API,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(payload),
        timeout: 20000,
        onload: (res) => {
          if (res.status >= 200 && res.status < 300) return resolve(res.responseText);
          reject(new Error(`HTTP ${res.status}: ${res.responseText}`));
        },
        onerror: () => reject(new Error("Falha ao chamar localhost (Python está rodando?)")),
        ontimeout: () => reject(new Error("Timeout ao chamar localhost")),
      });
    });
  }

  async function sendPdfUrl(url, fonte) {
    if (!isOn()) {
      status.textContent = "Status: Desativado";
      return;
    }

    let abs = url;
    try { abs = new URL(url, location.href).toString(); } catch (_) {}

    if (!isValidUploadPdfUrl(abs)) return;

    const last = GM_getValue(KEY_LAST, "");
    if (last === abs) {
      status.textContent = `Status: Já enviado (anti-duplicação local)`;
      return;
    }

    status.textContent = `⏳ Enviando (${fonte})...`;
    status.style.color = "#0d6efd";

    try {
      const resp = await postJSON({ token: TOKEN, pdf_url: abs, origem_url: location.href });
      const data = JSON.parse(resp);

      if (data.ok && data.accepted) {
        GM_setValue(KEY_LAST, abs);
        sessionStats.aceitos++;
        saveSessionStats();
        updateStatsUI();

        status.textContent = `✅ Aceito: ${data.tipo_documento || 'Guia válida'} (${fonte})`;
        status.style.color = "#28a745";
        toast(`✅ Guia aceita e gravada no CSV`, 2500, "success");
        console.log("[Captura PDF] Aceito", { fonte, abs, data });
      } else if (data.duplicated) {
        sessionStats.duplicados++;
        saveSessionStats();
        updateStatsUI();

        status.textContent = `↻ Duplicado: Guia já existe no CSV (${fonte})`;
        status.style.color = "#ffc107";
        toast(`↻ Guia duplicada (já existe no CSV)`, 2500, "warning");
      } else if (data.rejected) {
        sessionStats.rejeitados++;
        saveSessionStats();
        updateStatsUI();

        const tipo = data.tipo_detectado || "desconhecido";
        status.textContent = `✗ Rejeitado: ${tipo} (${fonte})`;
        status.style.color = "#fd7e14";
        toast(`✗ PDF rejeitado: ${data.mensagem || tipo}`, 3500, "warning");
        console.warn("[Captura PDF] Rejeitado", { fonte, abs, tipo, data });
      }
    } catch (e) {
      sessionStats.erros++;
      saveSessionStats();
      updateStatsUI();

      status.textContent = `⚠ Erro: ${e.message} (${fonte})`;
      status.style.color = "#dc3545";
      toast(`⚠️ Erro: ${e.message}`, 3000, "error");
      console.error("[Captura PDF] Erro:", e);
    }
  }

  // ===== Captura por clique em link =====
  document.addEventListener("click", (e) => {
    if (!isOn()) return;
    const a = e.target?.closest?.("a[href]");
    if (!a?.href) return;
    if (isValidUploadPdfUrl(a.href)) {
      sendPdfUrl(a.href, "link");
    }
  }, true);

  // ===== Captura por window.open =====
  const _open = window.open;
  window.open = function (url) {
    try {
      if (isOn() && typeof url === "string") {
        const abs = new URL(url, location.href).toString();
        if (isValidUploadPdfUrl(abs)) {
          sendPdfUrl(abs, "window.open");
        }
      }
    } catch (_) {}
    return _open.apply(this, arguments);
  };

  // ===== Captura por fetch =====
  const _fetch = window.fetch;
  window.fetch = async function () {
    const resp = await _fetch.apply(this, arguments);
    try {
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (isOn() && ct.includes("pdf") && resp.url && isValidUploadPdfUrl(resp.url)) {
        sendPdfUrl(resp.url, "fetch");
      }
    } catch (_) {}
    return resp;
  };

  // ===== Captura por XHR =====
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cap_url = url;
    return _xhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    this.addEventListener("load", () => {
      try {
        const ct = (this.getResponseHeader("content-type") || "").toLowerCase();
        const u = this.responseURL || (this.__cap_url ? new URL(this.__cap_url, location.href).toString() : "");
        if (isOn() && ct.includes("pdf") && u && isValidUploadPdfUrl(u)) {
          sendPdfUrl(u, "xhr");
        }
      } catch (_) {}
    });
    return _xhrSend.apply(this, arguments);
  };

  // ===== Auto-captura ao carregar =====
  window.addEventListener("load", () => {
    updateUI();
    if (isOn() && isThisTabValidPdf()) {
      setTimeout(() => sendPdfUrl(location.href, "auto-load"), 800);
    }
  });

})();
