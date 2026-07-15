"use strict";
/**
 * Sweep G>1 e G<N legali (mano >= 3), N=3..8. Esclude G=1.
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
acquireHeavyProbeLock("gltN-full", argvRaw);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, 7);
const SEEDS = (() => {
  const i = argv.indexOf("--seeds");
  return i >= 0 ? Math.max(1, parseInt(argv[i + 1], 10) || 10) : 10;
})();

function allConfigs() {
  const out = [];
  for (let n = 3; n <= 8; n++) {
    const maxG = Math.min(2 * n, Math.floor((n * n) / 3));
    for (let g = 2; g < n; g++) {
      if (g <= maxG) out.push({ n, g });
    }
  }
  return out;
}

const configs = allConfigs();
const tasks = [];
for (const c of configs) {
  for (let seed = 0; seed < SEEDS; seed++) {
    tasks.push({ n: c.n, g: c.g, seed });
  }
}

console.log(
  `\nG<N FULL (G>1) · configs=${configs.length} · seeds=${SEEDS} · ${tasks.length} deals · workers=${WORKERS}/${logicalCpuCount()}\n`
);
console.log(
  "configs:",
  configs.map((c) => `${c.n}x${c.g}`).join(", ")
);

async function main() {
  const started = Date.now();
  const rows = await runWorkerPool(path.join(__dirname, "temp-gltN-worker.js"), tasks, {
    workers: WORKERS
  });

  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.n}x${r.g}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        n: r.n,
        g: r.g,
        wins: 0,
        done: 0,
        placed: 0,
        ms: 0,
        tall: r.tallone0,
        total: r.total
      });
    }
    const b = byKey.get(key);
    b.done++;
    b.placed += r.placed || 0;
    b.ms += r.ms || 0;
    if (r.placed >= r.total) b.wins++;
  }

  console.log(
    "\nNxG".padEnd(8) +
      "tall".padEnd(6) +
      "win%".padEnd(8) +
      "deal".padEnd(10) +
      "avgP".padEnd(12) +
      "ms"
  );
  console.log("-".repeat(54));
  let W = 0;
  let D = 0;
  for (const key of [...byKey.keys()].sort((a, b) => {
    const A = byKey.get(a);
    const B = byKey.get(b);
    return A.n - B.n || A.g - B.g;
  })) {
    const b = byKey.get(key);
    W += b.wins;
    D += b.done;
    console.log(
      key.padEnd(8) +
        String(b.tall).padEnd(6) +
        `${((100 * b.wins) / b.done).toFixed(0)}%`.padEnd(8) +
        `${b.wins}/${b.done}`.padEnd(10) +
        `${(b.placed / b.done).toFixed(1)}/${b.total}`.padEnd(12) +
        (b.ms / b.done).toFixed(0)
    );
  }
  console.log("-".repeat(54));
  console.log(`OVERALL G<N: ${((100 * W) / D).toFixed(1)}% (${W}/${D})`);
  console.log(`Total time: ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
