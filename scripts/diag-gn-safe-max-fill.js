"use strict";

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 7;
const seed = Number(process.argv[3]) ?? 0;
const from = Number(process.argv[4]) || 1;
const to = Number(process.argv[5]) || 80;

function replayTo(targetStep) {
  const deck = C.simulationDeck();
  const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
  const strategies = Array.from({ length: L }, () => "durissima-global-planner");
  const state = C.setupGame(deck, {
    size: L, players: L, random,
    durissimaMater: true, durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true, strategies
  });
  let step = 0;
  while (state.status === "playing" && step < targetStep - 1) {
    step++;
    C.botStep(state, strategies, random);
  }
  return { state, pid: state.currentPlayer };
}

function playForced(forceStep, move) {
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
    if (step === forceStep) {
      const pid = state.currentPlayer;
      C.applyPlacement(state, pid, move);
      if (state.status !== "playing") break;
      if (state.turnPlayed >= 5) C.endTurn(state);
      continue;
    }
    C.botStep(state, strategies, random);
  }
  return state;
}

for (let forceStep = from; forceStep <= to; forceStep++) {
  const { state, pid } = replayTo(forceStep);
  const req = C.placementRequirement(state);
  const safe = C.legalPlacements(state, pid, req)
    .filter(m => !C.gnMoveBreaksIdealFillPlan(state, pid, m));
  if (!safe.length) continue;
  let bestFill = -1;
  let bestMove = null;
  let anyWin = false;
  for (const move of safe) {
    const st = playForced(forceStep, move);
    const fill = st.board.length;
    if (fill === L * L || st.status === "success") anyWin = true;
    if (fill > bestFill) {
      bestFill = fill;
      bestMove = move.card.code + "@(" + move.x + "," + move.y + ")";
    }
  }
  const tag = anyWin ? " WIN" : (bestFill >= L * L - 1 ? " near" : "");
  process.stdout.write(
    "step " + forceStep + " safe=" + safe.length + " best=" + bestMove
      + " fill=" + bestFill + tag + "\n"
  );
}