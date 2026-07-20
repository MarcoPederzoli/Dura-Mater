"use strict";
/**
 * Solo 2N + virtual-multi + refill ON
 * Uso: node temp-solo-vm-2n-probe.js [seeds=100] [workers=7] [--n 7]
 */
const path = require("path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const SEEDS = Math.max(5, parseInt(process.argv[2] || "100", 10) || 100);
const WORKERS = Math.max(1, Math.min(8, parseInt(process.argv[3] || "7", 10) || 7));
const argv = process.argv.slice(2);
function flagInt(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? parseInt(argv[i + 1], 10) : def;
}
const N = flagInt("--n", 7);

async function main() {
  const jobs = [];
  for (let seed = 0; seed < SEEDS; seed++) jobs.push({ n: N, seed });
  console.log(
    "Solo 2N + virtual-multi + refill · N=" +
      N +
      " · seeds=" +
      SEEDS +
      " · workers=" +
      WORKERS +
      " · hash solo-vm-2n-refill:n:seed"
  );
  const t0 = Date.now();
  let last = 0;
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-solo-vm-2n-worker.js"),
    jobs,
    {
      workers: WORKERS,
      onProgress: (d, t) => {
        const now = Date.now();
        if (d === t || now - last > 15000) {
          last = now;
          process.stderr.write(
            "  " + d + "/" + t + " " + ((now - t0) / 1000).toFixed(0) + "s\n"
          );
        }
      }
    }
  );

  let w = 0;
  let d = 0;
  let p = 0;
  let maxP = 0;
  let sumMs = 0;
  let hand0 = 0;
  let tall0 = 0;
  let refillOn = 0;
  let vmOn = 0;
  const winSeeds = [];
  const hist = {};

  for (const r of rows) {
    if (!r || r.error) {
      console.error("err", r && r.error);
      continue;
    }
    d++;
    p += r.placed;
    sumMs += r.ms || 0;
    hand0 = r.hand0;
    tall0 = r.tall0;
    refillOn = r.refillOn;
    vmOn = r.vmOn;
    if (r.placed > maxP) maxP = r.placed;
    hist[r.placed] = (hist[r.placed] || 0) + 1;
    if (r.win) {
      w++;
      winSeeds.push(r.seed);
    }
  }

  const tot = N * N;
  console.log("");
  console.log("=== Solo " + N + "x" + N + " · mano 2N · virtual-multi · refill ON ===");
  console.log("deals: " + d);
  console.log(
    "flags: hand0=" +
      hand0 +
      " tall0=" +
      tall0 +
      " refill=" +
      refillOn +
      " virtualMulti=" +
      vmOn
  );
  console.log(
    "win%: " +
      ((100 * w) / d).toFixed(1) +
      "%  (" +
      w +
      "/" +
      d +
      ")" +
      (winSeeds.length ? "  seeds: " + winSeeds.join(",") : "")
  );
  console.log(
    "avgP: " +
      (p / d).toFixed(1) +
      "/" +
      tot +
      "  maxP: " +
      maxP +
      "  ms/deal: " +
      (sumMs / d).toFixed(0)
  );
  // near-miss: placed >= tot-3
  let near = 0;
  for (const r of rows) {
    if (r && !r.error && r.placed >= tot - 3 && !r.win) near++;
  }
  console.log("near-miss (placed >= " + (tot - 3) + ", no win): " + near);
  console.log("wall " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
