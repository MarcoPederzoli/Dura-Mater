"use strict";

/**
 * Durissima Mater: probe completamento griglia con le regole attuali (solo + multi).
 * Campagna bilanciamento in PAUSA (giu 2026) — vedi scripts/BILANCIAMENTO-PAUSA.md.
 */
(function registerDurissimaWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};

  const shared = {
    durissimaMater: true,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: false
  };

  const rulesProbeGuide = {
    question:
      "Con le regole Durissima formalizzate, quante partite completano la matrice (solitario e multi)?",
    scope:
      "Core Durissima: Dura Mater + pesca solo dopo posa + vittoria a griglia piena. " +
      "Niente vite extra, riserva o buffer (default). Monte se G pass senza posate. Bot coop: durissima-team-planner.",
    read: "cells[\"LxG\"]: successPct = (done - stalls) / done. Confronta G=1 vs G=N vs overcrowd.",
    metrics:
      "Se successPct resta sotto ~1-5% ovunque, le regole vanno ripensate. Solitario  è il caso più facile.",
    verdict:
      "Esporta JSON e analizza con python scripts/analyze-durissima-rules-probe.py",
    params: "T (durissima-team-planner) in coop, G in solitario; ordine casuale; nessun aiuto reattivo."
  };

  const rulesProbeCount = 300;
  const rulesProbeSteps = [];
  let rulesProbePartite = 0;

  for (let L = 3; L <= 8; L++) {
    if (!MPCardsCore.isPlayableSetup(L, 1)) continue;
    rulesProbePartite += rulesProbeCount;
    rulesProbeSteps.push({
      id: `durissima-rules-probe-solo-L${L}`,
      label: `${L} x 1 · solitario`,
      count: rulesProbeCount,
      lMin: L,
      lMax: L,
      gMin: 1,
      gMax: 1,
      allLegal: true,
      strategy: "durissima-planner",
      durissimaMater: true,
      durissimaVitaExtraEnabled: false
    });
  }

  for (const { L, G, note } of [
    { L: 3, G: 2, note: "min multi" },
    { L: 3, G: 3, note: "G=N" },
    { L: 5, G: 3, note: "multi" },
    { L: 5, G: 5, note: "G=N" },
    { L: 5, G: 8, note: "overcrowd" },
    { L: 7, G: 7, note: "G=N" },
    { L: 7, G: 10, note: "overcrowd" },
    { L: 8, G: 8, note: "G=N" },
    { L: 8, G: 16, note: "G=2N" }
  ]) {
    if (!MPCardsCore.isPlayableSetup(L, G)) continue;
    rulesProbePartite += rulesProbeCount;
    rulesProbeSteps.push({
      id: `durissima-rules-probe-${L}x${G}`,
      label: `${L} x ${G} · ${note}`,
      count: rulesProbeCount,
      lMin: L,
      lMax: L,
      gMin: G,
      gMax: G,
      allLegal: true,
      strategy: "durissima-team-planner",
      durissimaMater: true,
      durissimaVitaExtraEnabled: false
    });
  }

  catalog["durissima-rules-probe"] = {
    id: "durissima-rules-probe",
    label: "Durissima · probe regole (in pausa — solo + multi)",
    description:
      "Regole attuali: G=1 L3-8 + 9 formati multi. " +
      `≈ ${rulesProbePartite.toLocaleString("it-IT")} partite (${rulesProbeCount}/cella). Esporta JSON.`,
    shared,
    steps: rulesProbeSteps,
    durissimaGuide: rulesProbeGuide
  };

  const rulesQuickCount = 150;
  const rulesQuickCells = [
    { L: 3, G: 1 },
    { L: 5, G: 1 },
    { L: 5, G: 5 },
    { L: 5, G: 8 },
    { L: 8, G: 8 },
    { L: 8, G: 16 }
  ];
  const rulesQuickSteps = [];
  let rulesQuickPartite = 0;

  for (const { L, G } of rulesQuickCells) {
    if (!MPCardsCore.isPlayableSetup(L, G)) continue;
    rulesQuickPartite += rulesQuickCount;
    rulesQuickSteps.push({
      id: `durissima-rules-quick-${L}x${G}`,
      label: `${L} x ${G}`,
      count: rulesQuickCount,
      lMin: L,
      lMax: L,
      gMin: G,
      gMax: G,
      allLegal: true,
      strategy: G === 1 ? "durissima-planner" : "durissima-team-planner",
      durissimaMater: true,
      durissimaVitaExtraEnabled: false
    });
  }

  catalog["durissima-rules-probe-quick"] = {
    id: "durissima-rules-probe-quick",
    label: "Durissima · probe regole (rapido)",
    description:
      `6 celle rappresentative  x  ${rulesQuickCount} ≈ ${rulesQuickPartite.toLocaleString("it-IT")} partite.`,
    shared,
    steps: rulesQuickSteps,
    durissimaGuide: rulesProbeGuide
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();