"use strict";

/**
 * Workflow batch: più blocchi scenario in una sola esecuzione.
 * Ogni step ha propri L/G/count; shared vale per seed, worker, regole DM, mazzo.
 *
 * strategies: array per G1…G8 (o strategy: una sola per tutti).
 * Con ordine iniziale casuale, G1…Gn = posto al tavolo; la strategia resta sul posto.
 */
window.SIMULATOR_WORKFLOWS = {
  "full-sweep": {
    id: "full-sweep",
    label: "Sweep completo (tutti i preset dimensioni)",
    description:
      "Esegue in sequenza: 4×4–6×6, 5×5–6×6, 4×4–8×8, solo 5×5, solo 6×6. Run lunga (~tutte le celle dei preset rapidi).",
    shared: {
      invertTurnOrderOnClose: true,
      drawAtTurnStart: false,
      durissimaMater: false,
      fixedTurnOrder: false
    },
    steps: [
      { id: "scan-456", label: "Sweep 4×4–6×6", count: 500, lMin: 4, lMax: 6, gMin: 2, gMax: 6, strategy: "planner" },
      { id: "scan-56", label: "Sweep 5×5–6×6", count: 500, lMin: 5, lMax: 6, gMin: 2, gMax: 6, strategy: "planner" },
      { id: "scan-468", label: "Sweep 4×4–8×8", count: 300, lMin: 4, lMax: 8, gMin: 2, gMax: 8, strategy: "planner" },
      { id: "solo-55", label: "Solo 5×5 · 4 gioc.", count: 10000, lMin: 5, lMax: 5, gMin: 4, gMax: 4, strategy: "planner" },
      { id: "solo-66", label: "Solo 6×6 · 4–6 gioc.", count: 2000, lMin: 6, lMax: 6, gMin: 4, gMax: 6, strategy: "planner" }
    ]
  },
  "standard-sweep": {
    id: "standard-sweep",
    label: "Sweep standard (4×4–6×6 + 5×5–6×6)",
    description: "Due sweep principali con P su tutti i posti. ~23 casi L×G, 500 partite/caso.",
    shared: {
      invertTurnOrderOnClose: true,
      drawAtTurnStart: false,
      durissimaMater: false,
      fixedTurnOrder: false
    },
    steps: [
      { id: "scan-456", label: "Sweep 4×4–6×6", count: 500, lMin: 4, lMax: 6, gMin: 2, gMax: 6, strategy: "planner" },
      { id: "scan-56", label: "Sweep 5×5–6×6", count: 500, lMin: 5, lMax: 6, gMin: 2, gMax: 6, strategy: "planner" }
    ]
  },
  "seat-strategy-4x4": {
    id: "seat-strategy-4x4",
    label: "Posto vs strategia · 4×4 · 4 gioc.",
    description:
      "Ogni posto ha strategia diversa (P/R/M/A). Ordine iniziale casuale ogni partita: confronta tabella G1…Gn con tabella strategie nel JSON.",
    shared: {
      invertTurnOrderOnClose: true,
      drawAtTurnStart: false,
      durissimaMater: false,
      fixedTurnOrder: false
    },
    steps: [
      {
        id: "mix-4p",
        label: "4×4 · G1=P G2=R G3=M G4=A",
        count: 3000,
        lMin: 4,
        lMax: 4,
        gMin: 4,
        gMax: 4,
        strategies: ["planner", "random", "compatibility", "high-value"]
      }
    ]
  },
  "seat-strategy-55": {
    id: "seat-strategy-55",
    label: "Posto vs strategia · 5×5 · 4 gioc.",
    description: "5×5 con P, H, M, R sui quattro posti. 5000 partite.",
    shared: {
      invertTurnOrderOnClose: true,
      drawAtTurnStart: false,
      durissimaMater: false,
      fixedTurnOrder: false
    },
    steps: [
      {
        id: "mix-5x5",
        label: "5×5 · G1=P G2=H G3=M G4=R",
        count: 5000,
        lMin: 5,
        lMax: 5,
        gMin: 4,
        gMax: 4,
        strategies: ["planner", "hand-planner", "compatibility", "random"]
      }
    ]
  },
  "strategy-matrix": {
    id: "strategy-matrix",
    label: "Matrice strategie su 5×5 e 6×6",
    description:
      "Due step: stesso schema posto/strategia su 5×5 e 6×6 per vedere se il vantaggio segue la strategia o la dimensione.",
    shared: {
      invertTurnOrderOnClose: true,
      drawAtTurnStart: false,
      durissimaMater: false,
      fixedTurnOrder: false
    },
    steps: [
      {
        id: "55-mix",
        label: "5×5 mix",
        count: 2000,
        lMin: 5,
        lMax: 5,
        gMin: 4,
        gMax: 4,
        strategies: ["planner", "random", "compatibility", "high-value"]
      },
      {
        id: "66-mix",
        label: "6×6 mix",
        count: 2000,
        lMin: 6,
        lMax: 6,
        gMin: 4,
        gMax: 4,
        strategies: ["planner", "random", "compatibility", "high-value"]
      }
    ]
  }
};