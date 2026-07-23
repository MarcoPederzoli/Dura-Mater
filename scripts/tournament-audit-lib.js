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

function cellsForSize(size, options = {}) {
  const cells = [];
  const gMax = core.maxPlayersForSize(size);
  const gStart = options.allLegal ? 2 : core.recommendedMinPlayers(size);
  for (let players = gStart; players <= gMax; players++) {
    if (!core.isPlayableSetup(size, players)) continue;
    if (!options.allLegal && !core.isDefaultSweepSetup(size, players)) continue;
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
    starterGames: 0,
    gamePointsSum: 0
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
      gamesPlayedSum: 0,
      monteGamesSum: 0,
      finishedGamesSum: 0,
      turnsSum: 0
    },
    seats: emptySeatAgg(players),
    games: {
      starterWonGameCount: 0,
      firstStarterWinGameIndexSum: 0,
      firstStarterWinGameIndexCount: 0,
      neverStarterWonGame: 0
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
    agg.tournaments.gamesPlayedSum += result.tournamentGamesPlayed || 0;
    agg.tournaments.monteGamesSum += result.tournamentMonteGames || 0;
    agg.tournaments.turnsSum += result.turns || 0;

    const scores = result.tournamentScores || [];
    for (let seat = 0; seat < players; seat++) {
      agg.seats[seat].scoreSum += scores[seat] || 0;
    }
    if (result.winner !== null && result.winner !== undefined) {
      agg.seats[result.winner].tournamentWins++;
    }

    const gameLog = result.tournamentGameLog || [];
    let firstStarterWin = null;
    for (const game of gameLog) {
      if (game.reason === "finished") {
        agg.tournaments.finishedGamesSum++;
      }

      const starter = game.starter;
      if (starter >= 0 && starter < players) {
        agg.seats[starter].starterGames++;
      }
      if (game.firstFinisher !== null && game.firstFinisher !== undefined) {
        agg.seats[game.firstFinisher].firstFinishes++;
      }
      if (game.starterWonGame) {
        agg.games.starterWonGameCount++;
        if (firstStarterWin === null) {
          firstStarterWin = game.gameIndex + 1;
        }
      }
      if (game.gameScores) {
        for (let seat = 0; seat < players; seat++) {
          agg.seats[seat].gamePointsSum += game.gameScores[seat] || 0;
        }
      }
      if (game.monte) {
        agg.monte.events++;
        agg.monte.drawCardsSum += game.monte.drawCards || 0;
        agg.monte.drawCardsMax = Math.max(agg.monte.drawCardsMax, game.monte.drawCards || 0);
        agg.monte.stillInPlayersSum += game.monte.playersStillIn || 0;
        for (const row of game.monte.stillIn || []) {
          agg.monte.handCardsSum += row.handCards || 0;
          agg.monte.handCardsCount++;
          agg.monte.handCardsMax = Math.max(agg.monte.handCardsMax, row.handCards || 0);
        }
      }
    }

    if (firstStarterWin !== null) {
      agg.games.firstStarterWinGameIndexSum += firstStarterWin;
      agg.games.firstStarterWinGameIndexCount++;
    } else if (gameLog.length) {
      agg.games.neverStarterWonGame++;
    }

    if (agg.samples.length < 3) {
      agg.samples.push({
        tournamentIndex: i,
        winner: result.winner,
        scores: scores.slice(),
        gameLog: gameLog.map(g => ({
          gameIndex: g.gameIndex,
          starter: g.starter,
          reason: g.reason,
          firstFinisher: g.firstFinisher,
          starterWonGame: g.starterWonGame,
          turns: g.turns,
          gameScores: g.gameScores,
          monte: g.monte
            ? {
                drawCards: g.monte.drawCards,
                stillIn: g.monte.stillIn
              }
            : null
        }))
      });
    }
  }

  return finalizeCellAgg(agg);
}

function finalizeCellAgg(agg) {
  const { tournaments, seats, games, monte } = agg;
  const completed = tournaments.completed || 0;
  const gamesTotal = tournaments.gamesPlayedSum || 0;

  const seatRows = seats.map(s => ({
    ...s,
    winRate: completed ? s.tournamentWins / completed : 0,
    avgScore: completed ? s.scoreSum / completed : 0,
    avgGamePoints: gamesTotal ? s.gamePointsSum / gamesTotal : 0,
    firstFinishRate: gamesTotal ? s.firstFinishes / gamesTotal : 0,
    starterGamesPerTournament: completed ? s.starterGames / completed : 0
  }));

  const gamesStats = {
    ...games,
    starterWonGameRate: gamesTotal ? games.starterWonGameCount / gamesTotal : 0,
    avgFirstStarterWinGameIndex: games.firstStarterWinGameIndexCount
      ? games.firstStarterWinGameIndexSum / games.firstStarterWinGameIndexCount
      : null,
    neverStarterWonGameRate: completed ? games.neverStarterWonGame / completed : 0
  };

  return {
    key: agg.key,
    size: agg.size,
    players: agg.players,
    kind: agg.kind,
    deal: agg.deal,
    tournaments: {
      ...tournaments,
      completionRate: tournaments.requested ? completed / tournaments.requested : 0,
      avgGamesPerTournament: completed ? tournaments.gamesPlayedSum / completed : 0,
      avgMonteGamesPerTournament: completed ? tournaments.monteGamesSum / completed : 0,
      monteGameRate: gamesTotal ? tournaments.monteGamesSum / gamesTotal : 0,
      finishedGameRate: gamesTotal ? tournaments.finishedGamesSum / gamesTotal : 0,
      // alias legacy
      finishedHandRate: gamesTotal ? tournaments.finishedGamesSum / gamesTotal : 0,
      avgTurnsPerTournament: completed ? tournaments.turnsSum / completed : 0,
      avgTurnsPerGame: gamesTotal ? tournaments.turnsSum / gamesTotal : 0,
      avgTurnsPerHand: gamesTotal ? tournaments.turnsSum / gamesTotal : 0
    },
    seats: seatRows,
    games: gamesStats,
    // alias: vecchi consumer usavano .hands per le stat delle partite del torneo
    hands: gamesStats,
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