"use strict";
const path = require("node:path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, g, seed, ns } = workerData.task;
  const t0 = Date.now();
  const random = core.mulberry32(core.hashSeed((ns || "gltN") + ":" + n + ":" + g + ":" + seed));
  const strategies = Array.from({ length: g }, () => "durissima-global-planner");
  const state = core.setupGame(deck, {
    size: n,
    players: g,
    random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true,
    strategies
  });
  let guard = 0;
  while (state.status === "playing" && guard++ < 100000) {
    const step = core.botStep(state, strategies, random);
    if (!step || (!step.played && !step.passed && !step.ended && !step.lost)) break;
    if (Date.now() - t0 > 50000) break;
  }
  parentPort.postMessage({
    ok: true,
    result: {
      n,
      g,
      seed,
      ns,
      placed: state.board.length,
      total: n * n,
      status: state.status
    }
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
}
