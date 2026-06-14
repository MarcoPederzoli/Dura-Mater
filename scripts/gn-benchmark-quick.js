"use strict";

/**
 * Benchmark rapido G=N: win% e fill per seed (parallelo con worker_threads).
 * Uso: node scripts/gn-benchmark-quick.js [L] [seed0 seed1 ...] [--workers N]
 */

const path = require("node:path");
const { Worker } = require("worker_threads");
const {
  parseWorkersFlag,
  filterArgv,
  logicalCpuCount
} = require("./cpu-workers");

require(path.join(__dirname, "..", "mpcards-core.js"));

const argvRaw = process.argv.slice(2);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, Math.min(7, Math.max(1, logicalCpuCount() - 1)));

const L = Number(argv[0]) || 5;
const seeds = argv.slice(1).map(Number).filter(n => !Number.isNaN(n));
const seedList = seeds.length ? seeds : [0, 1, 2, 3, 4, 5];

function runOne(seed) {
  const C = globalThis.MPCardsCore;
  const t0 = Date.now();
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
  let steps = 0;
  while (state.status === "playing" && steps++ < 5000) {
    C.botStep(state, strategies, random);
  }
  return {
    seed,
    status: state.status,
    fill: state.board.length,
    max: L * L,
    ms: Date.now() - t0
  };
}

function runPool(tasks, workers) {
  if (workers <= 1 || tasks.length <= 1) {
    return Promise.resolve(tasks.map(seed => runOne(seed)));
  }
  return new Promise((resolve, reject) => {
    const results = new Array(tasks.length);
    let next = 0;
    let live = 0;
    let done = 0;

    function pump() {
      while (live < workers && next < tasks.length) {
        const idx = next++;
        live++;
        const w = new Worker(__filename, { workerData: { L, seed: tasks[idx] } });
        w.on("message", row => {
          results[idx] = row;
          live--;
          done++;
          if (done === tasks.length) resolve(results);
          else pump();
        });
        w.on("error", reject);
      }
    }
    pump();
  });
}

const { isMainThread, parentPort, workerData } = require("worker_threads");

if (!isMainThread) {
  const C = globalThis.MPCardsCore;
  const Lw = workerData.L;
  const seed = workerData.seed;
  const t0 = Date.now();
  const deck = C.simulationDeck();
  const random = C.mulberry32(C.hashSeed(`gn-bot-check:${Lw}:${seed}`));
  const strategies = Array.from({ length: Lw }, () => "durissima-global-planner");
  const state = C.setupGame(deck, {
    size: Lw,
    players: Lw,
    random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true,
    strategies
  });
  let steps = 0;
  while (state.status === "playing" && steps++ < 5000) {
    C.botStep(state, strategies, random);
  }
  parentPort.postMessage({
    seed,
    status: state.status,
    fill: state.board.length,
    max: Lw * Lw,
    ms: Date.now() - t0
  });
} else if (require.main === module) {
  (async () => {
    const rows = await runPool(seedList, WORKERS);
    let wins = 0;
    let totalFill = 0;
    process.stdout.write(`L=${L} seeds=${seedList.join(",")} workers=${WORKERS}\n`);
    for (const r of rows) {
      const win = r.status === "success";
      if (win) wins++;
      totalFill += r.fill;
      process.stdout.write(`  seed ${r.seed}: ${r.status} ${r.fill}/${r.max} (${r.ms}ms)\n`);
    }
    const n = rows.length;
    process.stdout.write(
      `win%=${Math.round(100 * wins / n)}% (${wins}/${n}) avgFill=${(totalFill / n).toFixed(1)}/${L * L}\n`
    );
  })().catch(err => {
    process.stderr.write(String(err?.stack || err) + "\n");
    process.exit(1);
  });
}