"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createProgressReporter } = require("./cli-progress");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const QUICK = !process.argv.includes("--full");
const COUNT = QUICK ? 120 : 300;

const CELLS = QUICK
  ? [[3, 1], [5, 1], [5, 5], [5, 8], [8, 8], [8, 16]]
  : [
      ...Array.from({ length: 6 }, (_, i) => [i + 3, 1]),
      [3, 2], [3, 3], [5, 3], [5, 5], [5, 8], [7, 7], [7, 10], [8, 8], [8, 16]
    ];

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function playableCells() {
  return CELLS.filter(([L, G]) => core.isPlayableSetup(L, G));
}

function runCell(L, G, cellIndex, cellTotal) {
  const key = `${L}x${G}`;
  const stats = { done: 0, stalls: 0, emergSum: 0, afterSum: 0 };
  const random = core.mulberry32(core.hashSeed(`rules-probe:${L}:${G}`));
  const progress = createProgressReporter({
    label: `cella ${cellIndex}/${cellTotal} ${key}`,
    total: COUNT,
    interval: QUICK ? 10 : 15
  });

  progress.tick(0);
  for (let i = 0; i < COUNT; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: G,
      random,
      strategies: Array.from({ length: G }, () => "durissima-planner"),
      durissimaMater: true,
      randomizeTurnOrder: true
    });
    stats.done++;
    if (result.status !== "success") stats.stalls++;
    stats.emergSum += result.durissimaEmergencyDrawsUsed || 0;
    stats.afterSum += result.durissimaAfterPlayDrawsUsed || 0;
    progress.tick(i + 1);
  }
  progress.done();
  return stats;
}

function main() {
  const cells = playableCells();
  const totalGames = cells.length * COUNT;
  const mode = QUICK ? "quick" : "full";

  process.stderr.write(
    `\nDurissima rules probe (${mode}): ${cells.length} celle × ${COUNT} partite = ${totalGames} simulazioni\n\n`
  );

  const steps = [];
  const allCells = {};

  cells.forEach(([L, G], index) => {
    const key = `${L}x${G}`;
    const stats = runCell(L, G, index + 1, cells.length);
    const stepId = `durissima-rules-probe-${key}`;
    steps.push({ stepId, cells: { [key]: stats } });
    allCells[key] = { ...stats, cell: key };
    const ok = ((stats.done - stats.stalls) / stats.done * 100).toFixed(1);
    const draw = core.computeInitialDeal(L, G).drawCount;
    console.log(
      `${key} (mazzo ${draw}): ok ${ok}% emerg/med ${(stats.emergSum / stats.done).toFixed(2)} after/med ${(stats.afterSum / stats.done).toFixed(2)}`
    );
  });

  const out = path.join(__dirname, "..", "tests", `dura-mater-durissima-rules-probe-${stamp()}.json`);
  fs.writeFileSync(
    out,
    JSON.stringify({
      format: "dura-mater-durissima-rules-probe-cli",
      workflowId: QUICK ? "durissima-rules-probe-quick" : "durissima-rules-probe",
      exportedAt: new Date().toISOString(),
      countPerCell: COUNT,
      steps,
      cells: allCells
    }, null, 2),
    "utf8"
  );
  console.log(`\nScritto: ${out}`);
  process.stderr.write("\nProbe completato.\n");
}

main();