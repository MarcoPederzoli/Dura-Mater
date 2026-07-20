"use strict";
/**
 * mode:
 *  - g2: 2 giocatori, mani 7+7
 *  - solo2n: solo mano 14, path solo legacy
 *  - solo2n_vm: solo mano 14, path virtual-multi (partial come G=2)
 * Stesso shuffle: prime 14 carte identiche. Refill OFF.
 */
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, seed, mode } = workerData.task;
  const t0 = Date.now();
  const random = core.mulberry32(core.hashSeed("solo2n-vs-g2:" + n + ":" + seed));
  const isG2 = mode === "g2";
  const virtualMulti = mode === "solo2n_vm";
  const g = isG2 ? 2 : 1;
  const strategies = Array.from({ length: g }, () => "durissima-global-planner");
  const opts = {
    size: n,
    players: g,
    random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    durissimaReserveEnabled: false,
    durissimaFreeCellSlots: 0,
    durissimaSoloWildCard: false,
    durissimaSoloSeedTopRow: false,
    durissimaRefillToNAfterPlace: false,
    drawOnlyAfterPlacement: true,
    randomizeTurnOrder: true,
    strategies
  };
  if (!isG2) {
    opts.durissimaExtraCards = n; // mano 2N
    if (virtualMulti) opts.durissimaSoloVirtualMulti = true;
  }
  const state = core.setupGame(deck, opts);

  const handSizes = (state.hands || []).map(h => (h || []).length);
  const tall0 = (state.drawPile || []).length;
  const handTotal = handSizes.reduce((a, b) => a + b, 0);
  const vmOn = state.durissimaSoloVirtualMulti === true ? 1 : 0;

  let guard = 0;
  const maxMs = n >= 7 ? 120000 : 60000;
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
      mode,
      g,
      handSizes,
      handTotal,
      tall0,
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
