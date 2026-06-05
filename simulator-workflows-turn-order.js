"use strict";

/**
 * Audit ordine di gioco con regola ufficiale (inversione ai limiti della Dura Mater).
 */
(function registerTurnOrderWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  const shared = {
    durissimaMater: false,
    fixedTurnOrder: false,
    shuffleStrategiesAmongSeats: false
  };

  const count = 180;
  const cells = 3 + 4 + 5 + 6 + 7 + 8;
  const totalPartite = cells * count;

  catalog["turn-order-same-strategy"] = {
    id: "turn-order-same-strategy",
    label: "Ordine di gioco · stessa strategia",
    description:
      "Planner su tutti i posti, ordine iniziale casuale, matrici 3×3…8×8, G=1…L. Inversione alla chiusura di ciascun limite della Dura Mater. " +
      "~" + totalPartite.toLocaleString("it-IT") + " partite (" + count + " per cella). Esporta JSON.",
    shared,
    steps: [
      {
        id: "rand-P",
        label: "Tutti planner · ordine casuale",
        count,
        lMin: 3,
        lMax: 8,
        gMin: 1,
        gMax: 8,
        strategy: "planner"
      }
    ],
    turnOrderGuide: {
      read:
        "Per ogni L guarda analysis.initialTurn su scenario G=L. Spread vittorie per ruolo nel turno vs parità 100/G %.",
      realistic:
        "Ordine iniziale casuale ogni partita; regola fissa inversione ai due limiti DM."
    }
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();