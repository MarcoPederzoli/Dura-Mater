"use strict";

/**
 * Audit G > L: distribuzione equa (floor(N²/G) carte) e partecipazione in partita.
 */
(function registerOvercrowdWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  const countPerCell = 400;

  const shared = {
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: false
  };

  const overcrowdSteps = [];
  let overcrowdCells = 0;

  for (let L = 3; L <= 8; L++) {
    const gMax = MPCardsCore.maxPlayersForSize(L);
    if (L + 1 > gMax) continue;
    const cells = gMax - L;
    overcrowdCells += cells;
    overcrowdSteps.push({
      id: `overcrowd-L${L}`,
      label: `${L}×${L} · G${L + 1}–${gMax} · P`,
      count: countPerCell,
      lMin: L,
      lMax: L,
      gMin: L + 1,
      gMax,
      strategy: "planner"
    });
  }

  const baselineSteps = [];
  for (let L = 3; L <= 8; L++) {
    baselineSteps.push({
      id: `overcrowd-baseline-L${L}`,
      label: `${L}×${L} · G=${L} · baseline P`,
      count: countPerCell,
      lMin: L,
      lMax: L,
      gMin: L,
      gMax: L,
      strategy: "planner"
    });
  }

  const totalPartite =
    overcrowdCells * countPerCell + baselineSteps.length * countPerCell;

  catalog["overcrowd-audit"] = {
    id: "overcrowd-audit",
    label: "G > L · distribuzione equa · audit",
    description:
      "Esplora configurazioni con più giocatori del lato matrice: mano iniziale floor(L²/G), resto in pesca. " +
      "Step 1: per ogni L, solo G>L fino al massimo ammesso (≥3 carte a testa). Step 2: baseline G=L. " +
      `≈ ${totalPartite.toLocaleString("it-IT")} partite (P su tutti i posti). ` +
      "Leggi «Tutti posano» e analysis.summary.allPlayersPlacedPct nel JSON.",
    shared,
    steps: [...overcrowdSteps, ...baselineSteps],
    overcrowdGuide: {
      question:
        "Con G > L la partita resta giocabile? Quanti giocatori posano almeno una carta prima della fine?",
      scope:
        "Solo celle con G > L negli step overcrowd-L*; confronta con overcrowd-baseline-L* (G = L, mano = L carte).",
      read:
        "cells[\"5x7\"].gamesAllPlayersPlaced / cells[\"5x7\"].done × 100 = % partite in cui tutti hanno posato. " +
        "cells[\"5x7\"].playersPlacedSum / done = media giocatori che posano. " +
        "initialHandSize e initialDrawCount descrivono il deal (es. 5×7 → 3 carte, pesca 4).",
      metrics:
        "analysis.summary.allPlayersPlacedPct e avgPlayersPlaced aggregano lo step attivo. " +
        "Confronta successPct e stallPct overcrowd vs baseline per lo stesso L.",
      verdict:
        "Se allPlayersPlacedPct crolla o successPct è molto sotto il baseline G=L, il formato è fragile per il tavolo reale.",
      params: "Competitiva, ordine casuale, strategia P; minimo 3 carte a testa (es. 3×3 max G=3, 8×8 max G=21)."
    }
  };

  const extremeCells = [
    { L: 5, G: 7 },
    { L: 5, G: 10 },
    { L: 6, G: 10 },
    { L: 7, G: 12 },
    { L: 8, G: 12 },
    { L: 8, G: 16 }
  ];
  const extremeCount = 600;
  const extremeSteps = extremeCells.map(({ L, G }) => ({
    id: `overcrowd-${L}x${G}`,
    label: `${L}×${L} · G${G} · P`,
    count: extremeCount,
    lMin: L,
    lMax: L,
    gMin: G,
    gMax: G,
    strategy: "planner"
  }));

  catalog["overcrowd-extreme"] = {
    id: "overcrowd-extreme",
    label: "G > L · celle estreme (5×7 … 8×16)",
    description:
      "Sei configurazioni «stress» con molti giocatori su griglie piccole/medie. " +
      `${extremeCells.length} celle × ${extremeCount} partite ≈ ${(extremeCells.length * extremeCount).toLocaleString("it-IT")} simulazioni.`,
    shared,
    steps: extremeSteps,
    overcrowdGuide: catalog["overcrowd-audit"].overcrowdGuide
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();