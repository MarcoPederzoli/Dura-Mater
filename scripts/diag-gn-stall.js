"use strict";

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 6;
const seed = process.argv[3] !== undefined ? Number(process.argv[3]) : 0;

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
while (state.status === "playing" && step++ < 5000) {
  C.botStep(state, strategies, random);
}

const filled = new Set(state.board.map(e => e.x + "," + e.y));
const empty = [];
for (let x = 0; x < L; x++) {
  for (let y = 0; y < L; y++) {
    if (!filled.has(x + "," + y)) empty.push("(" + x + "," + y + ")");
  }
}
process.stdout.write("seed " + seed + ": " + state.status + " " + state.board.length + "/" + (L * L) + " steps=" + step + "\n");
process.stdout.write("empty: " + empty.join(" ") + "\n");