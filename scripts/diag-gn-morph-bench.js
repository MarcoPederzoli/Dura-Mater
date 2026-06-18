"use strict";

/**
 * Confronto morfologie 7x7 su seed bot-check 0..N-1.
 * Uso: node scripts/diag-gn-morph-bench.js [deals]
 * Env per figlio: GN_7X7_MORPH=9patch|frames|corners-first|cross|phased
 */

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const deals = Number(process.argv[2]) || 3;
const morphs = ["9patch", "frames", "corners-first", "outer-first", "phased"];
const stall = path.join(__dirname, "diag-gn-stall.js");

const rows = [];

for (const morph of morphs) {
  let wins = 0;
  let fillSum = 0;
  const details = [];
  for (let seed = 0; seed < deals; seed++) {
    const r = spawnSync(process.execPath, [stall, "7", String(seed)], {
      env: { ...process.env, GN_7X7_MORPH: morph },
      encoding: "utf8",
      timeout: 30 * 60 * 1000
    });
    const out = (r.stdout || "") + (r.stderr || "");
    const m = out.match(/seed (\d+): (\w+) (\d+)\/49/);
    if (!m) {
      details.push("s" + seed + ":?");
      continue;
    }
    const fill = Number(m[3]);
    fillSum += fill;
    if (m[2] === "success" && fill === 49) wins++;
    const empty = (out.match(/empty: (.+)/) || [])[1] || "";
    details.push("s" + seed + ":" + fill + (empty ? "(" + empty.trim() + ")" : ""));
  }
  rows.push({ morph, wins, avg: (fillSum / deals).toFixed(1), details: details.join(" ") });
}

process.stdout.write("Morfologia 7x7 · " + deals + " seed\n");
process.stdout.write("morph           wins  avgFill  dettaglio\n");
for (const row of rows) {
  process.stdout.write(
    row.morph.padEnd(16) + row.wins + "/" + deals
      + "   " + row.avg + "     " + row.details + "\n"
  );
}
let best = rows[0];
for (const row of rows) {
  if (row.wins > best.wins || (row.wins === best.wins && Number(row.avg) > Number(best.avg))) {
    best = row;
  }
}
process.stdout.write("\nPiu promettente: " + best.morph + " (" + best.wins + "/" + deals + " win, avg " + best.avg + ")\n");