"use strict";

/**
 * Trova il primo step in cui la posizione G=N diventa irrecuperabile (fill matching false).
 * Uso: node scripts/diag-gn-fatal-turn.js [L] [seed]
 */

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 5;
const seed = process.argv[3] !== undefined ? Number(process.argv[3]) : 5;
const deck = C.simulationDeck();
const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
const strategies = Array.from({ length: L }, () => "durissima-global-planner");

const state = C.setupGame(deck, {
  size: L,
  players: L,
  random,
  durissimaMater: true,
  durissimaVitaExtraEnabled: false,
  randomizeTurnOrder: true,
  strategies
});

let step = 0;
let fatalStep = null;
let fatalFill = null;
let fatalMissing = null;

function missingCells(st) {
  const map = new Set(st.board.map(e => e.x + "," + e.y));
  const out = [];
  for (let y = 0; y < st.size; y++) {
    for (let x = 0; x < st.size; x++) {
      if (!map.has(x + "," + y)) out.push({ x, y });
    }
  }
  return out;
}

while (state.status === "playing" && step++ < 3000) {
  const ok = C.gnIdealFillMatchingPossible(state);
  if (!ok && fatalStep == null) {
    fatalStep = step;
    fatalFill = state.board.length;
    fatalMissing = missingCells(state);
  }
  const before = state.board.length;
  const last = state.board[state.board.length - 1];
  const action = C.botStep(state, strategies, random);
  if (action.played && state.board.length > before) {
    const placed = state.board[state.board.length - 1];
    if (fatalStep === step) {
      process.stdout.write(
        "Mossa fatale: P" + placed.playerId + " " + placed.card.code + "@" + placed.x + "," + placed.y + "\n"
      );
    }
  } else if (fatalStep === step) {
    process.stdout.write("Step fatale senza nuova posa (action=" + JSON.stringify(action) + ")\n");
  }
  void last;
}

process.stdout.write("\n=== FATAL TURN seed=" + seed + " L=" + L + " ===\n");
process.stdout.write("status: " + state.status + " fill: " + state.board.length + "/" + (L * L) + "\n");
if (fatalStep != null) {
  process.stdout.write("primo step irrecuperabile: " + fatalStep + " (fill " + fatalFill + "/" + (L * L) + ")\n");
  process.stdout.write(
    "vuote allora: " + fatalMissing.map(c => "(" + c.x + "," + c.y + ")").join(" ") + "\n"
  );
} else {
  process.stdout.write("nessun step con fill matching impossibile prima dello stallo/vittoria\n");
}
const miss = missingCells(state);
process.stdout.write("vuote finali: " + miss.map(c => "(" + c.x + "," + c.y + ")").join(" ") + "\n");