"use strict";

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;

function buildScenarios() {
  const scenarios = [];
  for (let L = 3; L <= 8; L++) {
    if (core.isPlayableSetup(L, L)) {
      scenarios.push({ size: L, players: L, tag: "G=N" });
    }
  }
  const overcrowd = [
    [4, 5], [5, 6], [5, 7], [5, 8],
    [6, 7], [6, 8], [6, 9], [6, 10],
    [7, 8], [7, 9], [7, 10], [7, 11],
    [8, 9], [8, 10], [8, 11], [8, 12]
  ];
  for (const [size, players] of overcrowd) {
    if (!core.isPlayableSetup(size, players)) continue;
    const deal = core.computeInitialDeal(size, players);
    if (deal.drawCount <= 0) continue;
    scenarios.push({ size, players, tag: `sovraffollato (tallone ${deal.drawCount})` });
  }
  return scenarios;
}

function analyzeMonteLog(logs) {
  let events = 0;
  let handPenaltySum = 0;
  let playerEvents = 0;
  for (const event of logs) {
    events++;
    for (const row of event.stillIn || []) {
      playerEvents++;
      handPenaltySum += row.handPenalty || 0;
    }
  }
  return {
    events,
    playerEvents,
    handPenaltySum,
    totalPenalty: handPenaltySum
  };
}

function scoreStats(scores) {
  const sorted = scores.slice().sort((a, b) => b - a);
  return {
    winner: sorted[0],
    loser: sorted[sorted.length - 1],
    spread: sorted[0] - sorted[sorted.length - 1]
  };
}

function runScenario(scenario, count, strategy) {
  const { size, players, tag } = scenario;
  const deal = core.computeInitialDeal(size, players);
  const key = `${size}x${players}`;
  const deck = core.simulationDeck();
  const random = core.mulberry32(core.hashSeed(`tournament-sweep:${key}:${strategy}`));
  const strategies = Array.from({ length: players }, () => strategy);

  let completed = 0;
  let stalled = 0;
  let monteHandsTotal = 0;
  const allMonteLogs = [];
  const spreads = [];
  const winnerScores = [];
  const loserScores = [];
  const seatTotals = Array.from({ length: players }, () => 0);
  const seatWins = Array.from({ length: players }, () => 0);

  for (let i = 0; i < count; i++) {
    const result = core.simulateTournament(deck, {
      size,
      players,
      random,
      strategies
    });
    if (result.tournamentComplete) {
      completed++;
      const scores = result.tournamentScores || [];
      const stats = scoreStats(scores);
      spreads.push(stats.spread);
      winnerScores.push(stats.winner);
      loserScores.push(stats.loser);
      for (let p = 0; p < players; p++) seatTotals[p] += scores[p] || 0;
      if (result.winner !== null && result.winner !== undefined) seatWins[result.winner]++;
      monteHandsTotal += result.tournamentMonteGames || 0;
      for (const ev of result.tournamentMonteLog || []) allMonteLogs.push(ev);
    } else {
      stalled++;
    }
  }

  const monte = analyzeMonteLog(allMonteLogs);
  const avgSpread = spreads.length ? spreads.reduce((a, b) => a + b, 0) / spreads.length : 0;
  const avgWinner = winnerScores.length ? winnerScores.reduce((a, b) => a + b, 0) / winnerScores.length : 0;
  const avgLoser = loserScores.length ? loserScores.reduce((a, b) => a + b, 0) / loserScores.length : 0;
  const avgMontePerTournament = completed ? monteHandsTotal / completed : 0;
  const monteHandShare = completed ? (100 * monteHandsTotal / (completed * players)) : 0;

  const seatAvgs = seatTotals.map((t, p) => ({
    seat: `G${p + 1}`,
    avg: completed ? t / completed : 0,
    wins: seatWins[p]
  })).sort((a, b) => b.avg - a.avg);

  return {
    key,
    tag,
    deal,
    completed,
    stalled,
    completionPct: (100 * completed / count).toFixed(1),
    avgMontePerTournament: avgMontePerTournament.toFixed(2),
    monteHandSharePct: monteHandShare.toFixed(1),
    avgSpread: avgSpread.toFixed(2),
    avgWinner: avgWinner.toFixed(2),
    avgLoser: avgLoser.toFixed(2),
    monte,
    seatAvgs
  };
}

function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

module.exports = {
  core,
  buildScenarios,
  runScenario,
  avg
};