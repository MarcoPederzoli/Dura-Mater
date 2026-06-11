"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createProgressReporter } = require("./cli-progress");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
const COUNT = Number(process.argv[2]) || 300;
const CELLS = [[3, 1], [3, 2], [3, 3]];

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function runCell(L, G) {
  const key = `${L}x${G}`;
  const strategy = G === 1 ? "durissima-planner" : "durissima-team-planner";
  let wins = 0;
  let vitaSum = 0;
  const random = core.mulberry32(core.hashSeed(`l3-probe:${L}:${G}`));
  const progress = createProgressReporter({ label: key, total: COUNT, interval: Math.max(10, Math.floor(COUNT / 20)) });
  progress.tick(0);
  for (let i = 0; i < COUNT; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: G,
      random,
      strategies: Array.from({ length: G }, () => strategy),
      durissimaMater: true,
      durissimaVitaExtraEnabled: true,
      randomizeTurnOrder: true
    });
    if (result.status === "success") wins++;
    vitaSum += result.durissimaVitaExtraUsed || 0;
    progress.tick(i + 1);
  }
  progress.done();
  const pct = (100 * wins / COUNT).toFixed(1);
  console.log(`${key}: ok ${wins}/${COUNT} (${pct}%) · vita med ${(vitaSum / COUNT).toFixed(2)}`);
  return { cell: key, L, G, done: COUNT, wins, stalls: COUNT - wins, vitaUsedSum: vitaSum };
}

process.stderr.write(`\nDurissima L=3 probe · pool N · bot strategico · ${COUNT} partite/cella\n\n`);

const cells = {};
for (const [L, G] of CELLS) {
  cells[`${L}x${G}`] = runCell(L, G);
}

const out = path.join(__dirname, "..", "tests", `dura-mater-durissima-l3-probe-${stamp()}.json`);
fs.writeFileSync(out, JSON.stringify({
  format: "dura-mater-durissima-l3-probe",
  variant: "pool-N-strategic-bot",
  countPerCell: COUNT,
  exportedAt: new Date().toISOString(),
  cells
}, null, 2), "utf8");
console.log(`\nScritto: ${out}`);