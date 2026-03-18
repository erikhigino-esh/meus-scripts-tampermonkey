// ==UserScript==
// @name         Empenhos Unificados AUTO + UI (detecta ano 2025/2026)
// @namespace    https://ofcweb.inss.gov.br/
// @version      2.2
// @description  Preenche automaticamente o Nº do Empenho no PCO conforme o ITEM da AP. Detecta automaticamente o ano selecionado (2025 ou 2026) e aplica os compromissos correspondentes. Versão com interface visual.
// @match        https://ofcweb.inss.gov.br/*
// @match        http://ofcweb.inss.gov.br/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ========= CONFIGURAÇÃO DE EMPENHOS POR ANO =========
  const EMPENHOS_POR_ANO = {
    2026: [
      {
        itemAlvo: "SERVICOS JUDICIARIOS - PESSOA JURIDICA - INTEGRADO AO SIAFIWEB",
        empenho: "2026NE466666",
        etiqueta: "39566",
      },
      {
        itemAlvo: "AUXILIO PROGRAMA DE REABILITAÇÃO PROFISSIONAL",
        empenho: "2026NE500058",
        etiqueta: "RPB04",
      },
      {
        itemAlvo: "REQUISICAO DE PEQUENO VALOR (RPV) - INTEGRADO AO SIAFIWEB",
        empenho: "2026NE674103",
        etiqueta: "91203",
      },
      {
        itemAlvo: "DECISAO JUDICIAL - BENEFICIOS (339091)",
        empenho: "2026NE500104",
        etiqueta: "91004",
      },
      {
        itemAlvo: "DECISAO JUDICIAL - BENEFICIOS - LOAS/RMV/EPU",
        empenho: "", // preenchido via espécies
        etiqueta: "91204",
        especial: true,
        especies: {
          "87": "2026NE474087",
          "88": "2026NE474088",
        },
      },
    ],

    2025: [
      {
        itemAlvo: "SERVICOS JUDICIARIOS - PESSOA JURIDICA - INTEGRADO AO SIAFIWEB",
        empenho: "2025NE674966",
        etiqueta: "DJPS",
      },
      {
        itemAlvo: "AUXILIO PROGRAMA DE REABILITAÇÃO PROFISSIONAL",
        empenho: "2026NE500058",
        etiqueta: "RPB",
      },
      {
        itemAlvo: "REQUISICAO DE PEQUENO VALOR (RPV) - INTEGRADO AO SIAFIWEB",
        empenho: "2025NE574294",
        etiqueta: "RPV",
      },
      {
        itemAlvo: "DECISAO JUDICIAL - BENEFICIOS (339091)",
        empenho: "2026NE500104",
        etiqueta: "91004",
      },
      {
        itemAlvo: "DECISAO JUDICIAL - BENEFICIOS - LOAS/RMV/EPU",
        empenho: "", // preenchido via espécies
        etiqueta: "91204",
        especial: true,
        especies: {
          "87": "2026NE474087",
          "88": "2026NE474088",
        },
      },
    ],
  };

  // ========= UI =========
  let statusDiv = null;

  function criarUI() {
    if (statusDiv) return;

    statusDiv = document.createElement("div");
    statusDiv.id = "empenhos-auto-status";
    statusDiv.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 999999;
      background: rgba(20,20,20,0.92);
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 6px 18px rgba(0,0,0,0.25);
      max-width: 280px;
      line-height: 1.5;
    `;
    statusDiv.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 6px;">🔧 Empenhos AUTO</div>
      <div id="empenhos-auto-info" style="font-size: 11px; opacity: 0.85;">Carregando...</div>
    `;
    document.body.appendChild(statusDiv);
  }

  function updateUI(ano, item, cfg) {
    if (!statusDiv) return;

    const infoDiv = statusDiv.querySelector("#empenhos-auto-info");
    if (!infoDiv) return;

    if (!ano) {
      infoDiv.innerHTML = `⚠️ Ano não detectado`;
      return;
    }

    if (!item) {
      infoDiv.innerHTML = `
        📅 Ano: <strong>${ano}</strong><br>
        📋 Aguardando ITEM...
      `;
      return;
    }

    if (!cfg) {
      infoDiv.innerHTML = `
        📅 Ano: <strong>${ano}</strong><br>
        📋 ITEM detectado<br>
        ℹ️ Sem empenho configurado
      `;
      return;
    }

    const especieInfo = cfg.especieUsada ? `<br>🔢 Espécie: ${cfg.especieUsada}` : "";
    infoDiv.innerHTML = `
      📅 Ano: <strong>${ano}</strong><br>
      💼 Empenho: <strong>${cfg.empenho}</strong><br>
      🏷️ Rótulo: ${cfg.etiqueta}${especieInfo}
    `;
  }

  // ========= AJUDANTES =========

  /**
   * Normaliza string: remove acentos, normaliza espaços ao redor de barras "/"
   * e espaços múltiplos.
   *
   */
  function norm(str) {
    return (str || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/\s*\/\s*/g, "/") // FIX: normaliza espaços ao redor de "/"
      .replace(/\s+/g, " ") // normaliza espaços múltiplos
      .trim()
      .toUpperCase();
  }

  function obterAnoSelecionado() {
    const select = document.querySelector("#lstExercicio");
    if (!select) return null;

    const opcaoSelecionada =
      select.querySelector("option[selected]") ||
      select.querySelector("option:checked");

    if (opcaoSelecionada && opcaoSelecionada.value) {
      const v = parseInt(opcaoSelecionada.value, 10);
      return Number.isFinite(v) ? v : null;
    }

    if (select.value) {
      const v = parseInt(select.value, 10);
      return Number.isFinite(v) ? v : null;
    }

    return null;
  }

  function obterItemDaPagina() {
    const tds = Array.from(document.querySelectorAll("fieldset td"));
    for (const td of tds) {
      const strong = td.querySelector("span strong");
      if (!strong) continue;
      if (norm(strong.textContent) === "ITEM") {
        const div = td.querySelector("div");
        const txt = div ? div.textContent : td.textContent;
        return (txt || "").trim();
      }
    }
    return "";
  }

  function obterEspecieDaObservacao() {
    const el =
      document.querySelector("#observacao") ||
      document.querySelector('textarea[name="observacao"]') ||
      document.querySelector('[name="observação"]');

    if (!el) return "";
    const txt = String(el.value || el.textContent || "").trim();
    if (!txt) return "";

    // Captura padrão "ESPECIE: 88" ou "ESPECIE - 88"
    const m = txt.match(/\bESPECIE\s*[:\-]\s*(\d{2,3})\b/i);
    return m ? String(m[1]).trim() : "";
  }

  function obterEspecieDaPagina() {
    const tds = Array.from(document.querySelectorAll("td"));
    for (const td of tds) {
      const strong = td.querySelector("strong");
      if (!strong) continue;

      const label = norm(strong.textContent);
      if (label === "ESPECIE") {
        const full = (td.textContent || "").trim();
        const lab = (strong.textContent || "").trim();
        const val = full.replace(lab, "").trim();
        return val;
      }
    }
    return "";
  }

  function acharEmpenhoParaItem(itemPagina, mapaEmpenhos) {
    if (!mapaEmpenhos || !mapaEmpenhos.length) return null;

    const itemN = norm(itemPagina);

    for (const cfg of mapaEmpenhos) {
      if (!itemN.includes(norm(cfg.itemAlvo))) continue;

      if (cfg.especial && cfg.especies) {
        let especie = (obterEspecieDaPagina() || "").trim();
        if (!especie) especie = (obterEspecieDaObservacao() || "").trim();

        if (especie && cfg.especies[especie]) {
          return {
            ...cfg,
            empenho: cfg.especies[especie],
            especieUsada: especie,
          };
        }

        console.warn(`[Empenhos AUTO] ⚠️ Espécie "${especie}" não tem empenho configurado.`);
        return null;
      }

      return cfg;
    }

    return null;
  }

  function dispararEventos(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function preencherEmpenhosNoPCO(cfg, anoSelecionado) {
    if (!cfg || !cfg.empenho) return;

    const campos = Array.from(document.querySelectorAll("input.pco_nr_empenho"));
    if (!campos.length) return;

    let alterou = false;
    for (const campo of campos) {
      if (!campo.value || !campo.value.trim()) {
        campo.value = cfg.empenho;
        dispararEventos(campo);
        alterou = true;
      }
    }

    if (alterou) {
      const itemPg = obterItemDaPagina();
      const especie = cfg.especieUsada || obterEspecieDaPagina() || obterEspecieDaObservacao();
      const extra = especie ? ` | Espécie: ${especie}` : "";
      console.log(
        `[Empenhos AUTO] ANO: ${anoSelecionado} | Empenho: ${cfg.empenho} (${cfg.etiqueta}) | ITEM: ${itemPg}${extra}`
      );
    }
  }

  // ========= EXECUÇÃO =========
  function init() {
    criarUI();

    const anoSelecionado = obterAnoSelecionado();

    if (!anoSelecionado) {
      console.warn("[Empenhos AUTO] ⚠️ Não foi possível detectar o ano selecionado");
      updateUI(null);
      return;
    }

    const mapaEmpenhos = EMPENHOS_POR_ANO[anoSelecionado];

    if (!mapaEmpenhos) {
      console.log(
        `[Empenhos AUTO] ℹ️ Ano ${anoSelecionado} selecionado, mas não há configuração de empenhos`
      );
      updateUI(anoSelecionado);
      return;
    }

    console.log(`[Empenhos AUTO] ✅ Ano detectado: ${anoSelecionado}`);

    const itemPagina = obterItemDaPagina();
    if (!itemPagina) {
      updateUI(anoSelecionado, null);
      return;
    }

    const cfg = acharEmpenhoParaItem(itemPagina, mapaEmpenhos);
    if (!cfg) {
      updateUI(anoSelecionado, itemPagina, null);
      return;
    }

    updateUI(anoSelecionado, itemPagina, cfg);

    preencherEmpenhosNoPCO(cfg, anoSelecionado);

    const tabela = document.getElementById("tabela_pco");
    if (!tabela) return;

    const obs = new MutationObserver(() => {
      preencherEmpenhosNoPCO(cfg, anoSelecionado);
    });

    obs.observe(tabela, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 300));
  } else {
    setTimeout(init, 300);
  }
})();
