"use strict";

const { createProgressReporter } = require("./cli-progress");

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const COUNT = Number(process.argv[2]) || 100;
const STRATEGIES = (process.argv[3] || "planner").split(",");

function formatKind(size, players) {
  if (players === size) return "G=N";
  if (players > size) return "overcrowded";
  return "under";
}

function buildFormats() {
  const formats = [];
  for (let size = 3; size <= 8; size++) {
    const gMax = core.maxPlayersForSize(size);
    for (let players = 2; players <= gMax; players++) {
      if (!core.isPlayableSetup(size, players)) continue;
      const kind = formatKind(size, players);
      if (kind === "G=N") continue;
      formats.push({ size, players, kind });
    }
  }
  return formats;
}

function analyzeMonteDraw(logs) {
  let events = 0;
  let withDraw = 0;
  let drawPenaltySum = 0;
  let handPenaltySum = 0;
  let maxDraw = 0;
  for (const ev of logs) {
    events++;
    const d = ev.drawCards || 0;
    if (d > 0) withDraw++;
    maxDraw = Math.max(maxDraw, d);
    for (const row of ev.stillIn || []) {
      handPenaltySum += row.handPenalty || 0;
      drawPenaltySum += row.drawPenalty || 0;
    }
  }
  const total = handPenaltySum + drawPenaltySum;
  return {
    events,
    withDraw,
    withDrawPct: events ? (100 * withDraw / events) : 0,
    maxDraw,
    handPenaltySum,
    drawPenaltySum,
    drawSharePct: total ? (100 * drawPenaltySum / total) : 0
  };
}

function seatFairness(seatWins, completed) {
  const rates = seatWins.map(w => (completed ? w / completed : 0));
  const expected = completed / seatWins.length;
  let chi2 = 0;
  for (const w of seatWins) {
    const diff = w - expected;
    chi2 += (diff * diff) / expected;
  }
  const minW = Math.min(...seatWins);
  const maxW = Math.max(...seatWins);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const spreadWins = maxW - minW;
  const spreadRate = maxRate - minRate;
  const uniform = seatWins.every(w => w === seatWins[0]);
  return {
    seatWins,
    rates,
    expectedPerSeat: expected,
    chi2,
    spreadWins,
    spreadRatePct: 100 * spreadRate,
    uniform
  };
}

function runFormat(fmt, strategy) {
  const { size, players, kind } = fmt;
  const deal = core.computeInitialDeal(size, players);
  const key = `${size}x${players}`;
  const random = core.mulberry32(core.hashSeed(`fairness:${key}:${strategy}`));
  const strategies = Array.from({ length: players }, () => strategy);

  let completed = 0;
  const seatWins = Array.from({ length: players }, () => 0);
  const seatTotals = Array.from({ length: players }, () => 0);
  const allMonteLogs = [];

  for (let i = 0; i < COUNT; i++) {
    const result = core.simulateTournament(deck, { size, players, random, strategies });
    if (!result.tournamentComplete) continue;
    completed++;
    const scores = result.tournamentScores || [];
    for (let p = 0; p < players; p++) seatTotals[p] += scores[p] || 0;
    if (result.winner !== null && result.winner !== undefined) seatWins[result.winner]++;
    for (const ev of result.tournamentMonteLog || []) allMonteLogs.push(ev);
  }

  const monte = analyzeMonteDraw(allMonteLogs);
  const fairness = seatFairness(seatWins, completed);
  const seatAvgs = seatTotals.map((t, p) => ({
    seat: `G${p + 1}`,
    avg: completed ? t / completed : 0,
    wins: seatWins[p],
    winRatePct: completed ? (100 * seatWins[p] / completed) : 0
  }));

  return { key, kind, deal, strategy, completed, monte, fairness, seatAvgs };
}

function runGnFairness(strategy) {
  const results = [];
  for (let size = 3; size <= 8; size++) {
    if (!core.isPlayableSetup(size, size)) continue;
    results.push(runFormat({ size, players: size, kind: "G=N" }, strategy));
  }
  return results;
}

const underOver = buildFormats();

process.stderr.write(
  `\nProbe torneo: ${COUNT} run · strategie ${STRATEGIES.join(", ")} · ${underOver.length} formati under/overcrowded\n\n`
);

for (const strategy of STRATEGIES) {
  console.log(`\n######## STRATEGIA: ${strategy} ########\n`);

  console.log("=== TALLONE AL MONTE (under + overcrowded) ===\n");
  let idx = 0;
  for (const fmt of underOver) {
    idx++;
    const progress = createProgressReporter({
      label: `${strategy} ${idx}/${underOver.length} ${fmt.size}x${fmt.players} ${fmt.kind}`,
      total: 1,
      interval: 1
    });
    progress.tick(0);
    const r = runFormat(fmt, strategy);
    progress.done();
    const d = r.deal;
    console.log(
      `${r.key} [${r.kind}] · tallone iniz. ${d.drawCount} · carte/testa ${d.cardsPerPlayer} · completati ${r.completed}/${COUNT}`
    );
    if (r.monte.events) {
      console.log(
        `  Monte: ${r.monte.events} eventi · tallone>0 al monte: ${r.monte.withDraw} (${r.monte.withDrawPct.toFixed(1)}%) · max ${r.monte.maxDraw} carte · quota penalità tallone ${r.monte.drawSharePct.toFixed(1)}%`
      );
    } else {
      console.log("  Nessun monte nei tornei completati.");
    }
  }

  console.log("\n=== EQUITÀ SEDI (G=N, rotazione starter) ===\n");
  const gn = runGnFairness(strategy);
  for (const r of gn) {
    const f = r.fairness;
    console.log(
      `${r.key}: vittorie ${r.seatAvgs.map(s => `${s.seat} ${s.wins} (${s.winRatePct.toFixed(0)}%)`).join(" · ")}`
    );
    console.log(
      `  Spread vittorie ${f.spreadWins} (atteso ~${f.expectedPerSeat.toFixed(1)}/sede) · χ²=${f.chi2.toFixed(2)} · spread win-rate ${f.spreadRatePct.toFixed(1)}pp`
    );
  }

  const gnFair = gn.map(r => r.fairness);
  const avgChi = gnFair.reduce((s, f) => s + f.chi2, 0) / gnFair.length;
  const avgSpread = gnFair.reduce((s, f) => s + f.spreadWins, 0) / gnFair.length;
  console.log(`\nMedia G=N: χ²=${avgChi.toFixed(2)} · spread vittorie medio ${avgSpread.toFixed(1)} (su 100 tornei, atteso 12.5/sede a 8 giocatori)`);

  console.log("\n=== EQUITÀ SEDI (under + overcrowded, campione) ===\n");
  const sample = [...underOver].sort((a, b) => {
    const da = core.computeInitialDeal(a.size, a.players).drawCount;
    const db = core.computeInitialDeal(b.size, b.players).drawCount;
    return db - da;
  }).slice(0, 8);
  for (const fmt of sample) {
    const r = runFormat(fmt, strategy);
    const f = r.fairness;
    console.log(
      `${r.key} [${r.kind}, tallone iniz. ${r.deal.drawCount}]: ${r.seatAvgs.map(s => `${s.seat} ${s.winRatePct.toFixed(0)}%`).join(" · ")} · spread ${f.spreadWins} · χ²=${f.chi2.toFixed(1)}`
    );
  }
}

process.stderr.write("\nProbe completata.\n");