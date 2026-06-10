"use strict";

const fs = require("fs");
const path = require("path");

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;

function formatKind(size, players) {
  if (players === size) return "G=N";
  if (players > size) return "overcrowded";
  return "under";
}

function cellsForSize(size) {
  const cells = [];
  const gMax = core.maxPlayersForSize(size);
  for (let players = 2; players <= gMax; players++) {
    if (!core.isPlayableSetup(size, players)) continue;
    const deal = core.computeInitialDeal(size, players);
    cells.push({
      size,
      players,
      key: `${size}x${players}`,
      kind: formatKind(size, players),
      deal: {
        cardsPerPlayer: deal.cardsPerPlayer,
        drawCount: deal.drawCount,
        overcrowded: deal.overcrowded,
        totalCards: deal.totalCards
      }
    });
  }
  return cells;
}

function emptySeatAgg(players) {
  return Array.from({ length: players }, (_, seat) => ({
    seat,
    label: `G${seat + 1}`,
    tournamentWins: 0,
    scoreSum: 0,
    firstFinishes: 0,
    starterHands: 0,
    handPointsSum: 0
  }));
}

function runCellAudit(cell, count, strategy, seedTag) {
  const { size, players } = cell;
  const deck = core.simulationDeck();
  const random = core.mulberry32(core.hashSeed(`tournament-audit:${seedTag}:${cell.key}:${strategy}`));
  const strategies = Array.from({ length: players }, () => strategy);

  const agg = {
    ...cell,
    tournaments: {
      requested: count,
      completed: 0,
      stalled: 0,
      handsPlayedSum: 0,
      monteHandsSum: 0,
      finishedHandsSum: 0,
      turnsSum: 0
    },
    seats: emptySeatAgg(players),
    hands: {
      starterWonHandCount: 0,
      firstStarterWinHandIndexSum: 0,
      firstStarterWinHandIndexCount: 0,
      neverStarterWonHand: 0
    },
    monte: {
      events: 0,
      handCardsSum: 0,
      handCardsCount: 0,
      handCardsMax: 0,
      drawCardsSum: 0,
      drawCardsMax: 0,
      stillInPlayersSum: 0
    },
    samples: []
  };

  for (let i = 0; i < count; i++) {
    const result = core.simulateTournament(deck, {
      size,
      players,
      random,
      strategies
    });

    if (!result.tournamentComplete) {
      agg.tournaments.stalled++;
      continue;
    }

    agg.tournaments.completed++;
    agg.tournaments.handsPlayedSum += result.tournamentHandsPlayed || 0;
    agg.tournaments.monteHandsSum += result.tournamentMonteHands || 0;
    agg.tournaments.turnsSum += result.turns || 0;

    const scores = result.tournamentScores || [];
    for (let seat = 0; seat < players; seat++) {
      agg.seats[seat].scoreSum += scores[seat] || 0;
    }
    if (result.winner !== null && result.winner !== undefined) {
      agg.seats[result.winner].tournamentWins++;
    }

    const handLog = result.tournamentHandLog || [];
    let firstStarterWin = null;
    for (const hand of handLog) {
      if (hand.reason === "finished") {
        agg.tournaments.finishedHandsSum++;
      }

      const starter = hand.starter;
      if (starter >= 0 && starter < players) {
        agg.seats[starter].starterHands++;
      }
      if (hand.firstFinisher !== null && hand.firstFinisher !== undefined) {
        agg.seats[hand.firstFinisher].firstFinishes++;
      }
      if (hand.starterWonHand) {
        agg.hands.starterWonHandCount++;
        if (firstStarterWin === null) {
          firstStarterWin = hand.handIndex + 1;
        }
      }
      if (hand.handScores) {
        for (let seat = 0; seat < players; seat++) {
          agg.seats[seat].handPointsSum += hand.handScores[seat] || 0;
        }
      }
      if (hand.monte) {
        agg.monte.events++;
        agg.monte.drawCardsSum += hand.monte.drawCards || 0;
        agg.monte.drawCardsMax = Math.max(agg.monte.drawCardsMax, hand.monte.drawCards || 0);
        agg.monte.stillInPlayersSum += hand.monte.playersStillIn || 0;
        for (const row of hand.monte.stillIn || []) {
          agg.monte.handCardsSum += row.handCards || 0;
          agg.monte.handCardsCount++;
          agg.monte.handCardsMax = Math.max(agg.monte.handCardsMax, row.handCards || 0);
        }
      }
    }

    if (firstStarterWin !== null) {
      agg.hands.firstStarterWinHandIndexSum += firstStarterWin;
      agg.hands.firstStarterWinHandIndexCount++;
    } else if (handLog.length) {
      agg.hands.neverStarterWonHand++;
    }

    if (agg.samples.length < 3) {
      agg.samples.push({
        tournamentIndex: i,
        winner: result.winner,
        scores: scores.slice(),
        handLog: handLog.map(h => ({
          handIndex: h.handIndex,
          starter: h.starter,
          reason: h.reason,
          firstFinisher: h.firstFinisher,
          starterWonHand: h.starterWonHand,
          turns: h.turns,
          handScores: h.handScores,
          monte: h.monte
            ? {
                drawCards: h.monte.drawCards,
                stillIn: h.monte.stillIn
              }
            : null
        }))
      });
    }
  }

  return finalizeCellAgg(agg);
}

function finalizeCellAgg(agg) {
  const { tournaments, seats, hands, monte } = agg;
  const completed = tournaments.completed || 0;
  const handsTotal = tournaments.handsPlayedSum || 0;

  const seatRows = seats.map(s => ({
    ...s,
    winRate: completed ? s.tournamentWins / completed : 0,
    avgScore: completed ? s.scoreSum / completed : 0,
    avgHandPoints: handsTotal ? s.handPointsSum / handsTotal : 0,
    firstFinishRate: handsTotal ? s.firstFinishes / handsTotal : 0,
    starterHandsPerTournament: completed ? s.starterHands / completed : 0
  }));

  return {
    key: agg.key,
    size: agg.size,
    players: agg.players,
    kind: agg.kind,
    deal: agg.deal,
    tournaments: {
      ...tournaments,
      completionRate: tournaments.requested ? completed / tournaments.requested : 0,
      avgHandsPerTournament: completed ? tournaments.handsPlayedSum / completed : 0,
      avgMonteHandsPerTournament: completed ? tournaments.monteHandsSum / completed : 0,
      monteHandRate: handsTotal ? tournaments.monteHandsSum / handsTotal : 0,
      finishedHandRate: handsTotal ? tournaments.finishedHandsSum / handsTotal : 0,
      avgTurnsPerTournament: completed ? tournaments.turnsSum / completed : 0,
      avgTurnsPerHand: handsTotal ? tournaments.turnsSum / handsTotal : 0
    },
    seats: seatRows,
    hands: {
      ...hands,
      starterWonHandRate: handsTotal ? hands.starterWonHandCount / handsTotal : 0,
      avgFirstStarterWinHandIndex: hands.firstStarterWinHandIndexCount
        ? hands.firstStarterWinHandIndexSum / hands.firstStarterWinHandIndexCount
        : null,
      neverStarterWonHandRate: completed ? hands.neverStarterWonHand / completed : 0
    },
    monte: {
      ...monte,
      avgHandCardsPerStillIn: monte.handCardsCount ? monte.handCardsSum / monte.handCardsCount : 0,
      avgDrawCardsAtMonte: monte.events ? monte.drawCardsSum / monte.events : 0,
      avgStillInPlayers: monte.events ? monte.stillInPlayersSum / monte.events : 0
    },
    samples: agg.samples
  };
}

function auditSizes(sizes, count, strategy, seedTag) {
  const cells = [];
  for (const size of sizes) {
    cells.push(...cellsForSize(size));
  }
  return cells.map(cell => runCellAudit(cell, count, strategy, seedTag));
}

function writeAuditOutput(filename, payload) {
  const dir = path.join(__dirname, "..", "results", "tournament-audit");
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, filename);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  return outPath;
}

function buildManifestEntry(size, count, strategy, workers, durationMs, cellResults) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    size,
    countPerCell: count,
    strategy,
    workers,
    durationMs,
    durationHuman: `${(durationMs / 1000).toFixed(1)}s`,
    cells: cellResults.length,
    tournamentsTotal: cellResults.reduce((s, c) => s + c.tournaments.requested, 0),
    tournamentsCompleted: cellResults.reduce((s, c) => s + c.tournaments.completed, 0),
    cellResults
  };
}

module.exports = {
  core,
  cellsForSize,
  runCellAudit,
  auditSizes,
  writeAuditOutput,
  buildManifestEntry
};