"use strict";
/**
 * Sweep Durissima G>=2 con regola refill (posa => rimpiazzo mano a initialHandSize).
 * Uso: node temp-durissima-refill-probe.js [seeds=20] [workers=7]
 *      node temp-durissima-refill-probe.js 15 7 --nmin 3 --nmax 6
 */
const path = require("path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const SEEDS = Math.max(5, parseInt(process.argv[2] || "20", 10) || 20);
const WORKERS = Math.max(1, Math.min(8, parseInt(process.argv[3] || "7", 10) || 7));
const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? parseInt(argv[i + 1], 10) : def;
}
const NMIN = flag("--nmin", 3);
const NMAX = flag("--nmax", 8);

function maxG(n) {
  return Math.min(2 * n, Math.floor((n * n) / 3), 16);
}

function allConfigs() {
  const out = [];
  for (let n = NMIN; n <= NMAX; n++) {
    const mg = maxG(n);
    for (let g = 2; g <= mg; g++) {
      // mano iniziale >= 3 (MIN_INITIAL_HAND)
      const cards = g > n ? Math.floor((n * n) / g) : n;
      if (cards >= 3) out.push({ n, g });
    }
  }
  return out;
}

async function main() {
  const configs = allConfigs();
  const jobs = [];
  for (const c of configs) {
    for (let seed = 0; seed < SEEDS; seed++) {
      jobs.push({ n: c.n, g: c.g, seed });
    }
  }
  console.log(
    "Durissima REFILL rule · G>=2 · N=" +
      NMIN +
      ".." +
      NMAX +
      " · configs=" +
      configs.length +
      " · seeds=" +
      SEEDS +
      " · deals=" +
      jobs.length +
      " · workers=" +
      WORKERS
  );
  console.log("configs:", configs.map(c => c.n + "x" + c.g).join(", "));
  const t0 = Date.now();
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-durissima-refill-worker.js"),
    jobs,
    { workers: WORKERS }
  );

  const by = new Map();
  for (const r of rows) {
    if (!r || r.error) {
      console.error("err", r && r.error);
      continue;
    }
    const k = r.n + "x" + r.g;
    if (!by.has(k)) {
      by.set(k, {
        n: r.n,
        g: r.g,
        tall: r.tall0,
        w: 0,
        d: 0,
        p: 0,
        ms: 0,
        hand0: r.hand0
      });
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
      "hand".padEnd(6) +
      "win%".padEnd(8) +
      "wins".padEnd(12) +
      "avgP".padEnd(12) +
      "ms"
  );
  console.log("-".repeat(60));
  let W = 0;
  let D = 0;
  const keys = [...by.keys()].sort((a, b) => {
    const A = by.get(a);
    const B = by.get(b);
    return A.n - B.n || A.g - B.g;
  });
  for (const k of keys) {
    const b = by.get(k);
    W += b.w;
    D += b.d;
    console.log(
      k.padEnd(8) +
        String(b.tall).padEnd(6) +
        String(b.hand0).padEnd(6) +
        ((100 * b.w) / b.d).toFixed(0).padEnd(8) +
        (b.w + "/" + b.d).padEnd(12) +
        ((b.p / b.d).toFixed(1) + "/" + b.n * b.n).padEnd(12) +
        (b.ms / b.d).toFixed(0)
    );
  }
  console.log("-".repeat(60));
  console.log(
    "OVERALL G>=2: " +
      ((100 * W) / D).toFixed(1) +
      "% (" +
      W +
      "/" +
      D +
      ")  wall " +
      ((Date.now() - t0) / 1000).toFixed(0) +
      "s"
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
