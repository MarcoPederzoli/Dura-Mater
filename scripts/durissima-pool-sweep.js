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
const { parseAllLegalFlag, buildCellPairs } = require("./sweep-cells");
const { mergeChunkResults, buildChunkTasks } = require("./durissima-pool-sweep-lib");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;

const ALL_LEGAL = parseAllLegalFlag(process.argv);
const argv = filterArgv(process.argv.slice(2));
const WORKERS = parseWorkersFlag(process.argv.slice(2), defaultCliWorkers());
const COUNT = Number(argv[0]) || 1000;
const CHUNKS = Number(argv[1]) || WORKERS;

function usage() {
  process.stderr.write(
    "Uso: node scripts/durissima-pool-sweep.js [partite/cella] [chunk] [--workers N] [--all-legal]\n" +
      "Default: 1000 partite/cella, pool N reshuffle strategico, bot durissima-planner / team-planner.\n" +
      "  Durissima: G=1..2N (senza G_min competitivo). --all-legal = stesso default.\n" +
      "  --workers N  parallelismo (default: core logici - 1).\n" +
      "Es.: node scripts/durissima-pool-sweep.js 1000 --all-legal --workers 7\n"
  );
  process.exit(1);
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) usage();
  if (!Number.isFinite(COUNT) || COUNT < 1) {
    process.stderr.write("Numero partite non valido.\n");
    process.exit(1);
  }

  const sizes = [3, 4, 5, 6, 7, 8];
  const cells = buildCellPairs(core, sizes, { durissima: true, allLegal: ALL_LEGAL });
  if (!cells.length) {
    process.stderr.write("Nessuna cella da simulare.\n");
    process.exit(1);
  }

  const seedTag = `durissima-pool-N-v1-${stamp()}`;
  const tasks = buildChunkTasks(cells, COUNT, seedTag, CHUNKS);
  const totalGames = cells.length * COUNT;

  process.stderr.write(
    `\nDurissima pool-N sweep: ${cells.length} celle  x  ${COUNT} partite = ${totalGames} simulazioni` +
      `${ALL_LEGAL ? " · --all-legal" : " · G>=G_min"}\n` +
      `Variante: pool N reshuffle (durissimaVitaExtraEnabled, budget=N) · chunk=${CHUNKS} · worker=${WORKERS}/${logicalCpuCount()} logici\n\n`
  );

  const started = Date.now();
  const progress = createProgressReporter({
    label: "chunk",
    total: tasks.length,
    interval: 1
  });
  progress.tick(0);

  const chunkResults = await runWorkerPool("durissima-pool-sweep-worker.js", tasks, {
    workers: WORKERS,
    onProgress(done) {
      progress.tick(done);
    }
  });
  progress.done();

  const merged = mergeChunkResults(chunkResults);
  const allCells = {};
  const rows = [];

  for (const [L, G] of cells) {
    const key = `${L}x${G}`;
    const stats = merged.get(key);
    if (!stats) continue;
    allCells[key] = stats;
    const winPct = (100 * stats.wins / stats.done).toFixed(1);
    const avgTurns = (stats.turnSum / stats.done).toFixed(1);
    const vitaMed = (stats.vitaUsedSum / stats.done).toFixed(2);
    rows.push({ key, winPct, avgTurns, vitaMed, stats });
    console.log(
      `${key} (${stats.initialHandSize}/${stats.initialDrawCount}): ` +
        `ok ${winPct}% · turni med ${avgTurns} · vita med ${vitaMed} · stalli ${stats.stalls}`
    );
  }

  const durationMs = Date.now() - started;
  const out = path.join(__dirname, "..", "tests", `dura-mater-durissima-pool-N-sweep-${stamp()}.json`);
  const payload = {
    format: "dura-mater-durissima-pool-sweep-cli",
    workflowId: "durissima-pool-N-all-legal",
    variant: "n-reshuffle",
    durissimaVitaExtraEnabled: true,
    durissimaVitaExtraBudget: "N (size)",
    durissimaEmergencyDrawBudget: 0,
    strategySolo: "durissima-planner",
    strategyMulti: "durissima-team-planner",
    allLegal: ALL_LEGAL,
    exportedAt: new Date().toISOString(),
    countPerCell: COUNT,
    cells: allCells,
    cellCount: cells.length,
    gamesSimulated: totalGames,
    workers: WORKERS,
    chunksPerCell: CHUNKS,
    durationMs,
    durationHuman: `${(durationMs / 1000).toFixed(1)}s`,
    seedTag
  };

  fs.writeFileSync(out, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\nScritto: ${out}`);
  process.stderr.write(`\nSweep completato in ${payload.durationHuman} (${WORKERS} worker).\n`);
}

main().catch(err => {
  process.stderr.write(`Errore: ${err?.message || err}\n`);
  process.exit(1);
});