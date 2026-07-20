"use strict";
/**
 * Solo mano N: legacy vs virtual-multi
 * Uso: node temp-solo-vm-handN-probe.js [seeds=40] [workers=7] [--n 7]
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
const N = flagInt("--n", 7);

async function main() {
  const jobs = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    jobs.push({ n: N, seed, mode: "soloN" });
    jobs.push({ n: N, seed, mode: "soloN_vm" });
  }
  console.log(
    "Solo mano N · legacy vs virtual-multi · N=" +
      N +
      " · seeds=" +
      SEEDS +
      " · deals=" +
      jobs.length +
      " · workers=" +
      WORKERS +
      " · refill OFF"
  );
  const t0 = Date.now();
  let last = 0;
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-solo-vm-handN-worker.js"),
    jobs,
    {
      workers: WORKERS,
      onProgress: (d, t) => {
        const now = Date.now();
        if (d === t || now - last > 20000) {
          last = now;
          process.stderr.write("  " + d + "/" + t + " " + ((now - t0) / 1000).toFixed(0) + "s\n");
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
        sumMs: 0,
        winSeeds: []
      });
    }
    const b = by.get(r.mode);
    b.d++;
    b.p += r.placed;
    b.sumMs += r.ms || 0;
    if (r.placed > b.maxP) b.maxP = r.placed;
    if (r.win) {
      b.w++;
      b.winSeeds.push(r.seed);
    }
    if (!paired.has(r.seed)) paired.set(r.seed, {});
    paired.get(r.seed)[r.mode] = r;
  }
  const tot = N * N;
  console.log("");
  console.log(
    "mode".padEnd(12) +
      "win%".padEnd(8) +
      "wins".padEnd(10) +
      "avgP".padEnd(12) +
      "maxP".padEnd(6) +
      "hand".padEnd(6) +
      "tall".padEnd(6) +
      "ms"
  );
  console.log("-".repeat(68));
  for (const k of ["soloN", "soloN_vm"]) {
    const b = by.get(k);
    if (!b) continue;
    console.log(
      k.padEnd(12) +
        ((100 * b.w) / b.d).toFixed(1).padEnd(8) +
        (b.w + "/" + b.d).padEnd(10) +
        ((b.p / b.d).toFixed(1) + "/" + tot).padEnd(12) +
        String(b.maxP).padEnd(6) +
        String(b.hand0).padEnd(6) +
        String(b.tall0).padEnd(6) +
        (b.sumMs / b.d).toFixed(0)
    );
  }
  let vmBetter = 0;
  let legBetter = 0;
  for (const [, o] of paired) {
    if (!o.soloN || !o.soloN_vm) continue;
    if (o.soloN_vm.placed > o.soloN.placed) vmBetter++;
    if (o.soloN.placed > o.soloN_vm.placed) legBetter++;
  }
  console.log("depth: vm>legacy " + vmBetter + " · legacy>vm " + legBetter);
  for (const k of ["soloN", "soloN_vm"]) {
    const b = by.get(k);
    if (!b) continue;
    console.log(k + " wins=" + (b.winSeeds.slice(0, 15).join(",") || "-"));
  }
  console.log("wall " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
