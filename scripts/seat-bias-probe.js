"use strict";

/**
 * Bias di posizione (sede) in partita Dura Mater competitiva normale.
 * Ordine turni fisso 0..G-1 (randomizeTurnOrder:false), bot planner.
 *
 * Uso:
 *   node scripts/seat-bias-probe.js [partite/cella] [strategia] [--workers N]
 * Es.: node scripts/seat-bias-probe.js 20 planner --workers 7
 */

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

require("../mpcards-core.js");
const core = globalThis.MPCardsCore;

const argv = filterArgv(process.argv.slice(2));
const WORKERS = parseWorkersFlag(process.argv.slice(2), Math.min(7, logicalCpuCount()));
const COUNT = Number(argv[0]) || 20;
const STRATEGY = argv[1] || "planner";
const SEED_TAG = "seat-bias-v1-2026-07-22";

function buildCells() {
  const cells = [];
  for (let size = 3; size <= 8; size++) {
    const gMax = core.maxPlayersForSize(size);
    for (let players = 2; players <= Math.min(16, gMax); players++) {
      if (!core.isPlayableSetup(size, players)) continue;
      cells.push({ size, players });
    }
  }
  return cells;
}

function dfChi2(players) {
  return Math.max(1, players - 1);
}

/** Soglia grezza chi2 p~0.05 (approssimazione per df 1..15). */
function chi2CriticalApprox(df) {
  // valori chi2 0.95 per df=1..15
  const table = {
    1: 3.84,
    2: 5.99,
    3: 7.81,
    4: 9.49,
    5: 11.07,
    6: 12.59,
    7: 14.07,
    8: 15.51,
    9: 16.92,
    10: 18.31,
    11: 19.68,
    12: 21.03,
    13: 22.36,
    14: 23.68,
    15: 25.0
  };
  return table[df] || 25 + (df - 15) * 1.2;
}

function classifyCell(size, players) {
  if (players === size) return "G=N";
  if (players > size) return "over";
  return "under";
}

function summarize(results) {
  const byKind = { "G=N": [], under: [], over: [] };
  for (const r of results) {
    const kind = classifyCell(r.size, r.players);
    byKind[kind].push(r);
  }

  function kindStats(arr) {
    if (!arr.length) return null;
    const spreads = arr.map(r => r.spreadPp);
    const starterDev = arr.map(r => r.starterWinPct - r.uniformExpectedPct);
    const biasCount = arr.filter(r => {
      const crit = chi2CriticalApprox(dfChi2(r.players));
      return r.completed >= 10 && r.chi2 >= crit;
    }).length;
    const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
    return {
      formats: arr.length,
      avgSpreadPp: avg(spreads),
      maxSpreadPp: Math.max(...spreads),
      avgStarterDevPp: avg(starterDev),
      biasSuspect: biasCount,
      completedTotal: arr.reduce((s, r) => s + r.completed, 0),
      gamesTotal: arr.reduce((s, r) => s + r.count, 0)
    };
  }

  return {
    "G=N": kindStats(byKind["G=N"]),
    under: kindStats(byKind.under),
    over: kindStats(byKind.over)
  };
}

function formatSeatLine(r) {
  const parts = r.seatWins.map((w, i) => {
    const pct = r.completed ? ((100 * w) / r.completed).toFixed(0) : "0";
    return `S${i}=${w}(${pct}%)`;
  });
  return parts.join(" ");
}

function buildTextReport(results, summary, meta) {
  const lines = [];
  lines.push("=== BIAS POSIZIONE — PARTITA NORMALE DURA MATER ===");
  lines.push(
    `Campione: ${meta.cells} celle · ${meta.totalGames} partite · ${meta.count}/cella · ${meta.strategy}`
  );
  lines.push(`Ordine turni: fisso 0..G-1 (randomizeTurnOrder=false) · seedTag=${meta.seedTag}`);
  lines.push(`Worker: ${meta.workers} · durata: ${meta.durationHuman}`);
  lines.push("");
  lines.push("--- Sintesi per tipologia ---");
  for (const kind of ["G=N", "under", "over"]) {
    const s = summary[kind];
    if (!s) {
      lines.push(`${kind}: (nessuna cella)`);
      continue;
    }
    lines.push(
      `${kind}: ${s.formats} formati · spread medio ${s.avgSpreadPp.toFixed(1)} pp · max ${s.maxSpreadPp.toFixed(1)} pp · ` +
        `starter vs uniforme medio ${s.avgStarterDevPp >= 0 ? "+" : ""}${s.avgStarterDevPp.toFixed(1)} pp · ` +
        `celle chi2 sospetto (p~0.05, n>=10): ${s.biasSuspect}/${s.formats}`
    );
  }
  lines.push("");
  lines.push("--- Dettaglio celle (ordinate per spread discendente) ---");
  const sorted = results.slice().sort((a, b) => b.spreadPp - a.spreadPp);
  for (const r of sorted) {
    const kind = classifyCell(r.size, r.players);
    const crit = chi2CriticalApprox(dfChi2(r.players));
    const flag = r.completed >= 10 && r.chi2 >= crit ? " BIAS?" : " ok";
    const unif = r.uniformExpectedPct.toFixed(1);
    lines.push(
      `${r.key.padEnd(6)} [${kind}] done ${String(r.completed).padStart(2)}/${r.count}` +
        ` · spread ${r.spreadPp.toFixed(1).padStart(5)} pp · chi2 ${r.chi2.toFixed(2)} (crit~${crit.toFixed(1)})${flag}`
    );
    lines.push(
      `         starter ${r.starterWinPct.toFixed(0)}% (unif ${unif}%) · DM chiusa ${r.dmClosedPct.toFixed(0)}% · assi ${r.axisBothPct.toFixed(0)}%`
    );
    lines.push(`         ${formatSeatLine(r)}`);
  }
  lines.push("");
  lines.push("--- Note ---");
  lines.push(
    "Con solo 20 partite/cella il chi2 e' rumoroso: spread grandi su G alti o n piccoli sono indizi, non prova forte."
  );
  lines.push(
    "Sedi = giocatori 0..G-1 nell'ordine di partenza fisso. Inversione 1° limite e Dura Mater restano attive in-game."
  );
  lines.push(
    "Confronto: se le inversioni mitigano, lo starter non dovrebbe dominare e lo spread tra sedi dovrebbe restare contenuto."
  );
  return lines.join("\n");
}

async function main() {
  const cells = buildCells();
  const started = Date.now();
  process.stderr.write(
    `Seat-bias probe · ${cells.length} celle · ${COUNT}/cella · ${STRATEGY} · CPU ${logicalCpuCount()} · ${WORKERS} worker\n`
  );

  const tasks = cells.map(({ size, players }) => ({
    size,
    players,
    count: COUNT,
    strategy: STRATEGY,
    seedTag: SEED_TAG
  }));

  const progress = createProgressReporter({
    label: "seat-bias",
    total: tasks.length,
    interval: 1
  });
  progress.tick(0);

  const results = await runWorkerPool("seat-bias-probe-worker.js", tasks, {
    workers: WORKERS,
    onProgress(done) {
      progress.tick(done);
    }
  });
  progress.done();

  const durationMs = Date.now() - started;
  const durationHuman =
    durationMs < 60000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${(durationMs / 60000).toFixed(1)} min`;

  const summary = summarize(results);
  const meta = {
    cells: cells.length,
    count: COUNT,
    strategy: STRATEGY,
    seedTag: SEED_TAG,
    workers: WORKERS,
    durationMs,
    durationHuman,
    totalGames: cells.length * COUNT,
    generatedAt: new Date().toISOString()
  };

  const outDir = path.join(__dirname, "..", "results", "seat-bias");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `seat-bias-N3-8-c${COUNT}-${STRATEGY}-${stamp}`;
  const jsonPath = path.join(outDir, `${base}.json`);
  const txtPath = path.join(outDir, `${base}.txt`);

  const payload = { meta, summary, results };
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  const text = buildTextReport(results, summary, meta);
  fs.writeFileSync(txtPath, text, "utf8");

  console.log(text);
  process.stderr.write(`\nSalvato:\n  ${jsonPath}\n  ${txtPath}\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
