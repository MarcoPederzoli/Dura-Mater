"use strict";

/**
 * Testa in parallelo tutte le mosse sicure a uno step.
 * Uso: node scripts/diag-gn-win-step-parallel.js L seed step [--workers N]
 */

const path = require("node:path");
const { runWorkerPool, parseWorkersFlag, defaultCliWorkers, logicalCpuCount } = require("./cpu-workers");

require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const argv = process.argv.slice(2);
const WORKERS = parseWorkersFlag(argv, defaultCliWorkers());
const nums = argv.filter(a => /^\d+$/.test(a)).map(Number);
const L = nums[0] || 6;
const seed = nums[1] ?? 2;
const forceStep = nums[2] || 39;
const morph = argv.find(a => a === "4quad" || a === "9patch" || a === "phased");
if (morph && L === 8) process.env.GN_8X8_MORPH = morph;

const deck = C.simulationDeck();
const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
const strategies = Array.from({ length: L }, () => "durissima-global-planner");
const state = C.setupGame(deck, {
  size: L,
  players: L,
  random,
  durissimaMater: true,
  durissimaVitaExtraEnabled: false,
  randomizeTurnOrder: true,
  strategies
});

let step = 0;
while (state.status === "playing" && step < forceStep - 1) {
  step++;
  C.botStep(state, strategies, random);
}

const pid = state.currentPlayer;
const req = C.placementRequirement(state);
const moves = C.legalPlacements(state, pid, req).filter(
  m => !C.gnMoveBreaksIdealFillPlan(state, pid, m)
);

process.stderr.write(
  `step ${forceStep} P${pid} tp=${state.turnPlayed} safe=${moves.length} worker=${WORKERS}/${logicalCpuCount()}\n`
);

if (!moves.length) {
  process.stdout.write("no safe moves\n");
  process.exit(0);
}

const tasks = moves.map(move => ({ L, seed, step: forceStep, move }));

runWorkerPool(path.join(__dirname, "diag-gn-win-step-worker.js"), tasks, { workers: WORKERS })
  .then(rows => {
    rows.sort((a, b) => b.fill - a.fill || a.steps - b.steps);
    const wins = rows.filter(r => r.win);
    for (const r of wins) {
      process.stdout.write(
        `WIN ${r.code}@(${r.x},${r.y}) fill=${r.fill} steps=${r.steps}\n`
      );
    }
    process.stdout.write("--- best ---\n");
    for (const r of rows.slice(0, 8)) {
      process.stdout.write(
        `${r.code}@(${r.x},${r.y}) ${r.status} ${r.fill}/${L * L} steps=${r.steps}\n`
      );
    }
    process.stdout.write(`done wins=${wins.length}/${rows.length}\n`);
  })
  .catch(err => {
    process.stderr.write(String(err) + "\n");
    process.exit(1);
  });