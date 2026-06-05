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

function testDuraMaterClosedInvertsTurnOrder() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 4, random: () => 0 });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 2, y: 0, card: card("227"), playerId: 0 },
    { x: 1, y: 1, card: card("238"), playerId: 0 },
    { x: 0, y: 2, card: card("247"), playerId: 0 },
    { x: 2, y: 2, card: card("328"), playerId: 0 }
  ];
  assert.equal(core.isDuraMaterDelimited(state), true);
  assert.equal(state.duraMaterClosed, false);
  core.maybeCloseDuraMater(state, 2);
  assert.equal(state.duraMaterClosed, true);
  assert.equal(state.closedByPlayer, 2);
  assert.deepEqual(state.turnOrder, [2, 1, 0, 3]);
  state.currentPlayer = 2;
  core.endTurn(state);
  assert.equal(state.currentPlayer, 1);
  core.endTurn(state);
  assert.equal(state.currentPlayer, 0);
}

testRejectsScreenshotIllegalMove();
testAcceptsLegalMoveAndRecomputesScore();
testGameTimelineUndoRedoAndBranching();
testGameSessionExportImport();
testDuraMaterClosedInvertsTurnOrder();

console.log("core regression tests passed");
