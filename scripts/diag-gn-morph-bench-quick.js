"use strict";

/** Screen morfologie 7x7 su seed 0 (veloce). Uso: node scripts/diag-gn-morph-bench-quick.js */
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const morphs = ["9patch", "frames", "corners-first", "outer-first", "phased"];
const stall = path.join(__dirname, "diag-gn-stall.js");
const rows = [];

for (const morph of morphs) {
  const r = spawnSync(process.execPath, [stall, "7", "0"], {
    env: { ...process.env, GN_7X7_MORPH: morph },
    encoding: "utf8",
    timeout: 20 * 60 * 1000
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/seed 0: (\w+) (\d+)\/49/);
  const fill = m ? Number(m[2]) : -1;
  const status = m ? m[1] : "err";
  rows.push({ morph, status, fill });
}

rows.sort((a, b) => b.fill - a.fill);
process.stdout.write("seed 0 screen:\n");
for (const row of rows) {
  process.stdout.write(row.morph.padEnd(16) + row.status + " " + row.fill + "/49\n");
}
process.stdout.write("top: " + rows[0].morph + "\n");