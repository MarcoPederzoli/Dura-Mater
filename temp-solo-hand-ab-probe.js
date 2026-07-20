"use strict";
/**
 * Confronto solitario mano N vs mano 2N, virtual-multi + refill ON.
 * Uso: node temp-solo-hand-ab-probe.js [seeds=40] [workers=7] [--nmin 3] [--nmax 8]
 */
const path = require("path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const SEEDS = Math.max(5, parseInt(process.argv[2] || "40", 10) || 40);
const WORKERS = Math.max(1, Math.min(8, parseInt(process.argv[3] || "7", 10) || 7));
const argv = process.argv.slice(2);
function flagInt(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? parseInt(argv[i + 1], 10) : def;
}
const NMIN = flagInt("--nmin", 3);
const NMAX = flagInt("--nmax", 8);

async function main() {
  const jobs = [];
  for (let n = NMIN; n <= NMAX; n++) {
    for (let seed = 0; seed < SEEDS; seed++) {
      jobs.push({ n, seed, hand2n: false });
      jobs.push({ n, seed, hand2n: true });
    }
  }
  console.log(
    "Solo A/B mano N vs 2N · virtual-multi · refill ON · N=" +
      NMIN +
      ".." +
      NMAX +
      " · seeds=" +
      SEEDS +
      " · deals=" +
      jobs.length +
      " · workers=" +
      WORKERS
  );
  const t0 = Date.now();
  let last = 0;
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-solo-hand-ab-worker.js"),
    jobs,
    {
      workers: WORKERS,
      onProgress: (d, t) => {
        const now = Date.now();
        if (d === t || now - last > 20000) {
          last = now;
          process.stderr.write(
            "  " + d + "/" + t + " " + ((now - t0) / 1000).toFixed(0) + "s\n"
          );
        }
      }
    }
  );

  const by = new Map();
  for (const r of rows) {
    if (!r || r.error) {
      console.error(r && r.error);
      continue;
    }
    const k = r.n + "|" + (r.hand2n ? "2N" : "N");
    if (!by.has(k)) {
      by.set(k, {
        n: r.n,
        hand2n: r.hand2n,
        w: 0,
        d: 0,
        p: 0,
        maxP: 0,
        hand0: r.hand0,
        tall0: r.tall0,
        sumMs: 0,
        winSeeds: []
      });
    }
    const b = by.get(k);
    b.d++;
    b.p += r.placed;
    b.sumMs += r.ms || 0;
    if (r.placed > b.maxP) b.maxP = r.placed;
    if (r.win) {
      b.w++;
      b.winSeeds.push(r.seed);
    }
  }

  console.log("");
  console.log(
    "N".padEnd(4) +
      "hand".padEnd(6) +
      "H0".padEnd(5) +
      "tall".padEnd(6) +
      "win%".padEnd(8) +
      "wins".padEnd(12) +
      "avgP".padEnd(12) +
      "maxP".padEnd(6) +
      "ms"
  );
  console.log("-".repeat(72));
  for (let n = NMIN; n <= NMAX; n++) {
    for (const tag of ["N", "2N"]) {
      const b = by.get(n + "|" + tag);
      if (!b) continue;
      const tot = n * n;
      console.log(
        String(n).padEnd(4) +
          tag.padEnd(6) +
          String(b.hand0).padEnd(5) +
          String(b.tall0).padEnd(6) +
          ((100 * b.w) / b.d).toFixed(1).padEnd(8) +
          (b.w + "/" + b.d).padEnd(12) +
          ((b.p / b.d).toFixed(1) + "/" + tot).padEnd(12) +
          String(b.maxP).padEnd(6) +
          (b.sumMs / b.d).toFixed(0)
      );
    }
  }
  console.log("-".repeat(72));
  console.log("Delta win% (2N - N):");
  for (let n = NMIN; n <= NMAX; n++) {
    const a = by.get(n + "|N");
    const b = by.get(n + "|2N");
    if (!a || !b) continue;
    const dWin = (100 * b.w) / b.d - (100 * a.w) / a.d;
    const dAvg = b.p / b.d - a.p / a.d;
    console.log(
      "  " +
        n +
        "x" +
        n +
        "  dWin=" +
        (dWin >= 0 ? "+" : "") +
        dWin.toFixed(1) +
        "pp  dAvgP=" +
        (dAvg >= 0 ? "+" : "") +
        dAvg.toFixed(1) +
        "  max " +
        a.maxP +
        " vs " +
        b.maxP
    );
  }
  console.log("wall " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
