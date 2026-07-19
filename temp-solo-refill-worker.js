"use strict";
const path = require("path");
const { parentPort, workerData } = require("worker_threads");
require(path.join(__dirname, "mpcards-core.js"));
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
try {
  const { n, seed, refill, earlyAbort, midChains } = workerData.task;
  const t0 = Date.now();
  // Stesso hash per refill ON/OFF => A/B equo
  const random = core.mulberry32(core.hashSeed("solo-refill-ab:" + n + ":" + seed));
  const strategies = ["durissima-global-planner"];
  const state = core.setupGame(deck, {
    size: n,
    players: 1,
    random,
    durissimaMater: true,
    durissimaReserveEnabled: false,
    durissimaFreeCellSlots: 0,
    durissimaVitaExtraEnabled: false,
    durissimaSoloWildCard: false,
    // regola sotto test
    durissimaRefillToNAfterPlace: refill !== false,
    drawOnlyAfterPlacement: true,
    // midChains true = policy vecchia (catene mid-game anche solitario)
    durissimaSoloAllowMidChains: midChains === true,
    strategies
  });

  const hand0 = (state.hands[0] || []).length;
  const tall0 = (state.drawPile || []).length;
  const refillOn = state.durissimaRefillToNAfterPlace === true ? 1 : 0;
  const drawOnly = state.drawOnlyAfterPlacement === true ? 1 : 0;

  let outcome = "stalled";
  let deadReason = null;
  let g = 0;
  const maxMs = n >= 8 ? 180000 : n >= 7 ? 150000 : 90000;

  while (state.status === "playing" && g++ < 200000) {
    const placedBefore = state.board.length;
    const step = core.botStep(state, strategies, random);
    if (!step) {
      outcome = "stalled";
      break;
    }
    if (state.board.length >= n * n) {
      outcome = "win";
      break;
    }
    if (earlyAbort !== false) {
      const check =
        state.board.length > placedBefore ||
        step.ended ||
        step.passed ||
        state.turnPlayed === 0;
      if (check) {
        const dead = core.gnSoloIsPositionDead(state, { maxEmptyForFill: 8 });
        if (dead && dead.dead) {
          outcome = "lost_early";
          deadReason = dead.reason;
          state.status = "lost_early";
          break;
        }
      }
    }
    if (step.played || step.passed || step.ended || step.lost || step.parked || step.drew) {
      // ok
    } else {
      outcome = "stalled";
      break;
    }
    if (step.lost) {
      outcome = "stalled";
      break;
    }
    if (Date.now() - t0 > maxMs) {
      outcome = "timeout";
      break;
    }
  }

  if (state.board.length >= n * n) outcome = "win";

  const stats = state.turnPlacementStats || {};
  const byCount = stats.byCount || [0, 0, 0, 0, 0, 0];
  // byCount[k] = turni con esattamente k posate (k=0..5)
  parentPort.postMessage({
    ok: true,
    result: {
      n,
      seed,
      refill: refillOn,
      midChains: midChains === true ? 1 : 0,
      drawOnly,
      hand0,
      tall0,
      placed: state.board.length,
      total: n * n,
      status: state.status,
      outcome,
      deadReason,
      ms: Date.now() - t0,
      win: state.board.length >= n * n ? 1 : 0,
      turns1: byCount[1] || 0,
      turns2: byCount[2] || 0,
      turns3: byCount[3] || 0,
      turns4: byCount[4] || 0,
      turns5: byCount[5] || 0,
      maxInTurn: stats.maxInTurn || 0
    }
  });
} catch (e) {
  parentPort.postMessage({ ok: false, error: (e && e.message) || String(e) });
}
