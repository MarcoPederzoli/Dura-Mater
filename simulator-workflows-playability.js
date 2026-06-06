"use strict";

/**
 * Audit giocabilità: tutte le L×G valide (≥3 carte a testa, G≤21).
 * Misura se la partita finisce prima che giochino gli ultimi al tavolo.
 */
(function registerPlayabilityWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  const countPerCell = 300;

  const shared = {
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: false
  };

  const steps = [];
  let totalCells = 0;

  for (let L = 3; L <= 8; L++) {
    const gMax = MPCardsCore.maxPlayersForSize(L);
    totalCells += gMax;
    steps.push({
      id: `playability-L${L}`,
      label: `${L}×${L} · G1–${gMax} · P`,
      count: countPerCell,
      lMin: L,
      lMax: L,
      gMin: 1,
      gMax,
      strategy: "planner"
    });
  }

  const totalPartite = totalCells * countPerCell;

  catalog["playability-audit"] = {
    id: "playability-audit",
    label: "Giocabilità · matrice completa L×G",
    description:
      "Ogni cella valida (min 3 carte a testa, max G fisico per griglia): da 3×3 G1–3 fino a 8×8 G1–21. " +
      `${totalCells} celle × ${countPerCell} partite ≈ ${totalPartite.toLocaleString("it-IT")} simulazioni (P). ` +
      "Confronta «Ultimo posa» e «Tutti posano» per capire quali formati hanno senso al tavolo.",
    shared,
    steps,
    playabilityGuide: {
      question:
        "Quali combinazioni L×G sono «realmente giocabili», cioè la partita non finisce sistematicamente prima che giochino gli ultimi?",
      scope:
        "Tutte le configurazioni ammesse dalle regole attuali (non solo G>L). Leggi cells[\"LxG\"] nel JSON o la tabella turni.",
      read:
        "cells[\"8x21\"].gamesLastPlayerPlaced / done × 100 = % in cui l'ultimo nel turno iniziale posa almeno una carta. " +
        "cells[\"8x21\"].gamesAllPlayersPlaced / done = % in cui tutti posano almeno una carta. " +
        "cells[\"LxG\"]: totalPlacementsSum/done/G = carte posate medie per giocatore; " +
        "gamesWithOnePlacementPlayer/done = % partite con qualcuno a 1 sola posa; " +
        "gamesEveryoneAtLeastTwoPlacements/done = % con tutti ≥2 pose. " +
        "minPlacementsPerGameSum/done = minimo pose in partita (media).",
      metrics:
        "Partecipazione reale: avgCardsPlacedPerPlayer, onePlacementPlayerGamePct, everyoneAtLeastTwoPlacementsPct, avgMinPlacementsPerGame. " +
        "Soglie indicative: zeroPlacementPlayerGamePct ≈0%, onePlacementPlayerGamePct basso, tutti ≥2 pose ≥80%. " +
        "Confronta G≤N vs G>N e tetto orientativo G≤2N.",
      verdict:
        "Il tetto fisico G non basta: una cella può essere «legale» ma ingestibile se l'ultimo nel turno quasi non posa mai. " +
        "Usa la colonna G della stessa L per vedere dove crolla la partecipazione.",
      params:
        "Competitiva, ordine casuale, P. Massimo ammesso G=2N; consigliato G=N (recommendedMaxPlayers)."
    }
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();