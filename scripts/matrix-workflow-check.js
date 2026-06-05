"use strict";

/**
 * Replica i workflow «Matrice L×L» (simulator-workflows-matrix.js) da riga di comando.
 * Uso: node scripts/matrix-workflow-check.js [--quick] [--L=5] [--count=200]
 */

const path = require("node:path");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const STRATEGY_MIX = [
  "planner",
  "random",
  "compatibility",
  "high-value",
  "hand-planner",
  "low-value",
  "greedy",
  "adjacent"
];

const STEPS_FOR_L = L => [
  { id: `L${L}-comp`, durissimaMater: false, gMin: 1, gMax: L, shuffle: true },
  { id: `L${L}-duri`, durissimaMater: true, gMin: 1, gMax: 1, shuffle: false, strategy: "planner" }
];

function parseArgs(argv) {
  const opts = { quick: false, minL: 3, maxL: 8, count: null };
  for (const arg of argv) {
    if (arg === "--quick") opts.quick = true;
    else if (arg.startsWith("--L=")) opts.minL = opts.maxL = Number(arg.slice(4));
    else if (arg.startsWith("--count=")) opts.count = Number(arg.slice(8));
  }
  if (opts.count == null) opts.count = opts.quick ? 80 : 200;
  return opts;
}

function strategiesForL(L) {
  return STRATEGY_MIX.slice(0, L);
}

function runCell(L, G, step, count, seedText) {
  const random = core.mulberry32(core.hashSeed(`${seedText}:${step.id}:${L}:${G}`));
  const strategies = step.strategy
    ? Array.from({ length: G }, () => step.strategy)
    : strategiesForL(L);
  let success = 0;
  let stall = 0;
  let turnSum = 0;

  for (let i = 0; i < count; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: G,
      strategies,
      random,

      durissimaMater: step.durissimaMater,
      randomizeTurnOrder: true,
      shuffleStrategiesAmongSeats: step.shuffle === true
    });
    turnSum += result.turns;
    if (result.status === "success") success++;
    else stall++;
  }

  const done = count;
  return {
    success,
    stall,
    successPct: (success / done) * 100,
    stallPct: (stall / done) * 100,
    avgTurns: turnSum / done
  };
}

function assessVerdict(L, G, step, stats) {
  const durissima = step.durissimaMater;
  const { successPct, stallPct } = stats;

  if (stallPct >= 99) return { level: "fail", note: "quasi tutte le partite in stallo" };

  if (durissima) {
    if (successPct < 3) return { level: "warn", note: "Durissima solitario: pochi completamenti" };
    return { level: "ok", note: "Durissima solitario: esistono completamenti" };
  }

  if (G === 1) {
    if (successPct < 1) return { level: "warn", note: "solitario competitivo quasi mai risolvibile" };
    return { level: "ok", note: "solitario competitivo giocabile" };
  }

  if (G === L) {
    if (stallPct >= 92 && successPct < 5) {
      return { level: "warn", note: "G=L: molti stalli attesi (mazzo vuoto)" };
    }
  }

  if (stallPct >= 85 && successPct < 8) {
    return { level: "warn", note: "competitiva: prevalenza stalli" };
  }
  if (successPct < 5) {
    return { level: "fail", note: "competitiva: quasi nessun vincitore" };
  }
  return { level: "ok", note: "competitiva: partite con esito" };
}

function runMatrixAudit(opts) {
  const seedBase = opts.quick ? "matrix-quick" : "matrix-check";
  const rows = [];
  const fails = [];
  const warns = [];

  for (let L = opts.minL; L <= opts.maxL; L++) {
    const count = opts.count;
    for (const step of STEPS_FOR_L(L)) {
      for (let G = step.gMin; G <= step.gMax; G++) {
        const stats = runCell(L, G, step, count, seedBase);
        const verdict = assessVerdict(L, G, step, stats);
        const row = {
          L,
          G,
          step: step.id,
          mode: step.durissimaMater ? "durissima" : "competitive",
          count,
          ...stats,
          verdict: verdict.level,
          note: verdict.note
        };
        rows.push(row);
        if (verdict.level === "fail") fails.push(row);
        if (verdict.level === "warn") warns.push(row);
      }
    }
  }

  return { rows, fails, warns, opts };
}

function printReport(report) {
  const { rows, fails, warns, opts } = report;
  console.log(`\n=== Matrix workflow check (${opts.quick ? "quick" : "standard"}) ===`);
  console.log(`Partite per cella: ${opts.count}, L ${opts.minL}–${opts.maxL}\n`);

  let currentL = null;
  let currentStep = null;
  for (const row of rows) {
    if (row.L !== currentL || row.step !== currentStep) {
      currentL = row.L;
      currentStep = row.step;
      console.log(`\n--- ${row.step} (${row.mode}) ---`);
      console.log("  G   success%  stall%  turni~  verdict");
    }
    const flag = row.verdict === "fail" ? " !" : row.verdict === "warn" ? " ?" : "";
    console.log(
      `  ${String(row.G).padStart(1)}   ${row.successPct.toFixed(1).padStart(6)}%  ${row.stallPct.toFixed(1).padStart(6)}%  ${row.avgTurns.toFixed(1).padStart(5)}   ${row.verdict}${flag}`
    );
  }

  console.log("\n--- Sintesi ---");
  console.log(`Celle: ${rows.length} · FAIL: ${fails.length} · WARN: ${warns.length}`);
  if (fails.length) {
    console.log("\nFAIL:");
    for (const row of fails.slice(0, 12)) {
      console.log(`  ${row.step} L=${row.L} G=${row.G}: ${row.successPct.toFixed(1)}% — ${row.note}`);
    }
  }
  console.log("\nDurissima: solo G=1 è valido in simulazione (collaborativo al tavolo).\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = runMatrixAudit(opts);
  printReport(report);
  if (report.fails.length) process.exit(1);
}

main();