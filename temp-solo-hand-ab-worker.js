"use strict";
/**
 * task: { n, seed, hand2n: bool }
 * virtual-multi ON, refill ON, vita0 fc0
 * hash: solo-hand-ab:n:hand:seed  (hand = N|2N) per confrontare a parita' di n/seed
 * ma N e 2N hanno deal diversi (prime carte diverse) — stesso seed RNG di setup.
 */
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, seed, hand2n } = workerData.task;
  const t0 = Date.now();
  const tag = hand2n ? "2N" : "N";
  const random = core.mulberry32(core.hashSeed("solo-hand-ab:" + n + ":" + tag + ":" + seed));
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
    durissimaExtraCards: hand2n ? n : 0,
    durissimaSoloVirtualMulti: true,
    durissimaRefillToNAfterPlace: true,
    drawOnlyAfterPlacement: true,
    strategies
  });
  const hand0 = (state.hands[0] || []).length;
  const tall0 = (state.drawPile || []).length;
  let guard = 0;
  const maxMs = n >= 8 ? 120000 : n >= 7 ? 90000 : 60000;
  while (state.status === "playing" && guard++ < 200000) {
    const step = core.botStep(state, strategies, random);
    if (!step || (!step.played && !step.passed && !step.ended && !step.lost && !step.parked)) {
      break;
    }
    if (Date.now() - t0 > maxMs) break;
  }
  const placed = (state.board || []).length;
  parentPort.postMessage({
    ok: true,
    result: {
      n,
      seed,
      hand2n: hand2n ? 1 : 0,
      hand0,
      tall0,
      placed,
      total: n * n,
      ms: Date.now() - t0,
      win: placed >= n * n ? 1 : 0
    }
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: (e && e.message) || String(e) });
}
