"use strict";

if (process.argv.includes("--fast")) process.env.GN_SKIP_ROLLOUT7 = "1";
const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 6;
const seed = Number(process.argv[3]) || 0;
const beforeStep = Number(process.argv[4]) || 50;
const maxNodes = Number(process.argv[5]) || 800000;

const deck = C.simulationDeck();
const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
const strategies = Array.from({ length: L }, () => "durissima-global-planner");
const state = C.setupGame(deck, {
  size: L, players: L, random,
  durissimaMater: true, durissimaVitaExtraEnabled: false,
  randomizeTurnOrder: true, strategies
});

let step = 0;
while (state.status === "playing" && step < beforeStep - 1) {
  step++;
  C.botStep(state, strategies, random);
}

process.stdout.write(
  "from step " + beforeStep + " fill=" + state.board.length
    + " matching=" + C.gnIdealFillMatchingPossible(state)
    + " emptyIdeal=" + C.gnEmptyCellsInIdealGrid(state) + "\n"
);

const outcome = C.solveGnStateOutcome(state, {
  maxNodes,
  branchLimit: 28,
  moveNodeLimit: 120000,
  trackAction: true
});
process.stdout.write(
  "DFS " + outcome.result + " nodes=" + outcome.stats.nodes
    + (outcome.action
      ? " action=" + outcome.action.type
        + (outcome.action.move
          ? " " + outcome.action.move.card.code + "@(" + outcome.action.move.x + "," + outcome.action.move.y + ")"
          : "")
      : "")
    + "\n"
);