"use strict";

const { createProgressReporter } = require("./cli-progress");

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const COUNT = Number(process.argv[2]) || 100;
const STRATEGY = process.argv[3] || "planner";

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
  let drawPenaltySum = 0;
  let playerEvents = 0;
  let maxDrawAtMonte = 0;
  for (const event of logs) {
    events++;
    maxDrawAtMonte = Math.max(maxDrawAtMonte, event.drawCards || 0);
    for (const row of event.stillIn || []) {
      playerEvents++;
      handPenaltySum += row.handPenalty || 0;
      drawPenaltySum += row.drawPenalty || 0;
    }
  }
  const totalPenalty = handPenaltySum + drawPenaltySum;
  return {
    events,
    playerEvents,
    handPenaltySum,
    drawPenaltySum,
    totalPenalty,
    drawSharePct: totalPenalty ? (100 * drawPenaltySum / totalPenalty) : 0,
    maxDrawAtMonte
  };
}

function scoreStats(scores) {
  const sorted = scores.slice().sort((a, b) => b - a);
  const winner = sorted[0];
  const loser = sorted[sorted.length - 1];
  const spread = winner - loser;
  const sum = scores.reduce((a, b) => a + b, 0);
  const avg = sum / scores.length;
  const negSum = scores.filter(s => s < 0).reduce((a, b) => a + b, 0);
  return { winner, loser, spread, avg, negSum };
}

function runScenario(scenario, index, total) {
  const { size, players, tag } = scenario;
  const deal = core.computeInitialDeal(size, players);
  const key = `${size}x${players}`;
  const random = core.mulberry32(core.hashSeed(`tournament-sweep:${key}:${STRATEGY}`));
  const strategies = Array.from({ length: players }, () => STRATEGY);

  let completed = 0;
  let stalled = 0;
  let monteHandsTotal = 0;
  const allMonteLogs = [];
  const spreads = [];
  const winnerScores = [];
  const loserScores = [];
  const seatTotals = Array.from({ length: players }, () => 0);
  const seatWins = Array.from({ length: players }, () => 0);

  const progress = createProgressReporter({
    label: `${index + 1}/${total} ${key} ${tag}`,
    total: COUNT,
    interval: Math.max(10, Math.floor(COUNT / 20))
  });
  progress.tick(0);

  for (let i = 0; i < COUNT; i++) {
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
      monteHandsTotal += result.tournamentMonteHands || 0;
      for (const ev of result.tournamentMonteLog || []) allMonteLogs.push(ev);
    } else {
      stalled++;
    }
    progress.tick(i + 1);
  }
  progress.done();

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
    completionPct: (100 * completed / COUNT).toFixed(1),
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

const scenarios = buildScenarios();
process.stderr.write(
  `\nTorneo: ${COUNT} run/caso · strategia ${STRATEGY} · ${scenarios.length} formati\n\n`
);

const results = scenarios.map((s, i) => runScenario(s, i, scenarios.length));

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
      `  Penalità monte (aggregate): mano ${r.monte.handPenaltySum} · tallone ${r.monte.drawPenaltySum} · tallone ${r.monte.drawSharePct.toFixed(1)}% del totale · max carte tallone a monte: ${r.monte.maxDrawAtMonte}`
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
  console.log("\n=== Formati sovraffollati (tallone > 0) ===");
  console.log(`Completamento medio: ${avg(oc.map(r => Number(r.completionPct))).toFixed(1)}%`);
  console.log(`Mani a monte medie: ${avg(oc.map(r => Number(r.avgMontePerTournament))).toFixed(2)}/torneo`);
  console.log(`Spread medio: ${avg(oc.map(r => Number(r.avgSpread))).toFixed(2)}`);
  const ocWithMonte = oc.filter(r => r.monte.totalPenalty > 0);
  if (ocWithMonte.length) {
    console.log(
      `Quota penalità tallone sui monte: ${avg(ocWithMonte.map(r => r.monte.drawSharePct)).toFixed(1)}% (media formati con monte)`
    );
  }
}

process.stderr.write("\nSweep tornei completato.\n");