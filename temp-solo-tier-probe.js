"use strict";
/**
 * Verifica tier path: N<=5 legacy solo; N>=6 virtual-multi default.
 * Mano N (extra 0), refill ON.
 * Uso: node temp-solo-tier-probe.js [seeds=40] [workers=7]
 */
const path = require("path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const SEEDS = Math.max(5, parseInt(process.argv[2] || "40", 10) || 40);
const WORKERS = Math.max(1, Math.min(8, parseInt(process.argv[3] || "7", 10) || 7));

async function main() {
  const jobs = [];
  for (let n = 3; n <= 8; n++) {
    for (let seed = 0; seed < SEEDS; seed++) {
      jobs.push({ n, seed });
    }
  }
  console.log(
    "Solo TIER default path · mano N · refill ON · seeds=" +
      SEEDS +
      " · deals=" +
      jobs.length +
      " · workers=" +
      WORKERS
  );
  const t0 = Date.now();
  let last = 0;
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-solo-tier-worker.js"),
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
    if (!by.has(r.n)) {
      by.set(r.n, {
        n: r.n,
        w: 0,
        d: 0,
        p: 0,
        maxP: 0,
        hand0: r.hand0,
        tall0: r.tall0,
        vm: r.vmOn,
        sumMs: 0,
        winSeeds: []
      });
    }
    const b = by.get(r.n);
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
      "path".padEnd(8) +
      "H".padEnd(4) +
      "tall".padEnd(6) +
      "win%".padEnd(8) +
      "wins".padEnd(10) +
      "avgP".padEnd(12) +
      "maxP".padEnd(6) +
      "ms"
  );
  console.log("-".repeat(70));
  for (let n = 3; n <= 8; n++) {
    const b = by.get(n);
    if (!b) continue;
    const tot = n * n;
    const path = b.vm ? "vm" : "legacy";
    console.log(
      String(n).padEnd(4) +
        path.padEnd(8) +
        String(b.hand0).padEnd(4) +
        String(b.tall0).padEnd(6) +
        ((100 * b.w) / b.d).toFixed(1).padEnd(8) +
        (b.w + "/" + b.d).padEnd(10) +
        ((b.p / b.d).toFixed(1) + "/" + tot).padEnd(12) +
        String(b.maxP).padEnd(6) +
        (b.sumMs / b.d).toFixed(0)
    );
  }
  console.log("-".repeat(70));
  for (let n = 3; n <= 8; n++) {
    const b = by.get(n);
    if (!b) continue;
    console.log(
      n +
        "x" +
        n +
        " wins=" +
        (b.winSeeds.slice(0, 12).join(",") || "-")
    );
  }
  console.log("wall " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
