"use strict";
/**
 * mode: soloN | soloN_vm  (mano = N, non 2N)
 * hash: solo-vm-handN:n:seed
 */
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, seed, mode } = workerData.task;
  const t0 = Date.now();
  const random = core.mulberry32(core.hashSeed("solo-vm-handN:" + n + ":" + seed));
  const virtualMulti = mode === "soloN_vm";
  const strategies = ["durissima-global-planner"];
  const state = core.setupGame(deck, {
    size: n,
    players: 1,
    random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    durissimaReserveEnabled: false,
    durissimaFreeCellSlots: 0,
    durissimaSoloWildCard: false,
    durissimaExtraCards: 0,
    durissimaSoloVirtualMulti: virtualMulti,
    durissimaRefillToNAfterPlace: false,
    drawOnlyAfterPlacement: true,
    strategies
  });
  const hand0 = (state.hands[0] || []).length;
  const tall0 = (state.drawPile || []).length;
  const vmOn = state.durissimaSoloVirtualMulti === true ? 1 : 0;
  let guard = 0;
  const maxMs = n >= 7 ? 120000 : 60000;
  while (state.status === "playing" && guard++ < 200000) {
    const step = core.botStep(state, strategies, random);
    if (!step || (!step.played && !step.passed && !step.ended && !step.lost && !step.parked)) break;
    if (Date.now() - t0 > maxMs) break;
  }
  const placed = (state.board || []).length;
  parentPort.postMessage({
    ok: true,
    result: {
      n,
      seed,
      mode,
      hand0,
      tall0,
      vmOn,
      placed,
      total: n * n,
      ms: Date.now() - t0,
      win: placed >= n * n ? 1 : 0
    }
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: (e && e.message) || String(e) });
}
