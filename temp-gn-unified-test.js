"use strict";
/**
 * Test path unificato G>=N (oracolo fingi) per N=3..8.
 * Stesso algoritmo per ogni N: griglia A + assembly owned-first + follow strict.
 */
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
acquireHeavyProbeLock("gn-unified", argvRaw);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, 7);
const SEEDS = (() => {
  const i = argv.indexOf("--seeds");
  return i >= 0 ? Math.max(1, parseInt(argv[i + 1], 10) || 5) : 5;
})();

// G >= N legali con mano iniziale >= 3: tallone = N^2 % G < G sempre
function configsForN(n) {
  const total = n * n;
  const out = [];
  // G = N (ideal) e alcuni G > N fino a min(2N, floor(total/3))
  const gMax = Math.min(2 * n, Math.floor(total / 3));
  for (let g = n; g <= gMax; g++) {
    out.push({ n, g });
  }
  return out;
}

const tasks = [];
for (let n = 3; n <= 8; n++) {
  for (const cfg of configsForN(n)) {
    for (let seed = 0; seed < SEEDS; seed++) {
      tasks.push({ n: cfg.n, g: cfg.g, seed });
    }
  }
}

console.log(
  `\nG>=N unified path · N=3..8 · seeds/config=${SEEDS} · ${tasks.length} deals · workers=${WORKERS}/${logicalCpuCount()}\n`
);

async function main() {
  const started = Date.now();
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-gn-unified-worker.js"),
    tasks,
    { workers: WORKERS }
  );

  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.n}x${row.g}`;
    if (!byKey.has(key)) {
      byKey.set(key, { n: row.n, g: row.g, wins: 0, done: 0, placed: 0, total: row.total, ms: 0, nodes: 0, tallone: row.tallone0 });
    }
    const b = byKey.get(key);
    b.done++;
    b.ms += row.ms || 0;
    b.placed += row.placed || 0;
    b.nodes += row.nodes || 0;
    if (row.placed >= row.total) b.wins++;
  }

  console.log(
    "NxG".padEnd(8) +
      "tall".padEnd(6) +
      "win%".padEnd(8) +
      "deal".padEnd(10) +
      "avgP".padEnd(10) +
      "ms".padEnd(8) +
      "nodi"
  );
  console.log("-".repeat(60));

  let allW = 0;
  let allD = 0;
  const keys = [...byKey.keys()].sort((a, b) => {
    const A = byKey.get(a);
    const B = byKey.get(b);
    return A.n - B.n || A.g - B.g;
  });
  for (const key of keys) {
    const b = byKey.get(key);
    allW += b.wins;
    allD += b.done;
    const winPct = ((100 * b.wins) / b.done).toFixed(0);
    const avgP = (b.placed / b.done).toFixed(1);
    const ms = (b.ms / b.done).toFixed(0);
    const nodes = (b.nodes / b.done).toFixed(0);
    console.log(
      key.padEnd(8) +
        String(b.tallone ?? "?").padEnd(6) +
        `${winPct}%`.padEnd(8) +
        `${b.wins}/${b.done}`.padEnd(10) +
        avgP.padEnd(10) +
        ms.padEnd(8) +
        nodes
    );
  }
  console.log("-".repeat(60));
  console.log(`OVERALL G>=N: ${((100 * allW) / allD).toFixed(1)}%  (${allW}/${allD})`);
  console.log(`Total time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
