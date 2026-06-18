"use strict";

const path = require("node:path");
const fs = require("node:fs");
const corePath = path.join(__dirname, "..", "mpcards-core.js");
let src = fs.readFileSync(corePath, "utf8");
src = src.replace(
  "globalThis.MPCardsCore = {",
  "globalThis._rank = gnMoveRank; globalThis._ordered = gnOrderedMoves; globalThis._solverList = gnSolverMoveList; globalThis.MPCardsCore = {"
);
eval(src);

const rank = globalThis._rank;
const ordered = globalThis._ordered;
const solverList = globalThis._solverList;
const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 6;
const seed = Number(process.argv[3]) || 0;
const beforeStep = Number(process.argv[4]) || 37;

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

const pid = state.currentPlayer;
const req = C.placementRequirement(state);
let moves = C.legalPlacements(state, pid, req);
moves = moves.filter(m => !C.gnMoveBreaksIdealFillPlan(state, pid, m));
const branchLimit = 28;
const ranked = ordered(state, pid, moves, branchLimit, {});
process.stdout.write("solverList top:\n");
for (const m of solverList(state, pid, branchLimit, {})) {
  process.stdout.write("  " + m.card.code + "@(" + m.x + "," + m.y + ")\n");
}
process.stdout.write("ranked safe:\n");
for (const m of moves) {
  process.stdout.write(
    "  " + m.card.code + "@(" + m.x + "," + m.y + ") score=" + rank(state, pid, m, {})
      + " inList=" + ranked.some(r => r.card.uid === m.card.uid && r.x === m.x && r.y === m.y) + "\n"
  );
}