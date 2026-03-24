// ==UserScript==
// @name         Copiar Números - Cmd+Ctrl+C (macOS)
// @namespace    http://tampermonkey.net/
// @author       Erik Higino
// @version      1.1
// @description  Copia para a área de transferência removendo '.' e '-' (mantém apenas números). Toast discreto. Atalho: Command+Ctrl+C (macOS).
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-end
// @updateURL    https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/copia_formatado.user.js
// @downloadURL  https://github.com/erikhigino-esh/meus-scripts-tampermonkey/raw/refs/heads/main/copia_formatado.user.js
// ==/UserScript==

(function () {
  "use strict";

  // >>> ATALHO: Command + Ctrl + C
  const HOTKEY = {
    key: "c",
    metaKey: true, // Command
    ctrlKey: true,
    altKey: false,
    shiftKey: false
  };

  // ===== Toast visual discreto =====
  const TOAST_ID = "tm_digits_toast_v1";

  function ensureToastEl() {
    let el = document.getElementById(TOAST_ID);
    if (el) return el;

    el = document.createElement("div");
    el.id = TOAST_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483647",
      "max-width:380px",
      "padding:10px 12px",
      "border-radius:12px",
      "background:rgba(0,0,0,.78)",
      "border:1px solid rgba(255,255,255,.16)",
      "color:#fff",
      "font:600 12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif",
      "letter-spacing:.2px",
      "box-shadow:0 12px 30px rgba(0,0,0,.35)",
      "backdrop-filter: blur(6px)",
      "display:none",
      "opacity:0",
      "transform:translateY(6px)",
      "transition: opacity .14s ease, transform .14s ease",
      "white-space:nowrap",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "pointer-events:none"
    ].join(";");

    document.documentElement.appendChild(el);
    return el;
  }

  let toastTimer = null;

  function showToast(message) {
    const el = ensureToastEl();
    el.textContent = message;

    if (toastTimer) clearTimeout(toastTimer);

    el.style.display = "block";
    void el.offsetWidth;
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";

    toastTimer = setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateY(6px)";
      setTimeout(() => {
        el.style.display = "none";
      }, 180);
    }, 1400);
  }

  function onlyDigits(str) {
    return String(str).replace(/[.\-]/g, "").replace(/\D+/g, "");
  }

  function getActiveText() {
    // 1) Texto selecionado
    const selection = window.getSelection?.().toString() || "";
    if (selection.trim()) return selection;

    // 2) Campo focado
    const el = document.activeElement;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
      const value = el.value ?? "";
      const start = el.selectionStart;
      const end = el.selectionEnd;

      if (typeof start === "number" && typeof end === "number" && end > start) {
        return value.slice(start, end);
      }
      return value;
    }

    return "";
  }

  async function copyCleanDigits() {
    const raw = getActiveText();
    const cleaned = onlyDigits(raw);

    if (!raw.trim()) {
      showToast("Nada selecionado / nenhum campo focado.");
      return;
    }

    if (!cleaned) {
      showToast("Não há números para copiar.");
      return;
    }

    try {
      GM_setClipboard(cleaned, "text");
      showToast(`Copiado: ${cleaned}`);
      return;
    } catch (e) {}

    try {
      await navigator.clipboard.writeText(cleaned);
      showToast(`Copiado: ${cleaned}`);
    } catch (e) {
      showToast("Falha ao copiar.");
      console.warn("[TM] Falha ao copiar.", e);
    }
  }

  function hotkeyMatches(e) {
    return (
      e.key?.toLowerCase() === HOTKEY.key &&
      !!e.metaKey === !!HOTKEY.metaKey &&
      !!e.ctrlKey === !!HOTKEY.ctrlKey &&
      !!e.altKey === !!HOTKEY.altKey &&
      !!e.shiftKey === !!HOTKEY.shiftKey
    );
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (hotkeyMatches(e)) {
        e.preventDefault();
        e.stopPropagation();
        copyCleanDigits();
      }
    },
    true
  );
})();
