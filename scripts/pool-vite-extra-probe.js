"use strict";

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const L = Number(process.argv[2]) || 4;
const COUNT = Number(process.argv[3]) || 20;
const pool = process.argv[4] === "pool";

const random = core.mulberry32(core.hashSeed(`pool-probe:${L}:${pool}`));
const maxSteps = L * L * 1 * 48;

let slowest = { ms: 0, steps: 0, i: -1 };
let maxStepsHits = 0;

for (let i = 0; i < COUNT; i++) {
  const t0 = Date.now();
  const opts = {
    size: L,
    players: 1,
    random,
    strategies: ["durissima-planner"],
    durissimaMater: true,
    randomizeTurnOrder: true
  };
  if (!pool) opts.durissimaVitaExtraBudget = 1;

  const state = core.setupGame(deck, opts);
  let steps = 0;
  while (state.status === "playing" && steps < maxSteps) {
    core.botStep(state, opts.strategies, random);
    steps++;
  }
  const hitCap = state.status === "playing";
  if (hitCap) {
    state.status = "stalled";
    maxStepsHits++;
  }

  const ms = Date.now() - t0;
  if (ms > slowest.ms) slowest = { ms, steps, i, status: state.status, poolLeft: core.durissimaVitaExtraPoolLeft(state), vitaUsed: state.durissimaVitaExtraUsed?.[0] };
  process.stderr.write(`  ${i + 1}/${COUNT} steps=${steps} ${ms}ms ${state.status}${hitCap ? " (CAP)" : ""}\n`);
}

process.stdout.write(
  `\n${L}x1 ${pool ? "pool" : "individual"}: ${COUNT} partite, maxSteps=${maxSteps}, capHit=${maxStepsHits}\n` +
  `più lenta: #${slowest.i} ${slowest.ms}ms steps=${slowest.steps} ${slowest.status} poolLeft=${slowest.poolLeft} vitaUsed=${slowest.vitaUsed}\n`
);