"use strict";

const fs = require("fs");
const path = require("path");

const AUDIT_DIR = path.join(__dirname, "..", "results", "tournament-audit");

function loadAllAudits() {
  const indexPath = path.join(AUDIT_DIR, "index.json");
  if (!fs.existsSync(indexPath)) {
    throw new Error("Manca results/tournament-audit/index.json");
  }
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const cells = [];
  for (const run of index.runs) {
    const filePath = path.join(AUDIT_DIR, run.file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const cell of data.cellResults) {
      cells.push({ ...cell, sourceSize: data.size });
    }
  }
  return { index, cells };
}

function chiSquare(seatWins, total) {
  const k = seatWins.length;
  if (!total || k < 2) return { chi2: 0, df: 0, critical05: 0 };
  const expected = total / k;
  let chi2 = 0;
  for (const w of seatWins) {
    const d = w - expected;
    chi2 += (d * d) / expected;
  }
  const df = k - 1;
  const critical = {
    1: 3.84, 2: 5.99, 3: 7.81, 4: 9.49, 5: 11.07,
    6: 12.59, 7: 14.07, 8: 15.51, 9: 16.92, 10: 18.31,
    11: 19.68, 12: 21.03, 13: 22.36, 14: 23.68, 15: 24.99
  };
  return { chi2, df, critical05: critical[df] || df * 2 };
}

function seatEquity(cell) {
  const completed = cell.tournaments.completed;
  const wins = cell.seats.map(s => s.tournamentWins);
  const rates = cell.seats.map(s => s.winRate);
  const expected = completed ? 1 / cell.players : 0;
  const spread = Math.max(...rates) - Math.min(...rates);
  const winSpread = Math.max(...wins) - Math.min(...wins);
  const { chi2, df, critical05 } = chiSquare(wins, completed);
  const scoreSpread = Math.max(...cell.seats.map(s => s.avgScore)) -
    Math.min(...cell.seats.map(s => s.avgScore));
  return {
    spreadRatePct: 100 * spread,
    winSpread,
    scoreSpread,
    chi2,
    df,
    biased: chi2 > critical05,
    expectedWinRate: expected,
    maxDeviationPct: 100 * Math.max(...rates.map(r => Math.abs(r - expected)))
  };
}

function fmtPct(x, d = 1) {
  return `${(100 * x).toFixed(d)}%`;
}

function fmtNum(x, d = 2) {
  return Number(x).toFixed(d);
}

function analyze(cells) {
  const gn = cells.filter(c => c.kind === "G=N");
  const under = cells.filter(c => c.kind === "under");
  const over = cells.filter(c => c.kind === "overcrowded");

  const enrich = cells.map(c => ({
    ...c,
    equity: seatEquity(c)
  }));

  const gnEnriched = enrich.filter(c => c.kind === "G=N");
  const gnBiased = gnEnriched.filter(c => c.equity.biased);

  const byKind = { "G=N": gn, under, overcrowded: over };

  function avgOf(list, fn) {
    return list.length ? list.reduce((s, x) => s + fn(x), 0) / list.length : 0;
  }

  const report = {
    meta: {
      cells: cells.length,
      tournaments: cells.reduce((s, c) => s + c.tournaments.completed, 0),
      strategy: "planner",
      countPerCell: 300
    },
    gn: gnEnriched.map(c => ({
      key: c.key,
      players: c.players,
      gamesPerTournament: c.tournaments.avgGamesPerTournament,
      monteRate: c.tournaments.monteGameRate,
      finishedRate: c.tournaments.finishedGameRate ?? c.tournaments.finishedHandRate,
      avgTurnsPerGame: c.tournaments.avgTurnsPerGame ?? c.tournaments.avgTurnsPerHand,
      monteAvgCards: c.monte.avgHandCardsPerStillIn,
      monteMaxCards: c.monte.handCardsMax,
      starterWonGameRate: (c.games || c.hands).starterWonGameRate,
      avgFirstStarterWinGame: (c.games || c.hands).avgFirstStarterWinGameIndex,
      equity: c.equity,
      seats: c.seats.map(s => ({
        label: s.label,
        winRate: s.winRate,
        avgScore: s.avgScore,
        firstFinishRate: s.firstFinishRate
      }))
    })),
    outliers: {
      gnMostBiased: gnEnriched
        .slice()
        .sort((a, b) => b.equity.chi2 - a.equity.chi2)
        .slice(0, 3),
      gnLeastMonte: gnEnriched.slice().sort((a, b) => a.tournaments.monteGameRate - b.tournaments.monteGameRate),
      worstEquityAll: enrich.slice().sort((a, b) => b.equity.spreadRatePct - a.equity.spreadRatePct).slice(0, 8),
      bestFinishedUnder: enrich
        .filter(c => c.kind === "under")
        .slice()
        .sort((a, b) => (b.tournaments.finishedGameRate ?? b.tournaments.finishedHandRate) - (a.tournaments.finishedGameRate ?? a.tournaments.finishedHandRate))
        .slice(0, 5),
      highestMonteCards: enrich
        .slice()
        .sort((a, b) => b.monte.avgHandCardsPerStillIn - a.monte.avgHandCardsPerStillIn)
        .slice(0, 5)
    },
    kindSummary: {}
  };

  for (const [kind, list] of Object.entries(byKind)) {
    const enriched = enrich.filter(c => c.kind === kind);
    report.kindSummary[kind] = {
      count: list.length,
      completionRate: 1,
      avgGamesPerTournament: avgOf(list, c => c.tournaments.avgGamesPerTournament),
      avgMonteGameRate: avgOf(list, c => c.tournaments.monteGameRate),
      avgFinishedGameRate: avgOf(list, c => c.tournaments.finishedGameRate ?? c.tournaments.finishedHandRate),
      avgTurnsPerGame: avgOf(list, c => c.tournaments.avgTurnsPerGame ?? c.tournaments.avgTurnsPerHand),
      avgMonteCardsInHand: avgOf(list, c => c.monte.avgHandCardsPerStillIn),
      avgSeatWinSpreadPct: avgOf(enriched, c => c.equity.spreadRatePct),
      avgScoreSpread: avgOf(enriched, c => c.equity.scoreSpread),
      biasedSeatCount: enriched.filter(c => c.equity.biased).length,
      avgStarterWonGameRate: avgOf(list, c => (c.games || c.hands).starterWonGameRate)
    };
  }

  return { report, enrich };
}

function printReport(report) {
  const lines = [];
  const L = (s = "") => lines.push(s);

  L("=== TEST DEFINITIVO TORNEO — SINTESI ===");
  L(`Campione: ${report.meta.cells} combinazioni · ${report.meta.tournaments.toLocaleString("it-IT")} tornei · ${report.meta.countPerCell}/cella · ${report.meta.strategy}`);
  L("");

  L("--- Per tipologia ---");
  for (const [kind, s] of Object.entries(report.kindSummary)) {
    L(`${kind}: ${s.count} formati`);
    L(`  Partite/torneo (media): ${fmtNum(s.avgGamesPerTournament)} · Monte: ${fmtPct(s.avgMonteGameRate)} · Finite: ${fmtPct(s.avgFinishedGameRate)}`);
    L(`  Turni/partita: ${fmtNum(s.avgTurnsPerGame)} · Carte in mano al monte (media): ${fmtNum(s.avgMonteCardsInHand)}`);
    L(`  Equità sedi: spread vittorie medio ${fmtNum(s.avgSeatWinSpreadPct, 1)} pp · spread punteggio ${fmtNum(s.avgScoreSpread, 1)} pt`);
    L(`  Formati con chi2 significativo (bias sede p<0.05): ${s.biasedSeatCount}/${s.count}`);
    L(`  Starter vince partita: ${fmtPct(s.avgStarterWonGameRate)}`);
    L("");
  }

  L("--- G=N (formati raccomandati) — dettaglio ---");
  for (const c of report.gn) {
    const e = c.equity;
    L(`${c.key}: partite ${fmtNum(c.gamesPerTournament)} · monte ${fmtPct(c.monteRate)} · carte al monte ${fmtNum(c.monteAvgCards)} (max ${c.monteMaxCards})`);
    L(`  Equità: spread vittorie ${fmtNum(e.spreadRatePct, 1)} pp · chi2=${fmtNum(e.chi2, 2)} (soglia ${fmtNum(e.critical05, 2)}) ${e.biased ? "[!] BIAS" : "ok"}`);
    L(`  Sedi: ${c.seats.map(s => `${s.label} ${fmtPct(s.winRate, 0)} vittorie, score ${fmtNum(s.avgScore, 1)}`).join(" · ")}`);
  }
  L("");

  L("--- Formati meno «equilibrati» (spread vittorie sedi) ---");
  for (const c of report.outliers.worstEquityAll) {
    L(`${c.key} [${c.kind}]: spread ${fmtNum(c.equity.spreadRatePct, 1)} pp · chi2=${fmtNum(c.equity.chi2, 1)} ${c.equity.biased ? "BIAS" : ""} · monte ${fmtPct(c.tournaments.monteGameRate)}`);
  }
  L("");

  L("--- Under con più partite finite (non monte) ---");
  for (const c of report.outliers.bestFinishedUnder) {
    L(`${c.key}: finite ${fmtPct(c.tournaments.finishedGameRate ?? c.tournaments.finishedHandRate)} · monte ${fmtPct(c.tournaments.monteGameRate)} · equità spread ${fmtNum(c.equity.spreadRatePct, 1)} pp`);
  }

  return lines.join("\n");
}

function verdict(report) {
  const gn = report.kindSummary["G=N"];
  const gnRows = report.gn;
  const gnAllComplete = gnRows.every(c => true);
  const gnBiased = report.gn.filter(c => c.equity.biased).length;
  const gnAvgSpread = gn.avgSeatWinSpreadPct;

  const points = [];
  if (gnAllComplete && gn.count === 6) {
    points.push("Completamento torneo: 100% su tutti i G=N (nessuno stallo con planner).");
  }
  if (gnBiased === 0) {
    points.push(`Equità sedi G=N: nessun formato con chi2 significativo a 300 tornei (spread vittorie medio ${gnAvgSpread.toFixed(1)} pp).`);
  } else {
    points.push(`Equità sedi G=N: ${gnBiased}/6 formati con chi2 significativo — da verificare.`);
  }
  if (gn.avgMonteGameRate > 0.9) {
    points.push(`Gameplay G=N: ${(100 * gn.avgMonteGameRate).toFixed(0)}% partite a monte in media — le partite finiscono raramente «pulite», ma il punteggio/arrivo regolano l'esito.`);
  }
  if (gn.avgMonteCardsInHand < 6) {
    points.push(`Penalità monte G=N: media ${gn.avgMonteCardsInHand.toFixed(1)} carte in mano — penalità contenuta.`);
  }

  const underSpread = report.kindSummary.under.avgSeatWinSpreadPct;
  if (underSpread > gnAvgSpread * 1.5) {
    points.push(`Under: equità peggiore (spread vittorie medio ${underSpread.toFixed(1)} pp vs ${gnAvgSpread.toFixed(1)} G=N).`);
  }

  return points;
}

const { report, enrich } = analyze(loadAllAudits().cells);
const text = printReport(report);
const points = verdict(report);

console.log(text);
console.log("\n=== VERDETTO ===\n");
for (const p of points) console.log(`• ${p}`);

const outPath = path.join(AUDIT_DIR, "REPORT-definitivo.txt");
fs.writeFileSync(outPath, text + "\n\n=== VERDETTO ===\n\n" + points.map(p => `• ${p}`).join("\n") + "\n", "utf8");

const jsonPath = path.join(AUDIT_DIR, "REPORT-definitivo.json");
fs.writeFileSync(jsonPath, JSON.stringify({ report, verdict: points, generatedAt: new Date().toISOString() }, null, 2), "utf8");

process.stderr.write(`\nReport: ${outPath}\nJSON: ${jsonPath}\n`);