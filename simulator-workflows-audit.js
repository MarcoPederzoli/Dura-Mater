"use strict";

/**
 * Audit bilanciamento completo — run lunga (~160k+ partite).
 * Caricato dopo simulator-workflows.js; unisce in SIMULATOR_WORKFLOWS.
 */
(function registerAuditWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  const shared = {
    invertTurnOrderOnClose: true,
    drawAtTurnStart: false,
    durissimaMater: false,
    fixedTurnOrder: false
  };

  const steps = [
    {
      id: "solo-1p",
      label: "Solitario · G=1 · L 3–8",
      count: 2500,
      lMin: 3,
      lMax: 8,
      gMin: 1,
      gMax: 1,
      strategy: "planner"
    },
    {
      id: "matrix-planner",
      label: "Matrice L×G (3–8) · tutti P",
      count: 2000,
      lMin: 3,
      lMax: 8,
      gMin: 1,
      gMax: 8,
      strategy: "planner"
    },
    {
      id: "matrix-random",
      label: "Matrice L×G (3–8) · tutti R",
      count: 1200,
      lMin: 3,
      lMax: 8,
      gMin: 1,
      gMax: 8,
      strategy: "random"
    },
    {
      id: "matrix-hand-planner",
      label: "Matrice L×G (3–8) · tutti H",
      count: 800,
      lMin: 3,
      lMax: 8,
      gMin: 1,
      gMax: 8,
      strategy: "hand-planner"
    },
    {
      id: "mix-44",
      label: "4×4 · G1=P G2=R G3=M G4=A (fisso)",
      count: 4000,
      lMin: 4,
      lMax: 4,
      gMin: 4,
      gMax: 4,
      strategies: ["planner", "random", "compatibility", "high-value"]
    },
    {
      id: "mix-55",
      label: "5×5 · G1=P G2=H G3=M G4=A (fisso)",
      count: 4000,
      lMin: 5,
      lMax: 5,
      gMin: 4,
      gMax: 4,
      strategies: ["planner", "hand-planner", "compatibility", "high-value"]
    },
    {
      id: "mix-66",
      label: "6×6 · G1=P G2=H G3=M G4=R (fisso)",
      count: 4000,
      lMin: 6,
      lMax: 6,
      gMin: 4,
      gMax: 4,
      strategies: ["planner", "hand-planner", "compatibility", "random"]
    },
    {
      id: "rotate-44",
      label: "4×4 · P/R/M/A rimescolati sui posti ogni partita",
      count: 12000,
      lMin: 4,
      lMax: 4,
      gMin: 4,
      gMax: 4,
      strategies: ["planner", "random", "compatibility", "high-value"],
      shuffleStrategiesAmongSeats: true
    },
    {
      id: "rotate-55",
      label: "5×5 · P/H/M/A rimescolati sui posti ogni partita",
      count: 10000,
      lMin: 5,
      lMax: 5,
      gMin: 4,
      gMax: 4,
      strategies: ["planner", "hand-planner", "compatibility", "high-value"],
      shuffleStrategiesAmongSeats: true
    },
    {
      id: "rotate-66",
      label: "6×6 · P/H/M/R rimescolati sui posti ogni partita",
      count: 10000,
      lMin: 6,
      lMax: 6,
      gMin: 4,
      gMax: 4,
      strategies: ["planner", "hand-planner", "compatibility", "random"],
      shuffleStrategiesAmongSeats: true
    }
  ];

  const cellsMatrix = 33;
  const total =
    6 * 2500 +
    cellsMatrix * 2000 +
    cellsMatrix * 1200 +
    cellsMatrix * 800 +
    4000 * 3 +
    12000 +
    10000 + 10000;

  catalog["balance-audit-master"] = {
    id: "balance-audit-master",
    label: "Audit bilanciamento MASTER (run lunga)",
    description:
      "Audit completo competitivo, ordine casuale, mazzo ufficiale. " +
      "~" + total.toLocaleString("it-IT") + " partite: solitario 3–8, matrice 33 celle×(P/R/H), mix e rotazione strategie su 4×4/5×5/6×6. " +
      "Esporta JSON e incollalo in chat. Stalli = difficoltà, non bug. Cerca: % successo vs L, celle irrisolvibili, spread posto (tutti P) vs strategia (mix/rotate).",
    shared,
    steps,
    auditGuide: {
      solvability: "step solo-1p: successPct per 3×1…8×1 (anche 5% va bene).",
      difficultyScale:
        "steps matrix-*: per ogni L confronta successPct/stallPct medi (rowTotals) — deve peggiorare o non migliorare eccessivamente con L↑.",
      seatFairness:
        "matrix-planner: spread posizione G1…Gn per cella (atteso ~±5 pt se equo).",
      strategyPower:
        "mix-*: strategie fisse sui posti. rotate-*: shuffleStrategiesAmongSeats — separa posto vs strategia.",
      ignore: "Non penalizzare stalli alti se restano giochi ragionati (es. 5×3)."
    }
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();