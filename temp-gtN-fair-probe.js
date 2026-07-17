"use strict";
/**
 * Retest G>N senza oracolo ordine tallone.
 * Uso: node temp-gtN-fair-probe.js 4 [seeds]
 *      node temp-gtN-fair-probe.js 5 [seeds]
 */
const path = require("path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const N = Math.max(3, Math.min(8, parseInt(process.argv[2] || "4", 10) || 4));
const SEEDS = Math.max(5, parseInt(process.argv[3] || "30", 10) || 30);
const WORKERS = Math.max(1, Math.min(8, parseInt(process.argv[4] || "7", 10) || 7));

function configsForN(n) {
  const maxG = Math.min(2 * n, Math.floor((n * n) / 3));
  const out = [];
  for (let g = n + 1; g <= maxG; g++) out.push({ n, g });
  return out;
}

async function main() {
  const configs = configsForN(N);
  if (!configs.length) {
    console.log("Nessuna config G>N legale per N=" + N);
    return;
  }
  const tasks = [];
  for (const c of configs) {
    for (let seed = 0; seed < SEEDS; seed++) tasks.push({ n: c.n, g: c.g, seed });
  }
  console.log(
    "G>N FAIR (no draw-oracle search) N=" +
      N +
      " configs=" +
      configs.map(c => c.n + "x" + c.g).join(",") +
      " seeds=" +
      SEEDS +
      " deals=" +
      tasks.length +
      " workers=" +
      WORKERS
  );
  const t0 = Date.now();
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-gtN-fair-worker.js"),
    tasks,
    { workers: WORKERS }
  );
  const by = new Map();
  for (const r of rows) {
    const k = r.n + "x" + r.g;
    if (!by.has(k)) {
      by.set(k, { n: r.n, g: r.g, tall: r.tall0, w: 0, d: 0, p: 0, ms: 0 });
    }
    const b = by.get(k);
    b.d++;
    b.w += r.win;
    b.p += r.placed;
    b.ms += r.ms;
  }
  console.log("");
  console.log(
    "NxG".padEnd(8) +
      "tall".padEnd(6) +
      "win%".padEnd(8) +
      "wins".padEnd(10) +
      "avgP".padEnd(12) +
      "ms"
  );
  console.log("-".repeat(50));
  let W = 0;
  let D = 0;
  for (const k of [...by.keys()].sort((a, b) => {
    const A = by.get(a);
    const B = by.get(b);
    return A.n - B.n || A.g - B.g;
  })) {
    const b = by.get(k);
    W += b.w;
    D += b.d;
    console.log(
      k.padEnd(8) +
        String(b.tall).padEnd(6) +
        ((100 * b.w) / b.d).toFixed(0).padEnd(8) +
        (b.w + "/" + b.d).padEnd(10) +
        ((b.p / b.d).toFixed(1) + "/" + b.n * b.n).padEnd(12) +
        (b.ms / b.d).toFixed(0)
    );
  }
  console.log("-".repeat(50));
  console.log(
    "OVERALL N=" + N + " G>N: " + ((100 * W) / D).toFixed(1) + "% (" + W + "/" + D + ")"
  );
  console.log("time " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
