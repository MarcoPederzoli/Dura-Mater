"use strict";
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, g, seed } = workerData.task;
  const t0 = Date.now();
  const random = core.mulberry32(core.hashSeed("dur-refill:" + n + ":" + g + ":" + seed));
  const strategies = Array.from({ length: g }, () => "durissima-global-planner");
  const state = core.setupGame(deck, {
    size: n,
    players: g,
    random,
    durissimaMater: true,
    // regola nuova: default nel core (refill + draw only after place)
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true,
    strategies
  });
  const tall0 = (state.drawPile || []).length;
  const hand0 = (state.hands[0] || []).length;
  const refillOn = state.durissimaRefillToNAfterPlace === true;
  const drawOnly = state.drawOnlyAfterPlacement === true;
  let guard = 0;
  const maxMs = n >= 7 ? 60000 : 45000;
  while (state.status === "playing" && guard++ < 150000) {
    const step = core.botStep(state, strategies, random);
    if (!step || (!step.played && !step.passed && !step.ended && !step.lost)) break;
    if (Date.now() - t0 > maxMs) break;
  }
  parentPort.postMessage({
    ok: true,
    result: {
      n,
      g,
      seed,
      tall0,
      hand0,
      refillOn: refillOn ? 1 : 0,
      drawOnly: drawOnly ? 1 : 0,
      placed: state.board.length,
      total: n * n,
      status: state.status,
      ms: Date.now() - t0,
      win: state.board.length >= n * n ? 1 : 0
    }
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: (e && e.message) || String(e) });
}
