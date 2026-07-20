"use strict";
/**
 * 5x5 A/B: legacy+2N vs vm+2N
 * mode: legacy2n | vm2n
 * hash: solo-5x5-ab:mode:seed
 */
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, seed, mode } = workerData.task;
  const t0 = Date.now();
  const random = core.mulberry32(core.hashSeed("solo-5x5-ab:" + mode + ":" + seed));
  const vm = mode === "vm2n";
  const strategies = ["durissima-global-planner"];
  const state = core.setupGame(deck, {
    size: n || 5,
    players: 1,
    random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    durissimaReserveEnabled: false,
    durissimaFreeCellSlots: 0,
    durissimaSoloWildCard: false,
    durissimaExtraCards: 5, // mano 2N = 10
    durissimaSoloVirtualMulti: vm,
    durissimaRefillToNAfterPlace: true,
    drawOnlyAfterPlacement: true,
    strategies
  });
  const hand0 = (state.hands[0] || []).length;
  const tall0 = (state.drawPile || []).length;
  const vmOn = state.durissimaSoloVirtualMulti === true ? 1 : 0;
  let guard = 0;
  const maxMs = 90000;
  while (state.status === "playing" && guard++ < 200000) {
    const step = core.botStep(state, strategies, random);
    if (!step || (!step.played && !step.passed && !step.ended && !step.lost && !step.parked)) {
      break;
    }
    if (Date.now() - t0 > maxMs) break;
  }
  const placed = (state.board || []).length;
  const total = 5 * 5;
  parentPort.postMessage({
    ok: true,
    result: {
      n: 5,
      seed,
      mode,
      hand0,
      tall0,
      vmOn,
      placed,
      total,
      ms: Date.now() - t0,
      win: placed >= total ? 1 : 0
    }
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: (e && e.message) || String(e) });
}
