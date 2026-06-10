"use strict";

const fs = require("fs");
const path = require("path");
const {
  defaultCliWorkers,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./cpu-workers");
const { createProgressReporter } = require("./cli-progress");
const {
  cellsForSize,
  writeAuditOutput,
  buildManifestEntry
} = require("./tournament-audit-lib");

const argv = filterArgv(process.argv.slice(2));
const WORKERS = parseWorkersFlag(process.argv.slice(2), defaultCliWorkers());
const COUNT = Number(argv[1]) || 300;
const STRATEGY = argv[2] || "planner";
const sizes = (argv[0] || "3,4,5")
  .split(",")
  .map(s => Number(s.trim()))
  .filter(n => Number.isInteger(n) && n >= 3 && n <= 8);

if (!sizes.length) {
  process.stderr.write("Uso: node scripts/tournament-audit.js <N[,N...]> [tornei/cella] [strategia] [--workers N]\n");
  process.stderr.write("Es.: node scripts/tournament-audit.js 3,4,5 300 planner --workers 8\n");
  process.exit(1);
}

async function auditSize(size) {
  const cells = cellsForSize(size);
  const seedTag = `v1-N${size}`;
  const started = Date.now();
  process.stderr.write(
    `\n[N=${size}] ${cells.length} combinazioni · ${COUNT} tornei/cella · ${STRATEGY} · ${WORKERS} worker\n`
  );

  const progress = createProgressReporter({
    label: `audit ${size}x*`,
    total: cells.length,
    interval: 1
  });
  progress.tick(0);

  const tasks = cells.map(cell => ({
    cell,
    count: COUNT,
    strategy: STRATEGY,
    seedTag
  }));

  const cellResults = await runWorkerPool("tournament-audit-worker.js", tasks, {
    workers: WORKERS,
    onProgress(done) {
      progress.tick(done);
    }
  });
  progress.done();

  const durationMs = Date.now() - started;
  const payload = buildManifestEntry(size, COUNT, STRATEGY, WORKERS, durationMs, cellResults);
  const filename = `audit-N${size}-c${COUNT}-${STRATEGY}.json`;
  const outPath = writeAuditOutput(filename, payload);

  process.stderr.write(`Salvato: ${outPath} (${payload.durationHuman})\n`);
  return { size, outPath, payload };
}

function updateIndex(results) {
  const dir = path.join(__dirname, "..", "results", "tournament-audit");
  const indexPath = path.join(dir, "index.json");
  let index = { version: 1, runs: [] };
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch (_) {
      index = { version: 1, runs: [] };
    }
  }
  for (const r of results) {
    index.runs.push({
      size: r.size,
      file: path.basename(r.outPath),
      generatedAt: r.payload.generatedAt,
      countPerCell: r.payload.countPerCell,
      strategy: r.payload.strategy,
      cells: r.payload.cells,
      durationMs: r.payload.durationMs,
      tournamentsCompleted: r.payload.tournamentsCompleted
    });
  }
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");
  return indexPath;
}

async function main() {
  const globalStart = Date.now();
  process.stderr.write(
    `Torneo audit · griglie ${sizes.join(",")} · ${COUNT} tornei/cella · CPU ${logicalCpuCount()} logici · ${WORKERS} worker\n`
  );

  const results = [];
  for (const size of sizes) {
    results.push(await auditSize(size));
  }

  const indexPath = updateIndex(results);
  const totalMs = Date.now() - globalStart;
  const totalCells = results.reduce((s, r) => s + r.payload.cells, 0);
  const totalTournaments = results.reduce((s, r) => s + r.payload.tournamentsTotal, 0);

  console.log("\n=== RIEPILOGO AUDIT ===\n");
  for (const r of results) {
    console.log(
      `N=${r.size}: ${r.payload.cells} combinazioni · ${r.payload.tournamentsCompleted}/${r.payload.tournamentsTotal} tornei completati · ${r.payload.durationHuman}`
    );
    for (const cell of r.payload.cellResults) {
      const t = cell.tournaments;
      console.log(
        `  ${cell.key} [${cell.kind}] · completamento ${(100 * t.completionRate).toFixed(1)}% · ` +
          `mani/torneo ${t.avgHandsPerTournament.toFixed(2)} · monte ${(100 * t.monteHandRate).toFixed(1)}% · ` +
          `starter vince mano ${(100 * cell.hands.starterWonHandRate).toFixed(1)}% · ` +
          `1ª vittoria starter (media mano) ${cell.hands.avgFirstStarterWinHandIndex?.toFixed(2) ?? "—"}`
      );
    }
    console.log("");
  }
  console.log(
    `Totale: ${totalCells} combinazioni · ${totalTournaments} tornei richiesti · ${(totalMs / 1000).toFixed(1)}s · indice ${indexPath}`
  );
}

main().catch(error => {
  process.stderr.write(`\nErrore: ${error.message}\n`);
  process.exit(1);
});