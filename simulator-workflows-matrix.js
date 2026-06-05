"use strict";

/**
 * Sei workflow (L = 3…8): per ogni dimensione matrice si confrontano
 * - competitiva vs Durissima Mater
 * - pesca a fine turno vs pesca a inizio turno
 * con Dura Mater chiusa + inversione turni attive.
 *
 * G da 1 a L; strategie fisse ma rimescolate sui posti ogni partita;
 * ordine iniziale di gioco casuale (G1…Gn = posto al tavolo).
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

  function simulationsPerCase(L) {
    if (L <= 5) return 500;
    if (L === 6) return 450;
    return 400;
  }

  function strategiesForL(L) {
    return STRATEGY_MIX.slice(0, L);
  }

  function buildSteps(L) {
    const count = simulationsPerCase(L);
    const strategies = strategiesForL(L);
    const base = {
      lMin: L,
      lMax: L,
      gMin: 1,
      gMax: L,
      count,
      strategies,
      shuffleStrategiesAmongSeats: true
    };
    const tag = `${L}×${L}`;
    return [
      {
        id: `L${L}-comp-end`,
        label: `${tag} · competitiva · DM+inv · pesca fine · G1–${L}`,
        ...base,
        durissimaMater: false,
        invertTurnOrderOnClose: true,
        drawAtTurnStart: false
      },
      {
        id: `L${L}-comp-start`,
        label: `${tag} · competitiva · DM+inv · pesca inizio · G1–${L}`,
        ...base,
        durissimaMater: false,
        invertTurnOrderOnClose: true,
        drawAtTurnStart: true
      },
      {
        id: `L${L}-duri-end`,
        label: `${tag} · Durissima · DM+inv · pesca fine · G1–${L}`,
        ...base,
        durissimaMater: true,
        invertTurnOrderOnClose: true,
        drawAtTurnStart: false
      },
      {
        id: `L${L}-duri-start`,
        label: `${tag} · Durissima · DM+inv · pesca inizio · G1–${L}`,
        ...base,
        durissimaMater: true,
        invertTurnOrderOnClose: true,
        drawAtTurnStart: true
      }
    ];
  }

  const shared = {
    invertTurnOrderOnClose: true,
    drawAtTurnStart: false,
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: true
  };

  for (let L = 3; L <= 8; L++) {
    const steps = buildSteps(L);
    const cases = 4 * L;
    const perCase = simulationsPerCase(L);
    const total = cases * perCase;
    const stratLabels = strategiesForL(L)
      .map((key, index) => `G${index + 1}=${key}`)
      .join(" ");

    catalog[`matrix-L${L}`] = {
      id: `matrix-L${L}`,
      label: `Matrice ${L}×${L} · audit completo`,
      description:
        `${L}×${L} fisso: ${cases} celle (G=1…${L}) × 4 blocchi regole × ${perCase} partite/cella ≈ ${total.toLocaleString("it-IT")} partite. ` +
        `Competitiva (primo che finisce la mano) e Durissima (matrice piena). ` +
        `DM chiusa + inversione turni; confronto pesca fine turno vs inizio turno. ` +
        `Strategie: ${stratLabels}; ogni partita rimescola strategie sui posti e sorteggia chi inizia. Esporta JSON per analisi.`,
      shared,
      steps,
      matrixGuide: {
        size: L,
        competitive: `step L${L}-comp-*: successPct = vincitore; stallPct = blocco senza vincitore.`,
        durissima: `step L${L}-duri-*: successPct = matrice ${L}×${L} piena; confronta con esaurimento carte al tavolo.`,
        drawRule: `comp-end vs comp-start (idem duri-*): effetto pesca inizio turno su stalli e completamento.`,
        players: `colonne G=1…${L}: con G=L il mazzo di pesca parte spesso vuoto (tutte le ${L * L} carte in mano).`,
        seatRotation:
          "shuffleStrategiesAmongSeats: separa vantaggio posto (G1…Gn) da strategia nel JSON seatStrategyBreakdown."
      }
    };
  }

  window.SIMULATOR_WORKFLOWS = catalog;
})();