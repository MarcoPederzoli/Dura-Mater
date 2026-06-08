"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createProgressReporter } = require("./cli-progress");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const WORKFLOWS = {
  "L3-L5": [3, 4, 5],
  L6: [6],
  L7: [7],
  L8: [8],
  all: [3, 4, 5, 6, 7, 8]
};

const WORKFLOW_IDS = {
  "L3-L5": "classic-audit-L3-L5",
  L6: "classic-audit-L6",
  L7: "classic-audit-L7",
  L8: "classic-audit-L8",
  all: "classic-audit-all"
};

function usage() {
  process.stderr.write(
    "Uso: node scripts/classic-sweep.js <workflow> [partite/cella]\n" +
      "Workflow: L3-L5 | L6 | L7 | L8 | all\n" +
      "Default: 1000 partite/cella (come riepilogo Durissima)\n" +
      "Es.: node scripts/classic-sweep.js L3-L5\n" +
      "     node scripts/classic-sweep.js L8 500\n"
  );
  process.exit(1);
}

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function playableCellsForL(L) {
  const out = [];
  const gMax = core.maxPlayersForSize(L);
  for (let G = 1; G <= gMax; G++) {
    if (core.isPlayableSetup(L, G)) out.push(G);
  }
  return out;
}

function buildCellList(sizes) {
  const cells = [];
  for (const L of sizes) {
    for (const G of playableCellsForL(L)) {
      cells.push([L, G]);
    }
  }
  return cells;
}

function runCell(L, G, count, cellIndex, cellTotal) {
  const key = `${L}x${G}`;
  const stats = {
    done: 0,
    stalls: 0,
    wins: 0,
    dmClosedCount: 0,
    boardCompleteCount: 0,
    turnSum: 0,
    gamesAllPlayersPlaced: 0,
    gamesLastPlayerPlaced: 0,
    totalPlacementsSum: 0,
    minPlacementsPerGameSum: 0,
    gamesWithZeroPlacementPlayer: 0,
    gamesWithOnePlacementPlayer: 0,
    gamesEveryoneAtLeastTwoPlacements: 0
  };

  const deal = core.computeInitialDeal(L, G);
  const random = core.mulberry32(core.hashSeed(`classic-sweep:${L}:${G}`));
  const progress = createProgressReporter({
    label: `cella ${cellIndex}/${cellTotal} ${key}`,
    total: count,
    interval: Math.max(25, Math.floor(count / 40))
  });

  progress.tick(0);
  for (let i = 0; i < count; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: G,
      random,
      strategies: Array.from({ length: G }, () => "planner"),
      durissimaMater: false,
      randomizeTurnOrder: true
    });

    stats.done++;
    stats.turnSum += result.turns || 0;
    stats.totalPlacementsSum += result.totalPlacements || 0;
    stats.minPlacementsPerGameSum += result.minPlacementsPerPlayer || 0;
    if (result.allPlayersPlaced) stats.gamesAllPlayersPlaced++;
    if (result.lastPlayerPlaced) stats.gamesLastPlayerPlaced++;
    if (result.hasPlayerWithZeroPlacements) stats.gamesWithZeroPlacementPlayer++;
    if (result.hasPlayerWithOnePlacement) stats.gamesWithOnePlacementPlayer++;
    if (result.everyonePlacedAtLeastTwo) stats.gamesEveryoneAtLeastTwoPlacements++;
    if (result.duraMaterClosed) stats.dmClosedCount++;
    if (result.boardComplete) stats.boardCompleteCount++;

    if (result.status === "success") stats.wins++;
    else stats.stalls++;

    progress.tick(i + 1);
  }
  progress.done();

  return {
    ...stats,
    cell: key,
    initialHandSize: deal.cardsPerPlayer,
    initialDrawCount: deal.drawCount,
    overcrowdedDeal: deal.overcrowded
  };
}

function main() {
  const workflowKey = process.argv[2];
  const count = Number(process.argv[3]) || 1000;

  if (!workflowKey || !WORKFLOWS[workflowKey]) usage();
  if (!Number.isFinite(count) || count < 1) {
    process.stderr.write("Numero partite non valido.\n");
    process.exit(1);
  }

  const sizes = WORKFLOWS[workflowKey];
  const cells = buildCellList(sizes);
  const workflowId = WORKFLOW_IDS[workflowKey];
  const totalGames = cells.length * count;

  process.stderr.write(
    `\nClassic sweep (${workflowId}): ${cells.length} celle × ${count} partite = ${totalGames} simulazioni\n\n`
  );

  const allCells = {};
  for (let i = 0; i < cells.length; i++) {
    const [L, G] = cells[i];
    const key = `${L}x${G}`;
    const stats = runCell(L, G, count, i + 1, cells.length);
    allCells[key] = stats;

    const winPct = (100 * stats.wins / stats.done).toFixed(1);
    const gridPct = (100 * stats.boardCompleteCount / stats.done).toFixed(1);
    const avgTurns = (stats.turnSum / stats.done).toFixed(1);
    console.log(
      `${key} (${stats.initialHandSize}/${stats.initialDrawCount}): ` +
        `vittoria ${winPct}% · griglia piena ${gridPct}% · turni med ${avgTurns} · stalli ${stats.stalls}`
    );
  }

  const out = path.join(
    __dirname,
    "..",
    "tests",
    `dura-mater-classic-sweep-${workflowKey}-${stamp()}.json`
  );

  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        format: "dura-mater-classic-sweep-cli",
        workflowId,
        workflowKey,
        exportedAt: new Date().toISOString(),
        countPerCell: count,
        strategy: "planner",
        durissimaMater: false,
        cells: allCells
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`\nScritto: ${out}`);
  process.stderr.write("\nClassic sweep completato.\n");
}

main();