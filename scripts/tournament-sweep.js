"use strict";

const {
  defaultCliWorkers,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./cpu-workers");
const { createProgressReporter } = require("./cli-progress");
const { buildScenarios, runScenario, avg } = require("./tournament-sweep-lib");

const argv = filterArgv(process.argv.slice(2));
const WORKERS = parseWorkersFlag(process.argv.slice(2));
const COUNT = Number(argv[0]) || 100;
const STRATEGY = argv[1] || "planner";

async function main() {
  const scenarios = buildScenarios();
  process.stderr.write(
    `\nTorneo: ${COUNT} run/caso · strategia ${STRATEGY} · ${scenarios.length} formati · ${WORKERS} worker (CPU logici: ${logicalCpuCount()})\n\n`
  );

  let results;
  if (WORKERS <= 1) {
    const total = scenarios.length;
    results = scenarios.map((scenario, index) => {
      const key = `${scenario.size}x${scenario.players}`;
      const progress = createProgressReporter({
        label: `${index + 1}/${total} ${key} ${scenario.tag}`,
        total: COUNT,
        interval: Math.max(10, Math.floor(COUNT / 20))
      });
      progress.tick(0);
      const r = runScenario(scenario, COUNT, STRATEGY);
      progress.done();
      return r;
    });
  } else {
    const progress = createProgressReporter({
      label: `parallelo ${WORKERS} worker`,
      total: scenarios.length,
      interval: 1
    });
    progress.tick(0);
    const tasks = scenarios.map(scenario => ({ scenario, count: COUNT, strategy: STRATEGY }));
    results = await runWorkerPool("tournament-sweep-worker.js", tasks, {
      workers: WORKERS,
      onProgress(done) {
        progress.tick(done);
      }
    });
    progress.done();
  }

  console.log("=== RIEPILOGO TORNEI ===\n");
  for (const r of results) {
    const d = r.deal;
    console.log(
      `${r.key} [${r.tag}] · carte/testa ${d.cardsPerPlayer} · tallone iniziale ${d.drawCount} · completati ${r.completed}/${COUNT} (${r.completionPct}%)`
    );
    console.log(
      `  Monte: ${r.avgMontePerTournament} mani/torneo (${r.monteHandSharePct}% delle mani) · spread medio 1°-ultimo: ${r.avgSpread} (vinc. ${r.avgWinner} / ultimo ${r.avgLoser})`
    );
    if (r.monte.events) {
      console.log(
        `  Penalità monte (aggregate, solo mano): ${r.monte.handPenaltySum} carte-penalità su ${r.monte.events} eventi`
      );
    } else {
      console.log("  Nessun monte nei tornei completati (o 0 eventi).");
    }
    console.log(
      `  Classifica media sedi: ${r.seatAvgs.map(s => `${s.seat} ${s.avg.toFixed(1)} (${s.wins}V)`).join(" · ")}`
    );
    console.log("");
  }

  const gn = results.filter(r => r.tag === "G=N");
  const oc = results.filter(r => r.tag !== "G=N");

  console.log("=== G=N (senza tallone iniziale) ===");
  console.log(`Completamento medio: ${avg(gn.map(r => Number(r.completionPct))).toFixed(1)}%`);
  console.log(`Mani a monte medie: ${avg(gn.map(r => Number(r.avgMontePerTournament))).toFixed(2)}/torneo`);
  console.log(`Spread medio: ${avg(gn.map(r => Number(r.avgSpread))).toFixed(2)}`);

  if (oc.length) {
    console.log("\n=== Formati sovraffollati (tallone iniziale > 0) ===");
    console.log(`Completamento medio: ${avg(oc.map(r => Number(r.completionPct))).toFixed(1)}%`);
    console.log(`Mani a monte medie: ${avg(oc.map(r => Number(r.avgMontePerTournament))).toFixed(2)}/torneo`);
    console.log(`Spread medio: ${avg(oc.map(r => Number(r.avgSpread))).toFixed(2)}`);
  }

  process.stderr.write("\nSweep tornei completato.\n");
}

main().catch(error => {
  process.stderr.write(`\nErrore: ${error.message}\n`);
  process.exit(1);
});