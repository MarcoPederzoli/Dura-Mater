"use strict";

/**
 * Esegue da terminale il workflow participation-audit (o -quick).
 * Uso:
 *   node scripts/participation-workflow-check.js --quick
 *   node scripts/participation-workflow-check.js --full
 *   npm run test:participation
 */

const fs = require("node:fs");
const path = require("node:path");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

function parseArgs(argv) {
  const opts = { mode: "quick", out: null };
  for (const arg of argv) {
    if (arg === "--quick") opts.mode = "quick";
    else if (arg === "--full") opts.mode = "full";
    else if (arg.startsWith("--out=")) opts.out = arg.slice(6);
  }
  return opts;
}

function emptyCellStats(players) {
  return {
    done: 0,
    players,
    totalPlacementsSum: 0,
    minPlacementsPerGameSum: 0,
    gamesWithZeroPlacementPlayer: 0,
    gamesWithOnePlacementPlayer: 0,
    gamesEveryoneAtLeastTwoPlacements: 0,
    zeroPlacementPlayersSum: 0,
    onePlacementPlayersSum: 0,
    playersPlacedSum: 0,
    gamesAllPlayersPlaced: 0,
    gamesLastPlayerPlaced: 0,
    turnSum: 0,
    stalls: 0
  };
}

function accumulate(stats, result) {
  stats.done++;
  stats.totalPlacementsSum += result.totalPlacements || 0;
  stats.minPlacementsPerGameSum += result.minPlacementsPerPlayer || 0;
  if (result.hasPlayerWithZeroPlacements) stats.gamesWithZeroPlacementPlayer++;
  if (result.hasPlayerWithOnePlacement) stats.gamesWithOnePlacementPlayer++;
  if (result.everyonePlacedAtLeastTwo) stats.gamesEveryoneAtLeastTwoPlacements++;
  stats.zeroPlacementPlayersSum += result.playersWithZeroPlacements || 0;
  stats.onePlacementPlayersSum += result.playersWithOnePlacement || 0;
  stats.playersPlacedSum += result.playersWhoPlaced || 0;
  if (result.allPlayersPlaced) stats.gamesAllPlayersPlaced++;
  if (result.lastPlayerPlaced) stats.gamesLastPlayerPlaced++;
  stats.turnSum += result.turns || 0;
  if (result.status !== "success") stats.stalls++;
}

function summary(stats) {
  const done = stats.done || 1;
  const G = stats.players || 1;
  return {
    avgCardsPerPlayer: stats.totalPlacementsSum / done / G,
    avgMinPlacements: stats.minPlacementsPerGameSum / done,
    zeroGamePct: (stats.gamesWithZeroPlacementPlayer / done) * 100,
    oneGamePct: (stats.gamesWithOnePlacementPlayer / done) * 100,
    allTwoPlusPct: (stats.gamesEveryoneAtLeastTwoPlacements / done) * 100,
    allPlacedPct: (stats.gamesAllPlayersPlaced / done) * 100,
    lastPlacedPct: (stats.gamesLastPlayerPlaced / done) * 100,
    avgTurns: stats.turnSum / done
  };
}

function buildSteps(mode) {
  if (mode === "quick") {
    const steps = [];
    for (const L of [5, 6, 7, 8]) {
      const gMax = Math.min(2 * L, core.maxPlayersForSize(L));
      steps.push({ id: `quick-within-L${L}`, L, gMin: 1, gMax, count: 100 });
    }
    for (const { L, G } of [
      { L: 5, G: 8 },
      { L: 7, G: 14 },
      { L: 8, G: 16 }
    ]) {
      steps.push({ id: `quick-stress-${L}x${G}`, L, gMin: G, gMax: G, count: 200 });
    }
    return steps;
  }

  const steps = [];
  for (let L = 3; L <= 8; L++) {
    const gMax = core.maxPlayersForSize(L);
    steps.push({ id: `within-2n-L${L}`, L, gMin: 1, gMax, count: 400 });
  }
  const stress = [
    [3, 3], [5, 5], [5, 8], [6, 10], [6, 12], [7, 14], [8, 16]
  ];
  for (const [L, G] of stress) {
    steps.push({ id: `stress-${L}x${G}`, L, gMin: G, gMax: G, count: 800 });
  }
  return steps;
}

function runStep(step, seedBase) {
  const cells = {};
  for (let G = step.gMin; G <= step.gMax; G++) {
    if (!core.isPlayableSetup(step.L, G)) continue;
    const key = `${step.L}x${G}`;
    const stats = emptyCellStats(G);
    const random = core.mulberry32(core.hashSeed(`${seedBase}:${step.id}:${key}`));
    for (let i = 0; i < step.count; i++) {
      const result = core.simulateGame(deck, {
        size: step.L,
        players: G,
        strategies: Array.from({ length: G }, () => "planner"),
        random,
        durissimaMater: false,
        randomizeTurnOrder: true
      });
      accumulate(stats, result);
    }
    cells[key] = stats;
  }
  return { stepId: step.id, cells };
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const seedBase = `participation-${opts.mode}`;
  const steps = buildSteps(opts.mode);
  const allCells = {};
  const stepResults = [];

  console.log(`Participation workflow (${opts.mode}) — ${steps.length} step`);
  for (const step of steps) {
    process.stdout.write(`  ${step.id} ... `);
    const result = runStep(step, seedBase);
    stepResults.push(result);
    for (const [k, v] of Object.entries(result.cells)) {
      allCells[k] = v;
    }
    console.log(`${Object.keys(result.cells).length} celle`);
  }

  const rows = Object.entries(allCells).map(([id, stats]) => {
    const m = id.match(/(\d+)x(\d+)/);
    const L = Number(m[1]);
    const G = Number(m[2]);
    return { id, L, G, beyond2N: G > 2 * L, ...summary(stats), done: stats.done };
  });

  rows.sort((a, b) => a.oneGamePct - b.oneGamePct);
  console.log("\n=== Peggiori per «1 sola posa» (oneGamePct) ===");
  for (const r of rows.slice(0, 12)) {
    console.log(
      `  ${r.id}: ≥2 pose ${r.allTwoPlusPct.toFixed(0)}%, 1pos ${r.oneGamePct.toFixed(0)}%, ` +
      `escluso ${r.zeroGamePct.toFixed(0)}%, pose/g ${r.avgCardsPerPlayer.toFixed(2)}` +
      (r.beyond2N ? " [>2N]" : "")
    );
  }

  const within = rows.filter(r => !r.beyond2N);
  const beyond = rows.filter(r => r.beyond2N);
  const avg = list => list.reduce((s, r) => s + r.allTwoPlusPct, 0) / (list.length || 1);
  console.log(`\nMediana tutti ≥2 pose: G≤2N ${avg(within).toFixed(1)}% | G>2N ${avg(beyond).toFixed(1)}%`);

  const outPath = opts.out || path.join(
    __dirname,
    "..",
    "tests",
    `dura-mater-sim-participation-${opts.mode}-${stamp()}.json`
  );
  const payload = {
    format: "dura-mater-participation-cli",
    mode: opts.mode,
    exportedAt: new Date().toISOString(),
    steps: stepResults,
    cells: allCells,
    hints: {
      read: "cells[LxG]: gamesEveryoneAtLeastTwoPlacements/done, gamesWithOnePlacementPlayer/done, totalPlacementsSum/done/G"
    }
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\nExport: ${outPath}`);
}

main();