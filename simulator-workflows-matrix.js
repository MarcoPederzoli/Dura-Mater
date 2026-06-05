"use strict";

/**
 * Sei workflow (L = 3…8): per ogni dimensione matrice
 * - competitiva (G = 1…L)
 * - Durissima Mater (solo G = 1: in tavolo è collaborativo; i bot multi‑giocatore non lo modellano)
 * con Dura Mater chiusa + inversione turni, pesca a fine turno.
 */
(function registerMatrixSizeWorkflows() {
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

  function simulationsPerCase(L, durissima) {
    if (durissima) return L <= 5 ? 500 : L === 6 ? 450 : 400;
    if (L <= 5) return 500;
    if (L === 6) return 450;
    return 400;
  }

  function strategiesForL(L) {
    return STRATEGY_MIX.slice(0, L);
  }

  function buildSteps(L) {
    const strategies = strategiesForL(L);
    const tag = `${L}×${L}`;
    const compCount = simulationsPerCase(L, false);
    const duriCount = simulationsPerCase(L, true);
    const compBase = {
      lMin: L,
      lMax: L,
      gMin: 1,
      gMax: L,
      strategies,
      shuffleStrategiesAmongSeats: true,
      durissimaMater: false,

    };
    return [
      {
        id: `L${L}-comp`,
        label: `${tag} · competitiva · DM+inv · G1–${L}`,
        count: compCount,
        ...compBase
      },
      {
        id: `L${L}-duri`,
        label: `${tag} · Durissima · solitario · DM+inv`,
        count: duriCount,
        lMin: L,
        lMax: L,
        gMin: 1,
        gMax: 1,
        strategy: "planner",
        durissimaMater: true,
  ,
        shuffleStrategiesAmongSeats: false
      }
    ];
  }

  const shared = {

    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: true
  };

  const allSteps = [];

  for (let L = 3; L <= 8; L++) {
    const steps = buildSteps(L);
    allSteps.push(...steps);
    const compCases = L;
    const perComp = simulationsPerCase(L, false);
    const perDuri = simulationsPerCase(L, true);
    const total = compCases * perComp + perDuri;
    const stratLabels = strategiesForL(L)
      .map((key, index) => `G${index + 1}=${key}`)
      .join(" ");

    catalog[`matrix-L${L}`] = {
      id: `matrix-L${L}`,
      label: `Matrice ${L}×${L} · audit completo`,
      description:
        `${L}×${L} fisso: competitiva G=1…${L} (${compCases} celle × ${perComp} partite) + Durissima solitario (${perDuri} partite) ≈ ${total.toLocaleString("it-IT")} partite. ` +
        `DM chiusa + inversione turni; pesca a fine turno. ` +
        `Competitiva: ${stratLabels} con shuffle sui posti. Durissima: solo 1 giocatore (P). Esporta JSON per analisi.`,
      shared,
      steps,
      matrixGuide: {
        size: L,
        competitive: `step L${L}-comp: successPct = vincitore; stallPct = blocco senza vincitore.`,
        durissima:
          `step L${L}-duri: solo G=1 — unica simulazione coerente con Durissima collaborativa al tavolo; successPct = matrice ${L}×${L} piena.`,
        players: `competitiva G=1…${L}; con G=L il mazzo di pesca parte spesso vuoto.`,
        seatRotation:
          "shuffleStrategiesAmongSeats (solo competitiva): separa posto da strategia nel JSON seatStrategyBreakdown."
      }
    };
  }

  const allTotal = allSteps.reduce((sum, step) => {
    const L = step.lMin;
    if (step.durissimaMater) return sum + simulationsPerCase(L, true);
    return sum + L * simulationsPerCase(L, false);
  }, 0);

  catalog["matrix-all-L3-L8"] = {
    id: "matrix-all-L3-L8",
    label: "Tutte le matrici 3×3 … 8×8 (sequenza completa)",
    description:
      "Esegue in sequenza i 12 step (competitiva + Durissima solitario per ogni L). " +
      `≈ ${allTotal.toLocaleString("it-IT")} partite totali. Durissima solo G=1; competitiva G=1…L.`,
    shared,
    steps: allSteps,
    matrixGuide: {
      goal:
        "Competitiva: il gioco termina con vincitore. Durissima: solo solitario misura il completamento matrice reale.",
      competitive: "step L*-comp per ogni G.",
      durissima: "step L*-duri sempre G=1; ignorare Durissima multi‑giocatore nei vecchi export.",
      redFlags:
        "FAIL competitivo: G=2–3 su L 3–5 con stall% ~100%. Durissima: pochi % su L 3–4 possono essere normali."
    }
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();