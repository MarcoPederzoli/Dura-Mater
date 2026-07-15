"use strict";
/**
 * Test G=6 su tutte le griglie legali N=3..8 (mano iniziale >= 3).
 */
const path = require("node:path");
const {
  acquireHeavyProbeLock,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./scripts/cpu-workers");

require(path.join(__dirname, "mpcards-core.js"));

const argvRaw = process.argv.slice(2);
acquireHeavyProbeLock("g6-test", argvRaw);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, 7);
const G = 6;
const SEEDS = (() => {
  const i = argv.indexOf("--seeds");
  return i >= 0 ? Math.max(1, parseInt(argv[i + 1], 10) || 15) : 15;
})();

function legalNs(g) {
  const out = [];
  for (let n = 3; n <= 8; n++) {
    const maxG = Math.min(2 * n, Math.floor((n * n) / 3));
    if (g >= 2 && g <= maxG) out.push(n);
  }
  return out;
}

const ns = legalNs(G);
const tasks = [];
for (const n of ns) {
  for (let seed = 0; seed < SEEDS; seed++) {
    tasks.push({ n, g: G, seed });
  }
}

console.log(
  `\nG=${G} · N legali=[${ns.join(",")}] · seeds=${SEEDS} · ${tasks.length} deals · workers=${WORKERS}/${logicalCpuCount()}\n`
);

async function main() {
  const started = Date.now();
  const rows = await runWorkerPool(path.join(__dirname, "temp-g6-worker.js"), tasks, {
    workers: WORKERS
  });

  const byN = new Map();
  const fails = [];
  for (const r of rows) {
    if (!byN.has(r.n)) {
      byN.set(r.n, {
        wins: 0,
        done: 0,
        placed: 0,
        ms: 0,
        nodes: 0,
        tall: r.tallone0,
        total: r.total
      });
    }
    const b = byN.get(r.n);
    b.done++;
    b.placed += r.placed || 0;
    b.ms += r.ms || 0;
    b.nodes += r.nodes || 0;
    if (r.placed >= r.total) b.wins++;
    else fails.push(r);
  }

  console.log(
    "N".padEnd(4) +
      "G".padEnd(4) +
      "tall".padEnd(6) +
      "rel".padEnd(8) +
      "win%".padEnd(8) +
      "deal".padEnd(10) +
      "avgP".padEnd(10) +
      "ms".padEnd(8) +
      "nodi"
  );
  console.log("-".repeat(62));

  let W = 0;
  let D = 0;
  for (const n of [...byN.keys()].sort((a, b) => a - b)) {
    const b = byN.get(n);
    W += b.wins;
    D += b.done;
    const rel = n === G ? "G=N" : G > n ? "G>N" : "G<N";
    console.log(
      String(n).padEnd(4) +
        String(G).padEnd(4) +
        String(b.tall).padEnd(6) +
        rel.padEnd(8) +
        `${((100 * b.wins) / b.done).toFixed(0)}%`.padEnd(8) +
        `${b.wins}/${b.done}`.padEnd(10) +
        (b.placed / b.done).toFixed(1).padEnd(10) +
        (b.ms / b.done).toFixed(0).padEnd(8) +
        (b.nodes / b.done).toFixed(0)
    );
  }
  console.log("-".repeat(62));
  console.log(`OVERALL G=${G}: ${((100 * W) / D).toFixed(1)}% (${W}/${D})`);
  if (fails.length) {
    console.log("\nFAILS:");
    for (const f of fails) {
      console.log(
        `  ${f.n}x${f.g} seed${f.seed}: placed=${f.placed}/${f.total} ${f.status} ${f.ms}ms`
      );
    }
  }
  console.log(`Total time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
