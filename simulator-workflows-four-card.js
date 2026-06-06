"use strict";

/**
 * Audit turni da 4 carte: competitiva «normale» (come matrix L*-comp),
 * matrici 3×3…8×8, solo G=3…L.
 */
(function registerFourCardTurnWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  const STRATEGY_MIX = [
    "planner",
    "random",
    "compatibility",
    "high-value",
    "hand-planner",
    "low-value",
    "greedy",
    "adjacent"
  ];

  function simulationsPerCase(L) {
    if (L <= 5) return 500;
    if (L === 6) return 450;
    return 400;
  }

  function strategiesForL(L) {
    return STRATEGY_MIX.slice(0, L);
  }

  function cellsForL(L) {
    return Math.max(0, L - 2);
  }

  const shared = {
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: true
  };

  const steps = [];
  let totalPartite = 0;

  for (let L = 3; L <= 8; L++) {
    const count = simulationsPerCase(L);
    const cells = cellsForL(L);
    totalPartite += cells * count;
    steps.push({
      id: `four-card-L${L}`,
      label: `${L}×${L} · G3–${L} · mix strategie`,
      count,
      lMin: L,
      lMax: L,
      gMin: 3,
      gMax: L,
      strategies: strategiesForL(L),
      shuffleStrategiesAmongSeats: true
    });
  }

  catalog["four-card-turn-audit"] = {
    id: "four-card-turn-audit",
    label: "Turni da 4 carte · G3–8 · tutte le matrici",
    description:
      "Partita competitiva «normale»: DM chiusa + inversione turni, pesca a fine turno, ordine iniziale casuale, " +
      "mix strategie su G1…GL con shuffle sui posti (come audit matrici L*-comp). " +
      "Per ogni L da 3 a 8 simula solo G=3…L (21 celle L×G). " +
      `≈ ${totalPartite.toLocaleString("it-IT")} partite. ` +
      "Leggi % «≥1 turno da 4» nella tabella turni e in analysis.summary.fourCardGamePct nel JSON.",
    shared,
    steps,
    fourCardGuide: {
      question: "Quanto spesso, in partita reale simulata, qualcuno riesce a posare 4 carte in un solo turno?",
      read:
        "Per ogni cella L×G (es. 5x4): cells[\"5x4\"].gamesWithFourCardTurn / cells[\"5x4\"].done × 100. " +
        "Nella UI: tabella «Turni e turni da 4 carte», riga «≥1 turno da 4».",
      aggregate:
        "analysis.summary.fourCardGamePct = % sullo step intero; confronta gli step L3…L8 nel JSON steps[].",
      extra:
        "fourCardTurns = numero totale di turni da 4 nel campione (può essere > partite con ≥1 turno da 4).",
      params:
        "Stessi parametri competitivi delle matrici: niente Durissima, ordine casuale, shuffle strategie tra i posti."
    }
  };

  const plannerShared = {
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: false
  };

  const plannerMinL = 5;
  const plannerCount = 250;
  const plannerCells =
    (plannerMinL - 2) +
    (6 - 2) +
    (7 - 2) +
    (8 - 2);
  const plannerTotal = plannerCells * plannerCount;

  catalog["four-card-planner-audit"] = {
    id: "four-card-planner-audit",
    label: "Turni da 4 carte · solo P · 5×5…8×8",
    description:
      "Verifica rapida con planner (P) su tutti i posti: DM chiusa + inversione, pesca a fine turno, ordine iniziale casuale. " +
      `Salta 3×3 e 4×4 (mani da al più 4 carte: il turno da 4 è impossibile con L=3, impraticabile su L=4). ` +
      `Matrici ${plannerMinL}×${plannerMinL}…8×8, G=3…L (${plannerCells} celle × ${plannerCount} partite ≈ ${plannerTotal.toLocaleString("it-IT")} partite). ` +
      "Confronta fourCardGamePct con il workflow mix strategie.",
    shared: plannerShared,
    steps: [
      {
        id: "four-card-planner-L5-L8",
        label: `${plannerMinL}×${plannerMinL}…8×8 · G3–L · tutti P`,
        count: plannerCount,
        lMin: plannerMinL,
        lMax: 8,
        gMin: 3,
        gMax: 8,
        strategy: "planner"
      }
    ],
    fourCardGuide: {
      question:
        "Con tutti planner, quanto spesso si ottiene almeno un turno da 4 carte (potenziale massimo della strategia P)?",
      skip:
        "Esclusi L=3 (max 3 carte in mano → turno da 4 impossibile) e L=4 (al più 4 carte, griglia troppo piccola per catene da 4 nel campione mix).",
      read:
        "cells[\"8x7\"].gamesWithFourCardTurn / cells[\"8x7\"].done × 100; oppure analysis.summary.fourCardGamePct sullo step.",
      compare:
        "Affianca al workflow «Turni da 4 carte · G3–8 · tutte le matrici» (mix IA): se qui la % è alta e lì ~0, il collo di bottiglia è il mix strategie, non le regole.",
      params: "Solo P, ordine casuale, niente Durissima, niente shuffle (strategia identica su ogni posto)."
    }
  };

  const shootoutShared = {
    durissimaMater: false,
    fixedTurnOrder: false
  };

  const shootoutLMin = 7;
  const shootoutLMax = 8;
  const shootoutGMin = 5;
  const shootoutGMax = 7;
  const shootoutCount = 500;
  const shootoutCells = 6;
  const shootoutPerStep = shootoutCells * shootoutCount;
  const shootoutTotal = shootoutPerStep * 3;

  function shootoutEnvelope() {
    return {
      count: shootoutCount,
      lMin: shootoutLMin,
      lMax: shootoutLMax,
      gMin: shootoutGMin,
      gMax: shootoutGMax
    };
  }

  catalog["four-card-shootout"] = {
    id: "four-card-shootout",
    label: "Turno da 4 · confronto F / P / mix",
    description:
      "Workflow diagnostico finale sulle sole celle dove gli audit precedenti hanno mostrato segnale: " +
      `matrici ${shootoutLMin}×${shootoutLMin} e ${shootoutLMax}×${shootoutLMax}, G=${shootoutGMin}…${shootoutGMax} ` +
      `(6 celle: 7×5…7×7, 8×5…8×7). Tre step identici per griglia e partite (${shootoutCount}/cella), ` +
      "cambia solo l'IA: F (chain-max, massimizza pose nel turno) vs P (planner) vs mix competitivo con shuffle. " +
      `≈ ${shootoutTotal.toLocaleString("it-IT")} partite. ` +
      "Risposta attesa: se anche F resta sotto ~1–2%, il turno da 4 è un evento strutturalmente raro, non un difetto bot.",
    shared: shootoutShared,
    steps: [
      {
        id: "shootout-chain-max",
        label: `${shootoutLMin}–${shootoutLMax}×G${shootoutGMin}–${shootoutGMax} · tutti F`,
        strategy: "chain-max",
        shuffleStrategiesAmongSeats: false,
        ...shootoutEnvelope()
      },
      {
        id: "shootout-planner",
        label: `${shootoutLMin}–${shootoutLMax}×G${shootoutGMin}–${shootoutGMax} · tutti P`,
        strategy: "planner",
        shuffleStrategiesAmongSeats: false,
        ...shootoutEnvelope()
      },
      {
        id: "shootout-mix",
        label: `${shootoutLMin}–${shootoutLMax}×G${shootoutGMin}–${shootoutGMax} · mix + shuffle`,
        strategies: STRATEGY_MIX,
        shuffleStrategiesAmongSeats: true,
        ...shootoutEnvelope()
      }
    ],
    fourCardGuide: {
      question:
        "Il turno da 4 è un obiettivo raggiungibile con IA dedicata, o un raro allineamento di mano, griglia e requisiti 1→2→3→4?",
      scope:
        "Solo 7×5, 7×6, 7×7, 8×5, 8×6, 8×7 — esclusi L≤6 e G≤4 (0% negli audit). Niente solitario.",
      read:
        "Confronta steps[].analysis.summary.fourCardGamePct tra shootout-chain-max, shootout-planner e shootout-mix. " +
        "Poi cells[\"8x7\"] ecc. dentro ogni step.",
      verdict:
        "F ≥ P ≈ mix con % basse (≤2%): limite strutturale delle regole/mazzo. F >> P: P sottosfrutta catene. mix >> F/P: il mix casuale aiuta più dell'ottimizzazione esplicita.",
      params:
        "Competitiva, DM+inversione, pesca fine turno, ordine casuale. 500 partite per cella, stesse 6 celle in tutti e tre gli step."
    }
  };

  const ideaCount = 400;
  const ideaCells = 6;
  const ideaPerStep = ideaCells * ideaCount;
  const ideaEnvelope = {
    count: ideaCount,
    lMin: 7,
    lMax: 8,
    gMin: 5,
    gMax: 7
  };

  catalog["idea-rule-audit"] = {
    id: "idea-rule-audit",
    label: "Regola Idea · verifica 5ª carta",
    description:
      "Testa la regola Idea (quinta carta dopo catena da 4) sulle 6 celle più favorevoli dello shootout " +
      "(7×5…7×7, 8×5…8×7). Due step stessi parametri: tutti F (massimizza catene) e tutti P. " +
      `${ideaCount} partite/cella ≈ ${(ideaPerStep * 2).toLocaleString("it-IT")} partite totali. ` +
      "Nel JSON: fiveCardGamePct, ideaOffers, ideaConversionPct; in tabella turni: «Idea (5ª)» e «Idea usate».",
    shared: {
      durissimaMater: false,
      fixedTurnOrder: false,
      shuffleStrategiesAmongSeats: false
    },
    steps: [
      {
        id: "idea-chain-max",
        label: "7–8×G5–7 · tutti F · Idea on",
        strategy: "chain-max",
        ...ideaEnvelope
      },
      {
        id: "idea-planner",
        label: "7–8×G5–7 · tutti P · Idea on",
        strategy: "planner",
        ...ideaEnvelope
      }
    ],
    ideaGuide: {
      question:
        "Dopo la regola Idea, quante catene da 4 si traducono in una quinta carta? Il premio è percepito come raro ma realizzabile?",
      scope:
        "Solo 7×5, 7×6, 7×7, 8×5, 8×6, 8×7 — stesse celle dello shootout pre-Idea. Competitiva, ordine casuale.",
      read:
        "steps[].analysis.summary: fiveCardGamePct = % partite con ≥1 turno da 5 carte; " +
        "ideaOffers = volte che, dopo 4 pose, restava almeno una carta in mano; " +
        "fiveCardTurns = idee realizzate; ideaConversionPct = fiveCardTurns / ideaOffers.",
      metrics:
        "cells[\"8x7\"].ideaOffers e .fiveCardTurns per cella. Confronta step F vs P: il bot sfrutta l'idea quando offerta?",
      verdict:
        "Conversione alta (es. >50%) con fiveCardGamePct ancora basso: il premio funziona ma il miracolo resta raro. " +
        "Conversione ~0%: bug o bot che non tenta la 5ª. fiveCardGamePct simile a fourCardGamePct pre-regola: poche idee legali."
    }
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();