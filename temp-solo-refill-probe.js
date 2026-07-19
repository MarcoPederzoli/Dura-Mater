"use strict";
/**
 * Solitario G=1 equo: refill + policy turni corti.
 *
 * Uso:
 *   node temp-solo-refill-probe.js [seeds=40] [workers=7]
 *   node temp-solo-refill-probe.js 40 7 --nmin 4 --nmax 6
 *   node temp-solo-refill-probe.js 40 7 --modes short,chain,noref
 *
 * modes:
 *   short = refill ON + turni corti mid-game (default prodotto nuovo)
 *   chain = refill ON + catene mid-game (policy vecchia / trappola)
 *   noref = refill OFF + turni corti
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
function flagStr(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? String(argv[i + 1]) : def;
}

const ONLY_N = flagInt("--n", 0);
const NMIN = ONLY_N || flagInt("--nmin", 3);
const NMAX = ONLY_N || flagInt("--nmax", 8);
const MODE_LIST = flagStr("--modes", "short,chain,noref")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const MODE_SPEC = {
  short: { refill: true, midChains: false, label: "R+short" },
  chain: { refill: true, midChains: true, label: "R+chain" },
  noref: { refill: false, midChains: false, label: "noref" }
};

async function main() {
  const ns = [];
  for (let n = NMIN; n <= NMAX; n++) ns.push(n);
  const modes = MODE_LIST.filter(m => MODE_SPEC[m]);
  if (!modes.length) {
    console.error("modes invalidi; usa short,chain,noref");
    process.exit(1);
  }

  const jobs = [];
  for (const n of ns) {
    for (let seed = 0; seed < SEEDS; seed++) {
      for (const m of modes) {
        const sp = MODE_SPEC[m];
        jobs.push({
          n,
          seed,
          refill: sp.refill,
          midChains: sp.midChains,
          earlyAbort: true,
          mode: m
        });
      }
    }
  }

  console.log(
    "SOLO policy · modes=" +
      modes.join("+") +
      " · N=" +
      NMIN +
      ".." +
      NMAX +
      " · seeds=" +
      SEEDS +
      " · deals=" +
      jobs.length +
      " · workers=" +
      WORKERS +
      " · earlyAbort equo"
  );

  const t0 = Date.now();
  let lastLog = 0;
  const rows = await runWorkerPool(
    path.join(__dirname, "temp-solo-refill-worker.js"),
    jobs,
    {
      workers: WORKERS,
      onProgress: (done, total) => {
        const now = Date.now();
        if (done === total || now - lastLog > 15000) {
          lastLog = now;
          process.stderr.write(
            "  progress " +
              done +
              "/" +
              total +
              " (" +
              ((100 * done) / total).toFixed(0) +
              "%) " +
              ((now - t0) / 1000).toFixed(0) +
              "s\n"
          );
        }
      }
    }
  );

  // key: n|mode
  const by = new Map();
  for (const r of rows) {
    if (!r || r.error) {
      console.error("err", r && r.error);
      continue;
    }
    // infer mode from flags if worker non rimanda mode
    let mode = r.mode;
    if (!mode) {
      if (r.refill && r.midChains) mode = "chain";
      else if (r.refill) mode = "short";
      else mode = "noref";
    }
    const k = r.n + "|" + mode;
    if (!by.has(k)) {
      by.set(k, {
        n: r.n,
        mode,
        w: 0,
        d: 0,
        p: 0,
        maxP: 0,
        early: 0,
        t1: 0,
        t2: 0,
        t3: 0,
        t4: 0,
        t5: 0,
        maxIn: 0,
        winSeeds: []
      });
    }
    const b = by.get(k);
    b.d++;
    b.p += r.placed;
    if (r.placed > b.maxP) b.maxP = r.placed;
    if (r.win) {
      b.w++;
      b.winSeeds.push(r.seed);
    } else if (r.outcome === "lost_early") b.early++;
    b.t1 += r.turns1 || 0;
    b.t2 += r.turns2 || 0;
    b.t3 += r.turns3 || 0;
    b.t4 += r.turns4 || 0;
    b.t5 += r.turns5 || 0;
    if ((r.maxInTurn || 0) > b.maxIn) b.maxIn = r.maxInTurn;
  }

  console.log("");
  console.log(
    "N".padEnd(4) +
      "mode".padEnd(10) +
      "win%".padEnd(8) +
      "wins".padEnd(12) +
      "avgP".padEnd(12) +
      "maxP".padEnd(6) +
      "t1%".padEnd(7) +
      "t2%".padEnd(7) +
      "t3+%".padEnd(7) +
      "maxK"
  );
  console.log("-".repeat(80));

  for (const n of ns) {
    for (const m of modes) {
      const b = by.get(n + "|" + m);
      if (!b) continue;
      const tot = n * n;
      const turnSum = b.t1 + b.t2 + b.t3 + b.t4 + b.t5;
      const pct = x => (turnSum ? ((100 * x) / turnSum).toFixed(0) : "-");
      console.log(
        String(n).padEnd(4) +
          MODE_SPEC[m].label.padEnd(10) +
          ((100 * b.w) / b.d).toFixed(1).padEnd(8) +
          (b.w + "/" + b.d).padEnd(12) +
          ((b.p / b.d).toFixed(1) + "/" + tot).padEnd(12) +
          String(b.maxP).padEnd(6) +
          (pct(b.t1) + "%").padEnd(7) +
          (pct(b.t2) + "%").padEnd(7) +
          (pct(b.t3 + b.t4 + b.t5) + "%").padEnd(7) +
          String(b.maxIn)
      );
    }
  }

  console.log("-".repeat(80));
  console.log("Delta win% vs R+chain (trappola vecchia) e vs noref:");
  for (const n of ns) {
    const short = by.get(n + "|short");
    const chain = by.get(n + "|chain");
    const noref = by.get(n + "|noref");
    if (!short) continue;
    const wp = b => (b ? (100 * b.w) / b.d : NaN);
    const dChain = chain ? wp(short) - wp(chain) : null;
    const dNoref = noref ? wp(short) - wp(noref) : null;
    console.log(
      "  " +
        n +
        "x" +
        n +
        "  short=" +
        wp(short).toFixed(1) +
        "%" +
        (chain
          ? "  vs chain " +
            (dChain >= 0 ? "+" : "") +
            dChain.toFixed(1) +
            "pp"
          : "") +
        (noref
          ? "  vs noref " +
            (dNoref >= 0 ? "+" : "") +
            dNoref.toFixed(1) +
            "pp"
          : "") +
        (short.winSeeds.length
          ? "  wins=" + short.winSeeds.slice(0, 8).join(",")
          : "")
    );
  }

  console.log("");
  console.log("wall " + ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
