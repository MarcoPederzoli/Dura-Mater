"use strict";

const path = require("node:path");
const {
  defaultHeavyCliWorkers,
  acquireHeavyProbeLock,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./scripts/cpu-workers");

require(path.join(__dirname, "mpcards-core.js"));

const core = globalThis.MPCardsCore;

const argvRaw = process.argv.slice(2);
acquireHeavyProbeLock("5x5-gt5", argvRaw);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, 7);  // max 7 as per machine prefs, leave 1 for system

const tasks = [];

// 5x5 G>5 valid configs, increased seeds for statistical reliability (N=5 still manageable).
// With small tallone we expect high placed % and near-100% solves; low sample was hiding variance.
const configs = [
  { n: 5, g: 6, seeds: 10 },  // tallone=1
  { n: 5, g: 7, seeds: 10 },  // tallone=4
  { n: 5, g: 8, seeds: 10 },  // tallone=1
];

for (const cfg of configs) {
  for (let seed = 0; seed < cfg.seeds; seed++) {
    tasks.push({ n: cfg.n, g: cfg.g, seed });
  }
}

console.log(`\n5x5 G>5 tests (coordinated, more seeds for stats) · ${tasks.length} deals · workers=${WORKERS}/${logicalCpuCount()}\n`);

async function main() {
  const started = Date.now();
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-5x5-gt5-worker.js"),
    tasks,
    { workers: WORKERS }
  );

  const byG = new Map();
  for (const row of rows) {
    const key = row.g;
    if (!byG.has(key)) byG.set(key, { wins: 0, done: 0, ms: 0, placed: 0, nodes: 0 });
    const b = byG.get(key);
    b.done++;
    b.ms += row.ms || 0;
    b.placed += row.placed || 0;
    b.nodes += row.nodes || 0;
    if (row.placed >= row.total) b.wins++;
  }

  console.log("\n--- 5x5 G>5 results ---\n");
  console.log("G".padEnd(4) + "win%".padEnd(8) + "deal".padEnd(8) + "avg placed".padEnd(12) + "ms/deal".padEnd(10) + "nodi/deal");
  console.log("-".repeat(50));

  for (const [g, b] of [...byG.entries()].sort((a,b)=>a[0]-b[0])) {
    const winPct = (100 * b.wins / b.done).toFixed(0);
    const avgPlaced = (b.placed / b.done).toFixed(1);
    const msDeal = (b.ms / b.done).toFixed(0);
    const nodesDeal = (b.nodes / b.done).toFixed(0);
    console.log(
      String(g).padEnd(4) +
      `${winPct}%`.padEnd(8) +
      `${b.wins}/${b.done}`.padEnd(8) +
      avgPlaced.padEnd(12) +
      msDeal.padEnd(10) +
      nodesDeal
    );
  }

  console.log(`\nTotal time: ${((Date.now() - started)/1000).toFixed(0)}s`);
}

main().catch(e => { console.error(e); process.exit(1); });
