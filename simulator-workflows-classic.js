"use strict";

/**
 * Audit partita competitiva (normale): tutte le LxG legali da G=1 fino a overcrowd (G<=2N).
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
      "Quali formati LxG sono giocabili in partita competitiva (vincitore, non stallo)?",
    scope:
      "Configurazioni G >= G_min (ceil(N/2), eccezione 7x7->3) fino a overcrowd (G<=2N). " +
      "Esclude sotto-G sconsigliato e solitario. Strategia planner; ordine casuale; DM chiusa + inversione.",
    read:
      "cells[\"LxG\"]: successPct = (done - stalls) / done = % con vincitore. " +
      "gamesAllPlayersPlaced/done = tutti posano almeno una carta. " +
      "gamesLastPlayerPlaced/done = ultimo nel turno iniziale posa. " +
      "dmClosedCount/done = % con Dura Mater chiusa. " +
      "totalPlacementsSum/done/G = carte posate medie per giocatore.",
    metrics:
      "Partita normale: success% alto è buono (poche partite senza vincitore). " +
      "Confronta con la matrice Durissima (completamento griglia): qui la vittoria è svuotare la mano, " +
      "non riempire NxN. Per grafici incrociati usa lo stesso Excel classic-riepilogo.",
    verdict:
      "Se stall% cresce con G su una stessa L, il formato è fragile al tavolo. " +
      "Overcrowd spesso resta giocabile ma con meno pose per giocatore.",
    params: "Competitiva, planner (P), 1000 partite/cella (modificabile nel campo Conteggio)."
  };

  function playableCellsForL(L) {
    const cells = [];
    const gMax = MPCardsCore.maxPlayersForSize(L);
    const gMin = MPCardsCore.recommendedMinPlayers(L);
    for (let G = gMin; G <= gMax; G++) {
      if (MPCardsCore.isDefaultSweepSetup(L, G)) cells.push(G);
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
      const gMin = gList[0];
      const gMax = gList[gList.length - 1];
      steps.push({
        id: `classic-audit-L${L}`,
        label: `${L}x${L} · G${gMin}-${gMax} · competitiva · P`,
        count: countPerCell,
        lMin: L,
        lMax: L,
        gMin,
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
        ` ${cells} celle  x  ${countPerCell} partite ≈ ${totalPartite.toLocaleString("it-IT")} simulazioni. Esporta JSON.`,
      shared,
      steps,
      playabilityGuide: classicGuide
    };
  }

  registerWorkflow(
    "classic-audit-L3-L5",
    "Competitiva ·  -  (G_min → overcrowd)",
    "Griglie ,  e : da G_min consigliato fino a overcrowd.",
    [3, 4, 5]
  );

  registerWorkflow(
    "classic-audit-L6",
    "Competitiva ·  (G_min → overcrowd)",
    "Solo griglia , da G_min (3) fino a overcrowd.",
    [6]
  );

  registerWorkflow(
    "classic-audit-L7",
    "Competitiva ·  (G_min → overcrowd)",
    "Solo griglia , da G_min (3) fino a overcrowd.",
    [7]
  );

  registerWorkflow(
    "classic-audit-L8",
    "Competitiva ·  (G_min → overcrowd)",
    "Solo griglia , da G_min (4) fino a overcrowd.",
    [8]
  );

  window.SIMULATOR_WORKFLOWS = catalog;
})();