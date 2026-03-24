// ==UserScript==
// @name         Registrar no controle
// @namespace    http://tampermonkey.net/
// @author       Erik Higino
// @version      1.1
// @description  Captura Nº da AP e Nº do DH e envia para servidor unificado local que apenda em controle.csv
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-end
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/registro_controle.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/registro_controle.user.js
// ==/UserScript==

(function () {
  "use strict";

  const ENDPOINT = "http://127.0.0.1:8765/append";

  function apenasDigitos(s) {
    return (s || "").toString().replace(/\D+/g, "");
  }

  function toast(msg, ms = 3000) {
    const id = "tm_toast_ofc";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      Object.assign(el.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: 999999,
        padding: "10px 12px",
        borderRadius: "10px",
        fontSize: "13px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        boxShadow: "0 8px 24px rgba(0,0,0,.18)",
        background: "rgba(20,20,20,.92)",
        color: "#fff",
        maxWidth: "360px",
        lineHeight: "1.25",
        pointerEvents: "none",
        opacity: "0",
        transform: "translateY(8px)",
        transition: "opacity .15s ease, transform .15s ease",
      });
      document.documentElement.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
    clearTimeout(el._t);
    el._t = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
    }, ms);
  }

  function getNumeroAP() {
    const tds = Array.from(document.querySelectorAll("td"));
    for (const td of tds) {
      const strong = td.querySelector("span > strong");
      const label = (strong?.textContent || "").trim();
      if (label === "Nº da AP") {
        const div = td.querySelector("div");
        const ap = apenasDigitos(div?.textContent || "");
        if (ap) return ap;
      }
    }
    return "";
  }

  function getNumeroDH() {
    const tds = Array.from(document.querySelectorAll("td"));
    for (const td of tds) {
      const strong = td.querySelector("span > strong");
      const label = (strong?.textContent || "").replace(/\s+/g, " ").trim();
      if (label === "Nº DH") {
        const div = td.querySelector("div");
        if (!div) continue;
        const raw = (div.textContent || "").trim();
        const dh = raw.replace(/\s+/g, ""); // mantém letras/números
        if (dh) return dh;
      }
    }
    return "";
  }

  async function enviar(ap, dh) {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ap, dh }),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${txt}`.trim());
    }
    return resp.json().catch(() => ({}));
  }

  function jaEnviado(ap, dh) {
    const key = `ofc_sent_${ap}_${dh}`;
    if (sessionStorage.getItem(key) === "1") return true;
    sessionStorage.setItem(key, "1");
    return false;
  }

  async function executar() {
    const ap = getNumeroAP();
    const dh = getNumeroDH();
    if (!ap || !dh) return;
    if (jaEnviado(ap, dh)) return;

    const linha = `${ap};${dh}`;

    try {
      const r = await enviar(ap, dh);
      // Se o servidor disser saved=false (duplicado), você pode decidir não tostar
      if (r && r.saved === false) return;
      toast(`✅ Registrado no controle.csv: ${linha}`);
    } catch (e) {
      try { GM_setClipboard(linha, "text"); }
      catch (_) { try { await navigator.clipboard.writeText(linha); } catch (_) {} }
      toast(`⚠️ Servidor offline. Copiado: ${linha}`);
      console.warn("[OFC TM] Falha ao enviar:", e);
    }
  }

  executar();
  setTimeout(executar, 500);
  setTimeout(executar, 1500);
  setTimeout(executar, 3000);

  new MutationObserver(executar)
    .observe(document.documentElement, { childList: true, subtree: true });

})();
