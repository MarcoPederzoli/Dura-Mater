"use strict";
/**
 * Solo 2N + virtual-multi + refill ON (prodotto candidato).
 * hash: solo-vm-2n-refill:n:seed
 */
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, seed } = workerData.task;
  const t0 = Date.now();
  const random = core.mulberry32(core.hashSeed("solo-vm-2n-refill:" + n + ":" + seed));
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
    durissimaExtraCards: n, // mano = N + N = 2N
    durissimaSoloVirtualMulti: true,
    // refill default ON; esplicito
    durissimaRefillToNAfterPlace: true,
    drawOnlyAfterPlacement: true,
    strategies
  });
  const hand0 = (state.hands[0] || []).length;
  const tall0 = (state.drawPile || []).length;
  const refillOn = state.durissimaRefillToNAfterPlace === true ? 1 : 0;
  const vmOn = state.durissimaSoloVirtualMulti === true ? 1 : 0;
  const targetHand = state.initialHandSize || hand0;

  let guard = 0;
  const maxMs = n >= 8 ? 150000 : n >= 7 ? 120000 : 60000;
  while (state.status === "playing" && guard++ < 200000) {
    const step = core.botStep(state, strategies, random);
    if (!step || (!step.played && !step.passed && !step.ended && !step.lost && !step.parked)) {
      break;
    }
    if (Date.now() - t0 > maxMs) break;
  }
  const placed = (state.board || []).length;
  const total = n * n;
  parentPort.postMessage({
    ok: true,
    result: {
      n,
      seed,
      hand0,
      tall0,
      targetHand,
      refillOn,
      vmOn,
      placed,
      total,
      status: state.status,
      ms: Date.now() - t0,
      win: placed >= total ? 1 : 0
    }
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: (e && e.message) || String(e) });
}
