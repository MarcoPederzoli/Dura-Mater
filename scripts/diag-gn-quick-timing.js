"use strict";

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 7;
const seed = Number(process.argv[3]) ?? 0;
const maxSteps = Number(process.argv[4]) || 100;

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

const t0 = Date.now();
let step = 0;
while (state.status === "playing" && step++ < maxSteps) {
  const ts = Date.now();
  C.botStep(state, strategies, random);
  const dt = Date.now() - ts;
  if (dt > 2000) {
    process.stdout.write("slow step " + step + ": " + dt + "ms fill=" + state.board.length + "\n");
  }
}
process.stdout.write(
  "done steps=" + step + " fill=" + state.board.length + "/" + (L * L)
    + " ms=" + (Date.now() - t0) + "\n"
);