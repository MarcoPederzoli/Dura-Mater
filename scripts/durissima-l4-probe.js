"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  defaultCliWorkers,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./cpu-workers");
const { createProgressReporter } = require("./cli-progress");
const { playableGForSize } = require("./sweep-cells");
const { runCellChunk } = require("./durissima-pool-sweep-lib");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const argv = filterArgv(process.argv.slice(2));
const WORKERS = parseWorkersFlag(process.argv.slice(2), defaultCliWorkers());
const COUNT = Number(argv[0]) || 500;
const L = 4;

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function cellLabel(G) {
  const gMin = core.recommendedMinPlayers(L);
  const deal = core.computeInitialDeal(L, G);
  let tag = "";
  if (G === 1) tag = "solitario";
  else if (G < gMin) tag = "sotto-G";
  else if (G === L) tag = "G=N";
  else if (G > L) tag = "overcrowd";
  else tag = "banda";
  return `${L}x${G} (${deal.cardsPerPlayer}/${deal.drawCount}) [${tag}]`;
}

async function main() {
  const gList = playableGForSize(core, L, { allLegal: true });
  if (!gList.length) {
    process.stderr.write("Nessuna cella legale per 4x4.\n");
    process.exit(1);
  }

  const gMin = core.recommendedMinPlayers(L);
  const seedTag = `l4-probe-${stamp()}`;
  const tasks = gList.map((G, index) => ({
    L,
    G,
    count: COUNT,
    seedTag,
    chunkIndex: index
  }));

  process.stderr.write(
    `\nDurissima L=4 probe · tutte le G legali (${gList.length} celle) · ${COUNT} partite/cella\n` +
      `G_min=${gMin} (ceil(N/2)) · worker=${WORKERS}/${logicalCpuCount()} logici\n\n`
  );

  const started = Date.now();
  const progress = createProgressReporter({ label: "celle", total: tasks.length, interval: 1 });
  progress.tick(0);

  const chunkResults = await runWorkerPool(
    path.join(__dirname, "durissima-pool-sweep-worker.js"),
    tasks,
    {
      workers: WORKERS,
      onProgress(done) {
        progress.tick(done);
      }
    }
  );
  progress.done();

  const cells = {};
  const rows = [];
  for (const chunk of chunkResults) {
    const key = chunk.key;
    const winPct = (100 * chunk.wins / chunk.done).toFixed(1);
    const vitaMed = (chunk.vitaUsedSum / chunk.done).toFixed(2);
    const turnsMed = (chunk.turnSum / chunk.done).toFixed(1);
    cells[key] = {
      cell: key,
      L: chunk.L,
      G: chunk.G,
      category: chunk.category,
      gMin,
      belowGMin: chunk.G < gMin,
      initialHandSize: chunk.initialHandSize,
      initialDrawCount: chunk.initialDrawCount,
      done: chunk.done,
      wins: chunk.wins,
      stalls: chunk.stalls,
      winPct: Number(winPct),
      vitaUsedSum: chunk.vitaUsedSum,
      vitaMed: Number(vitaMed),
      turnSum: chunk.turnSum,
      turnsMed: Number(turnsMed)
    };
    rows.push(cells[key]);
    console.log(
      `${cellLabel(chunk.G)}: ok ${chunk.wins}/${chunk.done} (${winPct}%)` +
        ` · turni med ${turnsMed} · vita med ${vitaMed}`
    );
  }

  rows.sort((a, b) => a.G - b.G);
  const below = rows.filter(r => r.belowGMin);
  const atOrAbove = rows.filter(r => !r.belowGMin);
  const minAbove = atOrAbove.length
    ? Math.min(...atOrAbove.map(r => r.winPct))
    : null;

  console.log(`\n--- Riepilogo 4x4 (G_min=${gMin}) ---`);
  if (below.length) {
    console.log(
      `Sotto-G (${below.map(r => r.G).join(", ")}): ` +
        below.map(r => `${r.cell} ${r.winPct}%`).join(" · ")
    );
  }
  if (atOrAbove.length) {
    console.log(
      `G >= G_min: min ${minAbove}% · ` +
        atOrAbove.map(r => `${r.cell} ${r.winPct}%`).join(" · ")
    );
  }

  const out = path.join(__dirname, "..", "tests", `dura-mater-durissima-l4-probe-${stamp()}.json`);
  fs.writeFileSync(out, JSON.stringify({
    format: "dura-mater-durissima-l4-probe",
    variant: "pool-N-strategic-bot",
    size: L,
    gMin,
    allLegal: true,
    legalG: gList,
    countPerCell: COUNT,
    workers: WORKERS,
    durationMs: Date.now() - started,
    exportedAt: new Date().toISOString(),
    cells
  }, null, 2), "utf8");
  console.log(`\nScritto: ${out}`);
}

main().catch(err => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});