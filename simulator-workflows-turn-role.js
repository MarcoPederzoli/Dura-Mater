"use strict";

/**
 * Audit equità ruolo nel turno con regola ufficiale (inversione ai limiti DM).
 */
(function registerTurnRoleWorkflows() {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  const shared = {
    durissimaMater: false,
    shuffleStrategiesAmongSeats: false,
    fixedTurnOrder: false
  };

  const count = 220;
  const cells = 3 + 4 + 5 + 6 + 7 + 8;
  const totalPartite = cells * count;

  catalog["turn-role-audit"] = {
    id: "turn-role-audit",
    label: "Equità ruolo nel turno (audit)",
    description:
      "Stessa IA (planner) su tutti i posti, matrici 3×3…8×8, G=1…L, ordine iniziale casuale. Regola: inversione a ciascun limite della Dura Mater. " +
      "~" + totalPartite.toLocaleString("it-IT") + " partite. Esporta JSON → chat.",
    shared,
    steps: [
      {
        id: "role-planner-rand",
        label: "Planner · ordine casuale · inversione ai limiti DM",
        count,
        lMin: 3,
        lMax: 8,
        gMin: 1,
        gMax: 8,
        strategy: "planner",
        fixedTurnOrder: false
      }
    ],
    initialTurnGuide: {
      question:
        "Con inversione ai limiti DM, il ruolo 1°/2°/… nel turno è accettabile in una sola partita?",
      read:
        "Per scenario L×L con G=L: spread initialTurn <6 pt ≈ equo; 6–15 moderato; oltre = forte. Ignora totali aggregati G=1…8.",
      fair:
        "Posto G1…Gn dovrebbe restare piatto; se solo initialTurn è sbilanciato, il problema è il turno, non il sedile."
    }
  };

  window.SIMULATOR_WORKFLOWS = catalog;
})();