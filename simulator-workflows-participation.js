"use strict";

/**
 * Audit partecipazione reale: quante carte posa ciascun giocatore.
 * Audit partecipazione su tutti i formati ammessi (G ≤ 2N).
 */
(function registerParticipationWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  const countWithin = 400;
  const countStress = 800;

  const shared = {
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: false
  };

  const withinSteps = [];
  let withinCells = 0;

  for (let L = 3; L <= 8; L++) {
    const gMax = MPCardsCore.maxPlayersForSize(L);
    let within = 0;
    for (let G = 1; G <= gMax; G++) {
      if (MPCardsCore.isPlayableSetup(L, G)) within++;
    }
    withinCells += within;
    withinSteps.push({
      id: `participation-within-2n-L${L}`,
      label: `${L}×${L} · G1–${gMax} (≤2N) · P`,
      count: countWithin,
      lMin: L,
      lMax: L,
      gMin: 1,
      gMax,
      strategy: "planner"
    });
  }

  const stressCells = [
    { L: 3, G: 3, note: "classico minimo" },
    { L: 4, G: 4, note: "classico" },
    { L: 5, G: 5, note: "classico G=N" },
    { L: 5, G: 7, note: "overcrowd 3 carte" },
    { L: 5, G: 8, note: "overcrowd vicino 2N" },
    { L: 6, G: 6, note: "classico" },
    { L: 6, G: 10, note: "overcrowd" },
    { L: 6, G: 12, note: "overcrowd G=2N" },
    { L: 7, G: 7, note: "classico" },
    { L: 7, G: 14, note: "overcrowd G=2N" },
    { L: 8, G: 8, note: "classico" },
    { L: 8, G: 16, note: "overcrowd G=2N" }
  ];

  const stressSteps = stressCells.map(({ L, G, note }) => ({
    id: `participation-stress-${L}x${G}`,
    label: `${L}×${L} · G${G} · ${note}`,
    count: countStress,
    lMin: L,
    lMax: L,
    gMin: G,
    gMax: G,
    strategy: "planner"
  }));

  const totalWithin = withinCells * countWithin;
  const totalStress = stressCells.length * countStress;
  const totalPartite = totalWithin + totalStress;

  catalog["participation-audit"] = {
    id: "participation-audit",
    label: "Partecipazione · audit completo (G ≤ 2N)",
    description:
      "Misura quanto gioca davvero ogni giocatore (carte posate, esclusi, «1 sola posa», tutti ≥2 pose). " +
      `Step 1: tutte le celle ammesse (${withinCells} celle × ${countWithin} ≈ ${totalWithin.toLocaleString("it-IT")}). ` +
      `Step 2: ${stressCells.length} casi stress × ${countStress} ≈ ${totalStress.toLocaleString("it-IT")}. ` +
      `Totale ≈ ${totalPartite.toLocaleString("it-IT")} partite (P, ordine casuale). Esporta JSON e passalo all'assistente.`,
    shared,
    steps: [...withinSteps, ...stressSteps],
    participationGuide: {
      question:
        "Quanto giocano davvero tutti al tavolo nei formati ammessi (G ≤ 2N)?",
      scope:
        "Step within-2n-L*: G da 1 a 2L (solo celle con almeno 3 carte a testa). " +
        "Step stress: classico G=N, overcrowd e G=2N.",
      read:
        "Per cella cells[\"LxG\"]: totalPlacementsSum/done/G = carte posate medie per giocatore; " +
        "gamesWithOnePlacementPlayer/done = % partite con qualcuno a 1 sola carta sul tavolo; " +
        "gamesEveryoneAtLeastTwoPlacements/done = % con tutti ≥2 pose; " +
        "gamesWithZeroPlacementPlayer/done = % con almeno un escluso; " +
        "minPlacementsPerGameSum/done = minimo pose in partita (media). " +
        "analysis.summary aggrega lo step attivo.",
      metrics:
        "Soglie orientative per formato «da tavolo»: zeroPlacementPlayerGamePct ≈0%, onePlacementPlayerGamePct basso, " +
        "everyoneAtLeastTwoPlacementsPct ≥80%, avgMinPlacementsPerGame ≥2. " +
        "Confronta G=N vs overcrowd per la stessa L.",
      verdict:
        "Il tetto G≤2N è la regola ammessa. G=N resta il formato consigliato (senza mazzo). " +
        "Le inversioni DM mitigano il vantaggio iniziale ma non compensano partecipazione insufficiente in overcrowd estremo.",
      params:
        "Competitiva, ordine casuale, P su tutti i posti. Dopo il run: python scripts/analyze-participation-audit.py sul JSON esportato."
    }
  };

  catalog["participation-quick"] = {
    id: "participation-quick",
    label: "Partecipazione · prova rapida (G≤2N + stress)",
    description:
      "Versione leggera per verificare le metriche nuove prima del run completo: " +
      "G≤2N su L=5–8 (100 partite/cella) + 6 casi stress (200 partite). ≈ 2.500 partite.",
    shared,
    steps: [
      ...[5, 6, 7, 8].map(L => ({
        id: `participation-quick-within-L${L}`,
        label: `${L}×${L} · G1–${Math.min(2 * L, MPCardsCore.maxPlayersForSize(L))} · P`,
        count: 100,
        lMin: L,
        lMax: L,
        gMin: 1,
        gMax: Math.min(2 * L, MPCardsCore.maxPlayersForSize(L)),
        strategy: "planner"
      })),
      ...[
        { L: 5, G: 8 },
        { L: 7, G: 14 },
        { L: 8, G: 16 }
      ].map(({ L, G }) => ({
        id: `participation-quick-${L}x${G}`,
        label: `${L}×${L} · G${G} · stress`,
        count: 200,
        lMin: L,
        lMax: L,
        gMin: G,
        gMax: G,
        strategy: "planner"
      }))
    ],
    participationGuide: catalog["participation-audit"].participationGuide
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();