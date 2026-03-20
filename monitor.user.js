// ==UserScript==
// @name         Monitor AP
// @namespace    https://ofcweb.inss.gov.br/
// @author       Erik Higino
// @version      1.3
// @description  Monitora APs, mostra toast central com countdown, recarrega a cada 10 min e alerta no iPhone via iMessage (servidor local).
// @match        https://ofcweb.inss.gov.br/View/Registrar_Analise_Ap_OFC.php*
// @grant        none
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/monitor.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/monitor.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ===== CONFIG =====
  const REFRESH_MINUTES = 10;
  const REFRESH_MS = REFRESH_MINUTES * 60 * 1000;

  const LOCAL_NOTIFY_URL = "http://127.0.0.1:8769/notify";

  const KEY_COUNT = "ofcweb_ap_count_last";
  const KEY_SIG = "ofcweb_ap_sig_last";
  const KEY_NEXT = "ofcweb_next_refresh_ts";

  // ===== HELPERS: detection =====
  function getFoundCount() {
    // "Encontrados <em>0</em> resultados"
    const em = document.querySelector("td.tbl-found em");
    if (!em) return null;
    const n = parseInt((em.textContent || "").trim(), 10);
    return Number.isFinite(n) ? n : null;
  }

  function getApSignature(max = 20) {
    const rows = Array.from(document.querySelectorAll("table.tbl tbody tr"));
    if (!rows.length) return "EMPTY";

    // quando não há resultados: <td class="tbl-noresults">Não há APs...</td>
    if (rows.some(r => r.querySelector("td.tbl-noresults"))) return "NORESULTS";

    const aps = [];
    for (const r of rows) {
      const tds = r.querySelectorAll("td");
      if (!tds || tds.length < 2) continue;
      const nrAp = (tds[1].innerText || "").trim(); // coluna Nº AP (após checkbox)
      if (nrAp) aps.push(nrAp);
      if (aps.length >= max) break;
    }
    return aps.join("|") || "EMPTY";
  }

  // ===== HELPERS: storage =====
  function getStored(key) { return localStorage.getItem(key); }
  function setStored(key, val) { localStorage.setItem(key, String(val)); }

  // ===== HELPERS: notify =====
  async function notifyLocal(text) {
    const url = `${LOCAL_NOTIFY_URL}?text=${encodeURIComponent(text)}`;
    await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" });
  }

  // ===== TOAST UI =====
  function ensureToast() {
    let box = document.getElementById("ofc_monitor_toast");
    if (box) return box;

    box = document.createElement("div");
    box.id = "ofc_monitor_toast";
    box.innerHTML = `
      <div style="font-size:16px; font-weight:700; margin-bottom:6px;">
        ✅ Monitoramento ativo
      </div>
      <div id="ofc_toast_count" style="font-size:14px; margin-bottom:4px;"></div>
      <div id="ofc_toast_lastcheck" style="font-size:13px; margin-bottom:10px; opacity:0.9;"></div>
      <div style="font-size:14px;">
        ⏳ Próximo refresh em: <span id="ofc_toast_timer" style="font-weight:700;"></span>
      </div>
      <div style="font-size:12px; margin-top:10px; opacity:0.85;">
        (Mantendo esta aba aberta)
      </div>
    `;

    // estilo: centro da tela, semitransparente
    Object.assign(box.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483647",
      background: "rgba(0, 0, 0, 0.55)",
      color: "#fff",
      padding: "14px 18px",
      borderRadius: "12px",
      minWidth: "320px",
      textAlign: "center",
      boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      fontFamily: "Calibri, Arial, sans-serif",
      backdropFilter: "blur(3px)", // se o navegador suportar
      pointerEvents: "none", // não atrapalha clicar na página
    });

    document.body.appendChild(box);
    return box;
  }

  function formatMMSS(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(total / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function updateToast(count, lastCheckDate, nextRefreshTs) {
    const box = ensureToast();
    const elCount = document.getElementById("ofc_toast_count");
    const elLast = document.getElementById("ofc_toast_lastcheck");
    const elTimer = document.getElementById("ofc_toast_timer");

    if (elCount) elCount.textContent = `📌 APs encontradas: ${count ?? "—"}`;
    if (elLast) elLast.textContent = `🕒 Último check: ${lastCheckDate.toLocaleTimeString("pt-BR")}`;

    const remain = nextRefreshTs - Date.now();
    if (elTimer) elTimer.textContent = formatMMSS(remain);
  }

  // ===== REFRESH SCHEDULER (persistente) =====
  function initNextRefreshTs() {
    const stored = parseInt(getStored(KEY_NEXT) || "0", 10);
    const now = Date.now();

    // se não existe ou já passou, agenda novo
    if (!Number.isFinite(stored) || stored <= now + 5_000) {
      const next = now + REFRESH_MS;
      setStored(KEY_NEXT, next);
      return next;
    }
    return stored;
  }

  function scheduleReloadAt(nextTs) {
    const delay = Math.max(1000, nextTs - Date.now());
    setTimeout(() => {
      // ao recarregar, já vai recalcular o próximo TS no init
      location.reload();
    }, delay);
  }

  // ===== MAIN =====
  const nextRefreshTs = initNextRefreshTs();
  scheduleReloadAt(nextRefreshTs);

  // ===== ALERTA DE INÍCIO DE MONITORAMENTO =====
  const KEY_MONITOR_STARTED = "ofcweb_monitor_started_flag";

  if (!sessionStorage.getItem(KEY_MONITOR_STARTED)) {
    sessionStorage.setItem(KEY_MONITOR_STARTED, "1");

    const now = new Date();
    const msg = `OFCWeb Monitor iniciado.\n` +
                `Resp: 1563857\n` +
                `Intervalo: ${REFRESH_MINUTES} min\n` +
                `Início: ${now.toLocaleTimeString("pt-BR")}`;

    notifyLocal(msg).catch(err =>
      console.error("[OFCWeb] Falha ao enviar mensagem de início:", err)
    );
  }
// CONTINUA NORMAL
  const count = getFoundCount();
  const sig = getApSignature();
  const lastCheck = new Date();

  // Atualiza toast já no início e depois a cada 1s
  ensureToast();
  updateToast(count, lastCheck, nextRefreshTs);
  setInterval(() => updateToast(count, lastCheck, parseInt(getStored(KEY_NEXT) || String(nextRefreshTs), 10)), 1000);

  // Se não achou o contador, não decide alerta (mas mantém toast + refresh)
  if (count === null) {
    console.warn("[OFCWeb] Não achei td.tbl-found em (talvez sessão expirada ou HTML diferente).");
    return;
  }

  const lastCount = parseInt(getStored(KEY_COUNT) || "0", 10);
  const lastSig = getStored(KEY_SIG) || "";

  // Atualiza estado atual sempre
  setStored(KEY_COUNT, count);
  setStored(KEY_SIG, sig);

  // Disparos:
  const becamePositive = (lastCount === 0 && count > 0);
  const changedSig = (lastSig && sig && sig !== lastSig && sig !== "NORESULTS");

  if (becamePositive || changedSig) {
    const msg = `OFCWeb: há APs para análise.\nEncontradas: ${count}\nResp: 1563857 (2026).`;
    notifyLocal(msg).catch(err => console.error("[OFCWeb] Falha ao chamar servidor local:", err));
  }
})();
