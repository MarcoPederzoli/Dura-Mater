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
  for (const move of safe) {
    const st = playForced(forceStep, move);
    if (st.status === "success" || st.board.length === L * L) {
      process.stdout.write(
        "WIN step " + forceStep + " " + move.card.code + "@(" + move.x + "," + move.y + ")"
          + " safe=" + safe.length + " empty=" + C.gnEmptyCellsInIdealGrid(state) + "\n"
      );
      process.exit(0);
    }
  }
  if (forceStep % 15 === 0) {
    process.stdout.write("scan step " + forceStep + " safe=" + safe.length + "\n");
  }
}
process.stdout.write("no WIN in " + from + ".." + to + "\n");