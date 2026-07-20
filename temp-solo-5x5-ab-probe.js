"use strict";
/**
 * 5x5: legacy+2N vs virtual-multi+2N
 * Uso: node temp-solo-5x5-ab-probe.js [seeds=100] [workers=7]
 */
const path = require("path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const SEEDS = Math.max(5, parseInt(process.argv[2] || "100", 10) || 100);
const WORKERS = Math.max(1, Math.min(8, parseInt(process.argv[3] || "7", 10) || 7));

async function main() {
  const jobs = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    jobs.push({ n: 5, seed, mode: "legacy2n" });
    jobs.push({ n: 5, seed, mode: "vm2n" });
  }
  console.log(
    "5x5 A/B · legacy+2N vs vm+2N · seeds=" +
      SEEDS +
      " · deals=" +
      jobs.length +
      " · workers=" +
      WORKERS +
      " · refill ON"
  );
  const t0 = Date.now();
  let last = 0;
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-solo-5x5-ab-worker.js"),
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
  const paired = new Map();
  for (const r of rows) {
    if (!r || r.error) {
      console.error(r && r.error);
      continue;
    }
    if (!by.has(r.mode)) {
      by.set(r.mode, {
        w: 0,
        d: 0,
        p: 0,
        maxP: 0,
        hand0: r.hand0,
        tall0: r.tall0,
        vm: r.vmOn,
        sumMs: 0,
        wins: [],
        near: 0
      });
    }
    const b = by.get(r.mode);
    b.d++;
    b.p += r.placed;
    b.sumMs += r.ms || 0;
    if (r.placed > b.maxP) b.maxP = r.placed;
    if (r.win) {
      b.w++;
      b.wins.push(r.seed);
    } else if (r.placed >= 22) b.near++;
    if (!paired.has(r.seed)) paired.set(r.seed, {});
    paired.get(r.seed)[r.mode] = r;
  }

  console.log("");
  console.log(
    "mode".padEnd(12) +
      "H".padEnd(4) +
      "tall".padEnd(6) +
      "vm".padEnd(4) +
      "win%".padEnd(8) +
      "wins".padEnd(10) +
      "avgP".padEnd(12) +
      "max".padEnd(5) +
      "near".padEnd(6) +
      "ms"
  );
  console.log("-".repeat(75));
  for (const k of ["legacy2n", "vm2n"]) {
    const b = by.get(k);
    if (!b) continue;
    console.log(
      k.padEnd(12) +
        String(b.hand0).padEnd(4) +
        String(b.tall0).padEnd(6) +
        String(b.vm).padEnd(4) +
        ((100 * b.w) / b.d).toFixed(1).padEnd(8) +
        (b.w + "/" + b.d).padEnd(10) +
        ((b.p / b.d).toFixed(1) + "/25").padEnd(12) +
        String(b.maxP).padEnd(5) +
        String(b.near).padEnd(6) +
        (b.sumMs / b.d).toFixed(0)
    );
  }
  let both = 0,
    onlyL = 0,
    onlyV = 0,
    neither = 0;
  for (const [, o] of paired) {
    if (!o.legacy2n || !o.vm2n) continue;
    const lw = o.legacy2n.win,
      vw = o.vm2n.win;
    if (lw && vw) both++;
    else if (lw) onlyL++;
    else if (vw) onlyV++;
    else neither++;
  }
  console.log(
    "paired: bothWin=" +
      both +
      " onlyLegacy=" +
      onlyL +
      " onlyVm=" +
      onlyV +
      " neither=" +
      neither
  );
  for (const k of ["legacy2n", "vm2n"]) {
    const b = by.get(k);
    if (!b) continue;
    console.log(k + " seeds=" + (b.wins.slice(0, 25).join(",") || "-"));
  }
  console.log("wall " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
