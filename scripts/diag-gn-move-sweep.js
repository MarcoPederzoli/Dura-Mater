"use strict";

/**
 * Prova ogni mossa legale non-breaking a uno step e misura esito partita.
 * Uso: node scripts/diag-gn-move-sweep.js [L] [seed] [step]
 */

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 6;
const seed = Number(process.argv[3]) || 0;
const forceStep = Number(process.argv[4]) || 37;

function missingCells(st) {
  const map = new Set(st.board.map(e => e.x + "," + e.y));
  const out = [];
  for (let y = 0; y < st.size; y++) {
    for (let x = 0; x < st.size; x++) {
      if (!map.has(x + "," + y)) out.push("(" + x + "," + y + ")");
    }
  }
  return out;
}

function setup() {
  const deck = C.simulationDeck();
  const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
  const strategies = Array.from({ length: L }, () => "durissima-global-planner");
  const state = C.setupGame(deck, {
    size: L, players: L, random,
    durissimaMater: true, durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true, strategies
  });
  let step = 0;
  while (state.status === "playing" && step < forceStep - 1) {
    step++;
    C.botStep(state, strategies, random);
  }
  return { state, random, strategies };
}

const { state, random, strategies } = setup();
const pid = state.currentPlayer;
const req = C.placementRequirement(state);
const moves = C.legalPlacements(state, pid, req)
  .filter(m => !C.gnMoveBreaksIdealFillPlan(state, pid, m));

process.stdout.write(
  "step=" + forceStep + " P" + pid + " candidates=" + moves.length + "\n"
);

for (const move of moves) {
  const deck = C.simulationDeck();
  const rng = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
  const strats = Array.from({ length: L }, () => "durissima-global-planner");
  const st = C.setupGame(deck, {
    size: L, players: L, random: rng,
    durissimaMater: true, durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true, strategies: strats
  });
  let step = 0;
  while (st.status === "playing" && step++ < 5000) {
    if (step === forceStep) {
      C.applyPlacement(st, pid, move);
      if (st.status !== "playing") break;
      if (st.turnPlayed >= 5) C.endTurn(st);
      continue;
    }
    C.botStep(st, strats, rng);
  }
  process.stdout.write(
    move.card.code + "@(" + move.x + "," + move.y + ") -> "
      + st.status + " " + st.board.length + "/" + (L * L)
      + (st.board.length < L * L ? " empty=" + missingCells(st).join(" ") : "")
      + "\n"
  );
}