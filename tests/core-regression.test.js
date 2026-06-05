"use strict";

const assert = require("node:assert/strict");

require("../mpcards-core.js");
require("../game-state.js");

const core = globalThis.MPCardsCore;
const gameState = globalThis.MPCardsGameState;
const deck = core.simulationDeck();
const card = code => {
  const found = deck.find(item => item.code === code);
  if (!found) throw new Error("Carta test mancante: " + code);
  return found;
};

function boardFromScreenshotState() {
  return {
    size: 5,
    players: 1,
    hands: [[card("428")]],
    drawPile: [],
    board: [
      { x: 1, y: 1, card: card("118"), playerId: 0 },
      { x: 2, y: 1, card: card("227"), playerId: 0 },
      { x: 3, y: 1, card: card("238"), playerId: 0 },
      { x: 2, y: 2, card: card("247"), playerId: 0 },
      { x: 3, y: 2, card: card("328"), playerId: 0 }
    ],
    currentPlayer: 0,
    consecutivePasses: 0,
    turns: 0,
    turnPlayed: 0,
    status: "playing",
    winner: null,
    lastMove: null
  };
}

function testRejectsScreenshotIllegalMove() {
  const state = boardFromScreenshotState();
  const move = { cardUid: card("428").uid, card: card("428"), x: 1, y: 2 };
  const score = core.placementScore(state, card("428"), 1, 2);
  const listedAsLegal = core.legalPlacements(state, 0, 1).some(candidate =>
    candidate.cardUid === move.cardUid &&
    candidate.x === move.x &&
    candidate.y === move.y
  );

  assert.equal(score.neighbors, 2);
  assert.equal(score.compatibleNeighbors, 1);
  assert.equal(listedAsLegal, false);
  assert.throws(() => core.applyPlacement(state, 0, move), /Posa non legale/);
  assert.equal(state.board.length, 5);
  assert.equal(state.hands[0].length, 1);
}

function testAcceptsLegalMoveAndRecomputesScore() {
  const state = boardFromScreenshotState();
  const move = { cardUid: card("428").uid, card: card("428"), x: 0, y: 1, matches: 999 };

  core.applyPlacement(state, 0, move);

  assert.equal(state.board.length, 6);
  assert.equal(state.board.at(-1).card.code, "428");
  assert.equal(state.lastMove.matches, 1);
}

function testGameTimelineUndoRedoAndBranching() {
  const random = gameState.createRandom("timeline-test");
  const state = {
    size: 3,
    players: 1,
    hands: [[card("118"), card("227"), card("238")]],
    drawPile: [],
    board: [],
    currentPlayer: 0,
    consecutivePasses: 0,
    turns: 0,
    turnPlayed: 0,
    status: "playing",
    winner: null,
    lastMove: null
  };
  const session = gameState.createSession({ seed: "timeline-test" }, state, random);

  gameState.commit(session, "prima", random, next => {
    core.applyPlacement(next, 0, { cardUid: card("118").uid, x: 0, y: 0 });
    core.endTurn(next);
  });
  gameState.commit(session, "seconda", random, next => {
    core.applyPlacement(next, 0, { cardUid: card("227").uid, x: 1, y: 0 });
  });

  assert.equal(gameState.currentState(session).board.length, 2);
  assert.equal(gameState.canUndo(session), true);
  assert.equal(gameState.undo(session, random), true);
  assert.equal(gameState.currentState(session).board.length, 1);
  assert.equal(gameState.canRedo(session), true);
  assert.equal(gameState.redo(session, random), true);
  assert.equal(gameState.currentState(session).board.length, 2);

  gameState.undo(session, random);
  gameState.commit(session, "ramo", random, next => {
    core.applyPlacement(next, 0, { cardUid: card("227").uid, x: -1, y: 0 });
  });

  assert.equal(gameState.currentState(session).board.length, 2);
  assert.equal(gameState.currentState(session).board.at(-1).x, -1);
  assert.equal(gameState.canRedo(session), false);
  assert.deepEqual(gameState.labels(session), ["Inizio partita", "prima", "ramo"]);
}

function testGameSessionExportImport() {
  const random = gameState.createRandom("export-test");
  const session = gameState.createSession(
    { seed: "export-test", modes: ["manual"], strategySettings: ["random"], strategies: ["random"] },
    boardFromScreenshotState(),
    random
  );
  gameState.commit(session, "mossa", random, next => {
    core.applyPlacement(next, 0, { cardUid: card("428").uid, x: 0, y: 1 });
  });
  gameState.undo(session, random);

  const imported = gameState.importSession(JSON.stringify(gameState.exportSession(session)));

  assert.equal(imported.schema, gameState.SCHEMA);
  assert.equal(imported.timeline.cursor, 0);
  assert.equal(imported.timeline.entries.length, 2);
  assert.equal(gameState.currentState(imported).board.length, 5);
  assert.equal(imported.config.strategies[0], "random");
}

function testDuraMaterClosedInvertsTurnDirection() {
  const deck = core.simulationDeck().filter(c => Number(c.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 4, random: () => 0 });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 2, y: 0, card: card("227"), playerId: 0 },
    { x: 1, y: 1, card: card("238"), playerId: 0 },
    { x: 0, y: 2, card: card("247"), playerId: 0 },
    { x: 2, y: 2, card: card("328"), playerId: 0 }
  ];
  assert.equal(core.isDuraMaterDelimited(state), true);
  core.maybeCloseDuraMater(state, 2);
  assert.equal(state.duraMaterClosed, true);
  assert.equal(state.turnDirection, -1);
  assert.deepEqual(state.turnOrder, [0, 1, 2, 3]);
  state.currentPlayer = 2;
  core.endTurn(state);
  assert.equal(state.currentPlayer, 1);
  core.endTurn(state);
  assert.equal(state.currentPlayer, 0);
}

function testAxisCloseTogglesOnFirstAxisThenDm() {
  const deck = core.simulationDeck().filter(c => Number(c.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 3, random: () => 0 });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 1, y: 0, card: card("227"), playerId: 1 }
  ];
  const before = { widthAxisFixed: false, heightAxisFixed: false };
  core.handleTurnOrderAfterPlacement(state, 1, before);
  assert.equal(state.widthAxisFixed, false);
  assert.equal(state.turnDirection, 1);

  state.board.push({ x: 2, y: 0, card: card("238"), playerId: 2 });
  const beforeLine = { widthAxisFixed: false, heightAxisFixed: false };
  core.handleTurnOrderAfterPlacement(state, 2, beforeLine);
  assert.equal(state.widthAxisFixed, true);
  assert.equal(state.firstAxisInversionDone, true);
  assert.equal(state.turnDirection, -1);
  assert.equal(state.duraMaterClosed, false);
}

function testAxisCloseSameTurnDoubleToggleCancels() {
  const deck = core.simulationDeck().filter(c => Number(c.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 3, random: () => 0 });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 1, y: 0, card: card("227"), playerId: 0 },
    { x: 2, y: 0, card: card("238"), playerId: 0 },
    { x: 0, y: 1, card: card("247"), playerId: 0 },
    { x: 1, y: 1, card: card("328"), playerId: 0 },
    { x: 2, y: 1, card: card("336"), playerId: 0 }
  ];
  state.board.push({ x: 0, y: 2, card: card("348"), playerId: 0 });
  const before = { widthAxisFixed: false, heightAxisFixed: false };
  core.handleTurnOrderAfterPlacement(state, 0, before);
  assert.equal(state.duraMaterClosed, true);
  assert.equal(state.turnDirection, 1);
  state.currentPlayer = 0;
  core.endTurn(state);
  assert.equal(state.currentPlayer, 1);
}

testRejectsScreenshotIllegalMove();
testAcceptsLegalMoveAndRecomputesScore();
testGameTimelineUndoRedoAndBranching();
testGameSessionExportImport();
testDuraMaterClosedInvertsTurnDirection();
testAxisCloseTogglesOnFirstAxisThenDm();
testAxisCloseSameTurnDoubleToggleCancels();

function testDrawAtTurnEndAfterPlaying() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 2, random: () => 0 });
  assert.equal(state.hands[0].length, 3);
  state.turnPlayed = 1;
  core.endTurn(state);
  assert.equal(state.hands[0].length, 4);
  assert.equal(state.hands[1].length, 3);
}

testDrawAtTurnEndAfterPlaying();

function testDurissimaEmptyHandDoesNotEndGameEarly() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 2, random: () => 0, durissimaMater: true });
  state.hands[0] = [];
  assert.equal(state.status, "playing");
  assert.equal(state.winner, null);
  assert.equal(core.isBoardComplete(state), false);
}

function testDurissimaCompletesWhenBoardFull() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 2);
  const solo = core.setupGame(deck, { size: 2, players: 1, random: () => 0, durissimaMater: true });
  solo.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 1, y: 0, card: card("227"), playerId: 0 },
    { x: 0, y: 1, card: card("238"), playerId: 0 },
    { x: 1, y: 1, card: card("247"), playerId: 0 }
  ];
  assert.equal(core.maybeCompleteDurissima(solo), true);
  assert.equal(solo.status, "success");
  assert.equal(solo.winner, 0);

  const coop = core.setupGame(deck, { size: 2, players: 2, random: () => 0, durissimaMater: true });
  coop.board = solo.board.map(entry => ({ ...entry, playerId: 1 }));
  assert.equal(core.maybeCompleteDurissima(coop), true);
  assert.equal(coop.winner, null);
}

testDurissimaEmptyHandDoesNotEndGameEarly();
testDurissimaCompletesWhenBoardFull();

function testPlannerPlaysWhenLegalMovesExist() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 2, random: () => 0.5 });
  const random = core.mulberry32(42);
  const result = core.botStep(state, ["planner", "random"], random);
  assert.equal(result.played || result.passed || result.ended, true);
}

function testPlannerDoesNotHangForLaterPlayers() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 4);
  const state = core.setupGame(deck, { size: 4, players: 4, random: () => 0.42 });
  state.currentPlayer = 3;
  const random = core.mulberry32(77);
  const started = Date.now();
  for (let step = 0; step < 24 && state.status === "playing"; step++) {
    core.botStep(state, ["planner", "planner", "planner", "planner"], random);
  }
  assert.ok(Date.now() - started < 8000, "planner simulation should finish quickly");
}

testPlannerPlaysWhenLegalMovesExist();
testPlannerDoesNotHangForLaterPlayers();

function testRandomInitialTurnOrder() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 4);
  const starters = new Set();
  for (let i = 0; i < 32; i++) {
    const state = core.setupGame(deck, {
      size: 4,
      players: 4,
      random: core.mulberry32(5000 + i),
      randomizeTurnOrder: true
    });
    starters.add(state.currentPlayer);
  }
  assert.ok(starters.size >= 2);
  const fixed = core.setupGame(deck, { size: 4, players: 4, random: () => 0, randomizeTurnOrder: false });
  assert.equal(fixed.currentPlayer, 0);
  assert.deepEqual(fixed.turnOrder, [0, 1, 2, 3]);
}

testRandomInitialTurnOrder();

function testSimulateGameReportsClosure() {
  const random = core.mulberry32(core.hashSeed("sim-close"));
  const deck = core.simulationDeck();
  const result = core.simulateGame(deck, {
    size: 3,
    players: 2,
    strategies: ["random", "random"],
    random
  });
  assert.equal(typeof result.duraMaterClosed, "boolean");
  assert.ok(result.closedByPlayer === null || Number.isInteger(result.closedByPlayer));
}

testSimulateGameReportsClosure();

function testAccumulateTurnRoleStats() {
  const patch = { done: 0 };
  const result = {
    status: "success",
    winner: 2,
    initialTurnOrder: [1, 2, 0],
    duraMaterClosed: true,
    closedByPlayer: 1
  };
  core.accumulateTurnRoleStats(patch, result, 3);
  assert.equal(patch.winsByInitialTurnSlot[1], 1);
  assert.equal(patch.pointsByInitialTurnSlot[1], 3);
  assert.equal(patch.playedByInitialTurnSlot[0], 1);
  assert.equal(patch.playedByInitialTurnSlot[1], 1);
  assert.equal(patch.playedByInitialTurnSlot[2], 1);
  assert.equal(patch.dmClosedCount, 1);
  assert.equal(patch.dmCloserByInitialTurnSlot[0], 1);
  assert.equal(patch.dmCloserWins, 0);
}

testAccumulateTurnRoleStats();

function testWinnerInitialTurnSlotVaries() {
  const deck = core.simulationDeck();
  const slots = new Set();
  for (let i = 0; i < 80; i++) {
    const result = core.simulateGame(deck, {
      size: 4,
      players: 4,
      strategies: ["planner", "planner", "planner", "planner"],
      random: core.mulberry32(12000 + i),
      randomizeTurnOrder: true
    });
    if (result.status === "success" && result.winnerInitialTurnSlot !== null) {
      slots.add(result.winnerInitialTurnSlot);
    }
  }
  assert.ok(slots.size >= 2, "winner should appear in more than one initial turn slot");
}

testWinnerInitialTurnSlotVaries();

function testShuffleStrategiesAmongSeats() {
  const deck = core.simulationDeck();
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const result = core.simulateGame(deck, {
      size: 4,
      players: 4,
      strategies: ["planner", "random", "compatibility", "high-value"],
      random: core.mulberry32(8800 + i),
      shuffleStrategiesAmongSeats: true
    });
    seen.add(result.strategies.join(","));
  }
  assert.ok(seen.size > 3, "shuffleStrategiesAmongSeats should vary seat assignment");
}

testShuffleStrategiesAmongSeats();

function testMatrixSizesCompetitivePlayability() {
  const fullDeck = core.simulationDeck();
  const mix = [
    "planner",
    "random",
    "compatibility",
    "high-value",
    "hand-planner",
    "low-value",
    "greedy",
    "adjacent"
  ];
  for (let L = 3; L <= 8; L++) {
    const strategies = mix.slice(0, L);
    let successes = 0;
    const trials = 24;
    for (let i = 0; i < trials; i++) {
      const result = core.simulateGame(fullDeck, {
        size: L,
        players: Math.min(2, L),
        strategies,
        random: core.mulberry32(12000 + L * 100 + i),

        durissimaMater: false,
        randomizeTurnOrder: true,
        shuffleStrategiesAmongSeats: true
      });
      if (result.status === "success") successes++;
    }
    assert.ok(
      successes >= 2,
      `L=${L} competitive 2p: expected some winning games, got ${successes}/${trials}`
    );
  }
}

testMatrixSizesCompetitivePlayability();

console.log("core regression tests passed");
