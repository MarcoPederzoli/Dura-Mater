"use strict";

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 6;
const seed = Number(process.argv[3]) || 0;
const from = Number(process.argv[4]) || 30;
const to = Number(process.argv[5]) || 40;

const deck = C.simulationDeck();
const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
const strategies = Array.from({ length: L }, () => "durissima-global-planner");
const state = C.setupGame(deck, {
  size: L, players: L, random,
  durissimaMater: true, durissimaVitaExtraEnabled: false,
  randomizeTurnOrder: true, strategies
});

let step = 0;
while (state.status === "playing" && step++ < 5000) {
  const pid = state.currentPlayer;
  const before = state.board.length;
  const tp = state.turnPlayed;
  const req = C.placementRequirement(state);
  C.botStep(state, strategies, random);
  if (step >= from && step <= to) {
    const placed = state.board.length > before
      ? state.board[state.board.length - 1]
      : null;
    process.stdout.write(
      "step " + step + " P" + pid + " tp=" + tp + " req=" + req
        + " -> " + (placed ? placed.card.code + "@(" + placed.x + "," + placed.y + ")" : "stop/pass")
        + " fill=" + state.board.length + "\n"
    );
  }
}