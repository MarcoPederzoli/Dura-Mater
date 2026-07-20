"use strict";
/**
 * 7x7: G=2 | solo-2N legacy | solo-2N virtual-multi
 * Uso: node temp-solo2n-vs-g2-probe.js [seeds=40] [workers=7] [--n 7]
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
const MODES = ["g2", "solo2n", "solo2n_vm"];

async function main() {
  const jobs = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    for (const mode of MODES) jobs.push({ n: N, seed, mode });
  }
  console.log(
    "A/B G=2 | solo2n | solo2n_vm · N=" +
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
  let lastLog = 0;
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-solo2n-vs-g2-worker.js"),
    jobs,
    {
      workers: WORKERS,
      onProgress: (done, total) => {
        const now = Date.now();
        if (done === total || now - lastLog > 20000) {
          lastLog = now;
          process.stderr.write(
            "  " + done + "/" + total + " " + ((now - t0) / 1000).toFixed(0) + "s\n"
          );
        }
      }
    }
  );

  const by = new Map();
  const paired = new Map();
  for (const r of rows) {
    if (!r || r.error) {
      console.error("err", r && r.error);
      continue;
    }
    if (!by.has(r.mode)) {
      by.set(r.mode, {
        w: 0,
        d: 0,
        p: 0,
        maxP: 0,
        handTotal: r.handTotal,
        tall0: r.tall0,
        handSizes: r.handSizes,
        vmOn: r.vmOn,
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
      "hand".padEnd(8) +
      "tall".padEnd(6) +
      "ms"
  );
  console.log("-".repeat(70));
  for (const k of MODES) {
    const b = by.get(k);
    if (!b) continue;
    console.log(
      k.padEnd(12) +
        ((100 * b.w) / b.d).toFixed(1).padEnd(8) +
        (b.w + "/" + b.d).padEnd(10) +
        ((b.p / b.d).toFixed(1) + "/" + tot).padEnd(12) +
        String(b.maxP).padEnd(6) +
        String(b.handTotal).padEnd(8) +
        String(b.tall0).padEnd(6) +
        (b.sumMs / b.d).toFixed(0)
    );
  }
  console.log("-".repeat(70));

  let vmBeatsLegacy = 0;
  let vmBeatsG2 = 0;
  let g2BeatsVm = 0;
  let legacyBeatsVm = 0;
  for (const [, o] of paired) {
    if (!o.g2 || !o.solo2n || !o.solo2n_vm) continue;
    if (o.solo2n_vm.placed > o.solo2n.placed) vmBeatsLegacy++;
    if (o.solo2n.placed > o.solo2n_vm.placed) legacyBeatsVm++;
    if (o.solo2n_vm.placed > o.g2.placed) vmBeatsG2++;
    if (o.g2.placed > o.solo2n_vm.placed) g2BeatsVm++;
  }
  console.log(
    "depth: vm>legacy " +
      vmBeatsLegacy +
      " · legacy>vm " +
      legacyBeatsVm +
      " · vm>g2 " +
      vmBeatsG2 +
      " · g2>vm " +
      g2BeatsVm
  );
  for (const k of MODES) {
    const b = by.get(k);
    if (!b) continue;
    console.log(
      k +
        " wins=" +
        (b.winSeeds.slice(0, 12).join(",") || "-") +
        " hands=" +
        JSON.stringify(b.handSizes) +
        " vmFlag=" +
        b.vmOn
    );
  }
  console.log("wall " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
