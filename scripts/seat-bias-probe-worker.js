"use strict";

const { parentPort, workerData } = require("worker_threads");

require("../mpcards-core.js");
const core = globalThis.MPCardsCore;

function runCell(task) {
  const { size, players, count, strategy, seedTag } = task;
  const deck = core.simulationDeck();
  const strategies = Array.from({ length: players }, () => strategy);
  const seatWins = Array.from({ length: players }, () => 0);
  const seatPlacementsSum = Array.from({ length: players }, () => 0);
  let completed = 0;
  let stalled = 0;
  let starterWins = 0;
  let dmClosed = 0;
  let axisBoth = 0;
  let statusOther = 0;
  const deals = [];

  for (let i = 0; i < count; i++) {
    const seedStr = `${seedTag}:N${size}:G${players}:i${i}:${strategy}`;
    const random = core.mulberry32(core.hashSeed(seedStr));
    const result = core.simulateGame(deck, {
      size,
      players,
      strategies,
      random,
      randomizeTurnOrder: false
    });

    const order = result.initialTurnOrder || [];
    const row = {
      i,
      status: result.status,
      winner: result.winner,
      winnerSlot: result.winnerInitialTurnSlot,
      startingPlayer: result.startingPlayer,
      initialTurnOrder: order.slice(),
      dm: result.duraMaterClosed === true,
      axisW: result.widthAxisFixed === true,
      axisH: result.heightAxisFixed === true,
      placements: (result.placementsByPlayer || []).slice()
    };
    deals.push(row);

    if (result.status !== "success") {
      if (result.status === "stalled") stalled++;
      else statusOther++;
      continue;
    }
    completed++;
    if (result.duraMaterClosed) dmClosed++;
    if (result.widthAxisFixed && result.heightAxisFixed) axisBoth++;

    const w = result.winner;
    if (w !== null && w !== undefined && w >= 0 && w < players) {
      seatWins[w]++;
      if (w === result.startingPlayer) starterWins++;
    }
    const places = result.placementsByPlayer || [];
    for (let p = 0; p < players; p++) {
      seatPlacementsSum[p] += places[p] || 0;
    }
  }

  const expected = completed > 0 ? completed / players : 0;
  let chi2 = 0;
  if (expected > 0) {
    for (const w of seatWins) {
      const d = w - expected;
      chi2 += (d * d) / expected;
    }
  }
  const rates = seatWins.map(w => (completed ? (100 * w) / completed : 0));
  const minRate = rates.length ? Math.min(...rates) : 0;
  const maxRate = rates.length ? Math.max(...rates) : 0;
  const spreadPp = maxRate - minRate;
  const avgPlaces = seatPlacementsSum.map(s => (completed ? s / completed : 0));

  return {
    size,
    players,
    key: `${size}x${players}`,
    strategy,
    count,
    completed,
    stalled,
    statusOther,
    seatWins,
    winRatePct: rates,
    expectedPerSeat: expected,
    chi2,
    spreadPp,
    starterWins,
    starterWinPct: completed ? (100 * starterWins) / completed : 0,
    uniformExpectedPct: completed ? 100 / players : 0,
    dmClosedPct: completed ? (100 * dmClosed) / completed : 0,
    axisBothPct: completed ? (100 * axisBoth) / completed : 0,
    avgPlacementsBySeat: avgPlaces,
    // deals dettagliati solo se utili in debug; tieni sintetico
    dealsSample: deals.filter(d => d.status !== "success").slice(0, 3)
  };
}

try {
  const { task } = workerData;
  const result = runCell(task);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || String(error) });
}
