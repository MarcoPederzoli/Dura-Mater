"use strict";
/**
 * Hunt: almeno 1 vittoria per ogni config legale G>1 (N=3..8)
 * con regola refill Durissima (default core).
 *
 * Uso:
 *   node temp-durissima-refill-hunt.js [workers=7]
 *   node temp-durissima-refill-hunt.js 7 --maxseed 200 --only-zeros
 *   node temp-durissima-refill-hunt.js 7 --nmin 6 --nmax 8
 *
 * Strategia: per ogni cella, batch paralleli su (namespace x seed)
 * fino a prima win o maxseed * namespaces.
 */
const path = require("path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const WORKERS = Math.max(1, Math.min(8, parseInt(process.argv[2] || "7", 10) || 7));
const argv = process.argv.slice(2);
function flagInt(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 ? parseInt(argv[i + 1], 10) : def;
}
function hasFlag(name) {
  return argv.includes(name);
}

const NMIN = flagInt("--nmin", 3);
const NMAX = flagInt("--nmax", 8);
const MAXSEED = flagInt("--maxseed", 120);
const BATCH = flagInt("--batch", 40);
// Namespace multipli = deal diversi a parita' di seed index (come hunt storico)
const NAMESPACES = [
  "dur-refill",
  "gltN",
  "huntA",
  "huntB",
  "huntC",
  "huntD",
  "huntE",
  "huntF"
];

function maxG(n) {
  return Math.min(2 * n, Math.floor((n * n) / 3), 16);
}

function allConfigs() {
  const out = [];
  for (let n = NMIN; n <= NMAX; n++) {
    const mg = maxG(n);
    for (let g = 2; g <= mg; g++) {
      const cards = g > n ? Math.floor((n * n) / g) : n;
      if (cards >= 3) out.push({ n, g, under: g < n });
    }
  }
  return out;
}

// Celle a 0/20 nel probe refill 2026-07-18 (priorita' hunt)
const KNOWN_ZEROS = new Set([
  "6x3",
  "7x2",
  "7x6",
  "8x2",
  "8x3",
  "8x7"
]);

async function huntCell(n, g) {
  const key = n + "x" + g;
  const hits = [];
  let tried = 0;
  let sumP = 0;
  let maxP = 0;
  const t0 = Date.now();

  for (let base = 0; base < MAXSEED && hits.length === 0; base += BATCH) {
    const end = Math.min(MAXSEED, base + BATCH);
    const jobs = [];
    for (const ns of NAMESPACES) {
      for (let seed = base; seed < end; seed++) {
        jobs.push({ n, g, seed, ns });
      }
    }
    const rows = await runWorkerPool(
      path.join(__dirname, "temp-hunt-worker.js"),
      jobs,
      { workers: WORKERS }
    );
    for (const r of rows) {
      if (!r || r.error) continue;
      tried++;
      const p = r.placed || 0;
      sumP += p;
      if (p > maxP) maxP = p;
      if (p >= n * n) {
        hits.push((r.ns || "?") + ":" + r.seed);
      }
    }
    if (hits.length > 0) break;
    process.stdout.write(
      "  " +
        key +
        " ... seeds " +
        end +
        "/" +
        MAXSEED +
        " x" +
        NAMESPACES.length +
        " ns  maxP=" +
        maxP +
        "/" +
        n * n +
        "\n"
    );
  }

  return {
    n,
    g,
    key,
    win: hits.length > 0,
    hits: hits.slice(0, 8),
    tried,
    avgP: tried ? sumP / tried : 0,
    maxP,
    ms: Date.now() - t0
  };
}

async function main() {
  let configs = allConfigs();
  if (hasFlag("--only-zeros")) {
    configs = configs.filter(c => KNOWN_ZEROS.has(c.n + "x" + c.g));
  }
  // Prima G<N (difficili), poi G>=N (dovrebbero chiudere subito)
  configs.sort((a, b) => {
    if (a.under !== b.under) return a.under ? -1 : 1;
    return a.n - b.n || a.g - b.g;
  });

  console.log(
    "HUNT refill G>1 · N=" +
      NMIN +
      ".." +
      NMAX +
      " · cells=" +
      configs.length +
      " · maxseed=" +
      MAXSEED +
      " · ns=" +
      NAMESPACES.length +
      " · batch=" +
      BATCH +
      " · workers=" +
      WORKERS +
      (hasFlag("--only-zeros") ? " · ONLY known zeros" : "")
  );

  const wall0 = Date.now();
  const results = [];
  let missing = 0;

  for (const c of configs) {
    // G>=N: una manciata di seed basta (probe era 100%)
    const maxSave = MAXSEED;
    if (!c.under) {
      // override locale: max 5 seed x 1 ns
      const jobs = [];
      for (let seed = 0; seed < 5; seed++) {
        jobs.push({ n: c.n, g: c.g, seed, ns: "dur-refill" });
      }
      const rows = await runWorkerPool(
        path.join(__dirname, "temp-hunt-worker.js"),
        jobs,
        { workers: WORKERS }
      );
      const hits = [];
      let tried = 0;
      let sumP = 0;
      let maxP = 0;
      for (const r of rows) {
        if (!r || r.error) continue;
        tried++;
        sumP += r.placed || 0;
        if ((r.placed || 0) > maxP) maxP = r.placed;
        if ((r.placed || 0) >= c.n * c.n) hits.push("dur-refill:" + r.seed);
      }
      const row = {
        n: c.n,
        g: c.g,
        key: c.n + "x" + c.g,
        win: hits.length > 0,
        hits: hits.slice(0, 5),
        tried,
        avgP: tried ? sumP / tried : 0,
        maxP,
        under: false
      };
      results.push(row);
      console.log(
        (row.win ? "OK  " : "FAIL") +
          " " +
          row.key.padEnd(6) +
          " G>=N  " +
          (row.win ? row.hits[0] : "no win") +
          "  maxP=" +
          row.maxP +
          "/" +
          c.n * c.n
      );
      if (!row.win) missing++;
      continue;
    }

    const row = await huntCell(c.n, c.g);
    row.under = true;
    results.push(row);
    console.log(
      (row.win ? "OK  " : "FAIL") +
        " " +
        row.key.padEnd(6) +
        " tried=" +
        String(row.tried).padEnd(6) +
        " maxP=" +
        row.maxP +
        "/" +
        c.n * c.n +
        "  " +
        (row.win ? "YES " + row.hits[0] : "NO") +
        "  " +
        (row.ms / 1000).toFixed(0) +
        "s"
    );
    if (!row.win) missing++;
  }

  console.log("");
  console.log("=".repeat(60));
  const under = results.filter(r => r.under);
  const okU = under.filter(r => r.win).length;
  const okAll = results.filter(r => r.win).length;
  console.log(
    "G<N: " +
      okU +
      "/" +
      under.length +
      " con >=1 win  |  ALL G>1: " +
      okAll +
      "/" +
      results.length +
      "  missing=" +
      missing +
      "  wall " +
      ((Date.now() - wall0) / 1000).toFixed(0) +
      "s"
  );
  if (missing > 0) {
    console.log(
      "SENZA WIN:",
      results
        .filter(r => !r.win)
        .map(r => r.key + "(maxP=" + r.maxP + ")")
        .join(", ")
    );
  } else {
    console.log("OBIETTIVO RAGGIUNTO: >=1 win su tutte le combinazioni legali G>1 testate.");
  }
  console.log("");
  console.log("Seed vincente (prima hit per cella G<N):");
  for (const r of under) {
    console.log(
      "  " +
        r.key.padEnd(6) +
        (r.win ? r.hits[0] : "—") +
        (r.hits.length > 1 ? "  (+" + (r.hits.length - 1) + " nel batch)" : "")
    );
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
