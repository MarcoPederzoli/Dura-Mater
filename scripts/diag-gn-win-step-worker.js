"use strict";

const { workerData, parentPort } = require("worker_threads");
const path = require("node:path");

require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const { task } = workerData;
const L = task.L;
const seed = task.seed;
const forceStep = task.step;
const move = task.move;

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
  if (step === forceStep) {
    const pid = state.currentPlayer;
    C.applyPlacement(state, pid, move);
    if (state.status !== "playing") break;
    if (state.turnPlayed >= 5) C.endTurn(state);
    continue;
  }
  C.botStep(state, strategies, random);
}

const target = L * L;
const ok = state.status === "success" || state.board.length === target;
parentPort.postMessage({
  ok: true,
  result: {
    step: forceStep,
    code: move.card.code,
    x: move.x,
    y: move.y,
    status: state.status,
    fill: state.board.length,
    steps: step,
    win: ok
  }
});