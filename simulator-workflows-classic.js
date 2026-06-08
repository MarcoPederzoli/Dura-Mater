"use strict";

/**
 * Audit partita competitiva (normale): tutte le L×G legali da G=1 fino a overcrowd (G≤2N).
 * Workflow spezzati per fascia di griglia, così si possono lanciare separatamente.
 */
(function registerClassicWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};

  const shared = {
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: false
  };

  const countPerCell = 1000;

  const classicGuide = {
    question:
      "Quali formati L×G sono giocabili in partita competitiva (vincitore, non stallo)?",
    scope:
      "Tutte le configurazioni ammesse (min 3 carte a testa, G≤2N): solitario, sotto-G, G=N, overcrowd. " +
      "Strategia planner su tutti i posti; ordine iniziale casuale; DM chiusa + inversione turni.",
    read:
      "cells[\"LxG\"]: successPct = (done - stalls) / done = % con vincitore. " +
      "gamesAllPlayersPlaced/done = tutti posano almeno una carta. " +
      "gamesLastPlayerPlaced/done = ultimo nel turno iniziale posa. " +
      "dmClosedCount/done = % con Dura Mater chiusa. " +
      "totalPlacementsSum/done/G = carte posate medie per giocatore.",
    metrics:
      "Partita normale: success% alto è buono (poche partite senza vincitore). " +
      "Confronta con la matrice Durissima (completamento griglia): qui la vittoria è svuotare la mano, " +
      "non riempire N×N. Per grafici incrociati usa lo stesso Excel classic-riepilogo.",
    verdict:
      "Se stall% cresce con G su una stessa L, il formato è fragile al tavolo. " +
      "Overcrowd spesso resta giocabile ma con meno pose per giocatore.",
    params: "Competitiva, planner (P), 1000 partite/cella (modificabile nel campo Conteggio)."
  };

  function playableCellsForL(L) {
    const cells = [];
    const gMax = MPCardsCore.maxPlayersForSize(L);
    for (let G = 1; G <= gMax; G++) {
      if (MPCardsCore.isPlayableSetup(L, G)) cells.push(G);
    }
    return cells;
  }

  function buildStepsForSizes(sizes) {
    const steps = [];
    let cells = 0;
    for (const L of sizes) {
      const gList = playableCellsForL(L);
      if (!gList.length) continue;
      cells += gList.length;
      const gMax = gList[gList.length - 1];
      steps.push({
        id: `classic-audit-L${L}`,
        label: `${L}×${L} · G1–${gMax} · competitiva · P`,
        count: countPerCell,
        lMin: L,
        lMax: L,
        gMin: 1,
        gMax,
        strategy: "planner"
      });
    }
    return { steps, cells };
  }

  function registerWorkflow(id, label, description, sizes) {
    const { steps, cells } = buildStepsForSizes(sizes);
    const totalPartite = cells * countPerCell;
    catalog[id] = {
      id,
      label,
      description:
        description +
        ` ${cells} celle × ${countPerCell} partite ≈ ${totalPartite.toLocaleString("it-IT")} simulazioni. Esporta JSON.`,
      shared,
      steps,
      playabilityGuide: classicGuide
    };
  }

  registerWorkflow(
    "classic-audit-L3-L5",
    "Competitiva · 3×3 – 5×5 (G1 → overcrowd)",
    "Griglie 3×3, 4×4 e 5×5: ogni G ammesso da solitario fino a overcrowd.",
    [3, 4, 5]
  );

  registerWorkflow(
    "classic-audit-L6",
    "Competitiva · 6×6 (G1 → overcrowd)",
    "Solo griglia 6×6, tutti i G legali.",
    [6]
  );

  registerWorkflow(
    "classic-audit-L7",
    "Competitiva · 7×7 (G1 → overcrowd)",
    "Solo griglia 7×7, tutti i G legali.",
    [7]
  );

  registerWorkflow(
    "classic-audit-L8",
    "Competitiva · 8×8 (G1 → overcrowd)",
    "Solo griglia 8×8, tutti i G legali.",
    [8]
  );

  window.SIMULATOR_WORKFLOWS = catalog;
})();