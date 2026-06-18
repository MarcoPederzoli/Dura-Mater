"use strict";

const path = require("node:path");
const { parentPort, workerData } = require("worker_threads");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

try {
  const { L, seed } = workerData.task;
  const t0 = Date.now();
  const random = core.mulberry32(core.hashSeed(`gn-bot-check:${L}:${seed}`));
  const strategies = Array.from({ length: L }, () => "durissima-global-planner");
  const state = core.setupGame(deck, {
    size: L,
    players: L,
    random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true,
    strategies
  });

  let guard = 0;
  while (state.status === "playing" && guard++ < 3000) {
    const step = core.botStep(state, strategies, random);
    if (!step.played && !step.passed && !step.ended && !step.lost) break;
  }

  const nodes = state._gnPlannerSearch?.stats?.nodes || 0;
  parentPort.postMessage({
    ok: true,
    result: {
      L,
      seed,
      status: state.status,
      placed: state.board.length,
      total: L * L,
      ms: Date.now() - t0,
      nodes
    }
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || String(error) });
}