"use strict";
/**
 * 7x7 con tutti i G legali >= 7 (G = 7 .. max mano>=3).
 */
const path = require("node:path");
const {
  acquireHeavyProbeLock,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./scripts/cpu-workers");

const argvRaw = process.argv.slice(2);
acquireHeavyProbeLock("7x7-ge7", argvRaw);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, 7);
const SEEDS = (() => {
  const i = argv.indexOf("--seeds");
  return i >= 0 ? Math.max(1, parseInt(argv[i + 1], 10) || 15) : 15;
})();

const N = 7;
const G_MIN = 7;
const G_MAX = Math.min(2 * N, Math.floor((N * N) / 3)); // min(14, 16) = 14

const tasks = [];
for (let g = G_MIN; g <= G_MAX; g++) {
  for (let seed = 0; seed < SEEDS; seed++) {
    tasks.push({ n: N, g, seed });
  }
}

console.log(
  `\n7x7 G=${G_MIN}..${G_MAX} · seeds=${SEEDS} · ${tasks.length} deals · workers=${WORKERS}/${logicalCpuCount()}\n`
);

async function main() {
  const started = Date.now();
  const rows = await runWorkerPool(path.join(__dirname, "temp-7x7-ge7-worker.js"), tasks, {
    workers: WORKERS
  });

  const byG = new Map();
  const fails = [];
  for (const r of rows) {
    if (!byG.has(r.g)) {
      byG.set(r.g, { wins: 0, done: 0, placed: 0, ms: 0, nodes: 0, tall: r.tallone0 });
    }
    const b = byG.get(r.g);
    b.done++;
    b.placed += r.placed || 0;
    b.ms += r.ms || 0;
    b.nodes += r.nodes || 0;
    if (r.placed >= r.total) b.wins++;
    else fails.push(r);
  }

  console.log(
    "G".padEnd(4) +
      "tall".padEnd(6) +
      "win%".padEnd(8) +
      "deal".padEnd(10) +
      "avgP".padEnd(10) +
      "ms".padEnd(8) +
      "nodi"
  );
  console.log("-".repeat(52));

  let W = 0;
  let D = 0;
  for (const g of [...byG.keys()].sort((a, b) => a - b)) {
    const b = byG.get(g);
    W += b.wins;
    D += b.done;
    console.log(
      String(g).padEnd(4) +
        String(b.tall).padEnd(6) +
        `${((100 * b.wins) / b.done).toFixed(0)}%`.padEnd(8) +
        `${b.wins}/${b.done}`.padEnd(10) +
        (b.placed / b.done).toFixed(1).padEnd(10) +
        (b.ms / b.done).toFixed(0).padEnd(8) +
        (b.nodes / b.done).toFixed(0)
    );
  }
  console.log("-".repeat(52));
  console.log(`OVERALL 7x7 G>=7: ${((100 * W) / D).toFixed(1)}% (${W}/${D})`);
  if (fails.length) {
    console.log(`\nFAILS (${fails.length}):`);
    for (const f of fails) {
      console.log(
        `  G=${f.g} seed${f.seed}: placed=${f.placed}/${f.total} ${f.status} ${f.ms}ms`
      );
    }
  }
  console.log(`Total time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
