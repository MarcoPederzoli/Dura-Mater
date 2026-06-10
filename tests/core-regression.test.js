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
    core.applyPlacement(next, 0, { cardUid: card("238").uid, x: 1, y: 0 });
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
    core.applyPlacement(next, 0, { cardUid: card("238").uid, x: -1, y: 0 });
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
  const deck = core.simulationDeck().filter(c => Number(c.value) <= 4);
  const state = core.setupGame(deck, { size: 4, players: 4, random: () => 0, randomizeTurnOrder: false });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 3, y: 0, card: card("227"), playerId: 0 },
    { x: 1, y: 1, card: card("238"), playerId: 0 },
    { x: 2, y: 2, card: card("247"), playerId: 0 },
    { x: 0, y: 3, card: card("328"), playerId: 0 },
    { x: 3, y: 3, card: card("336"), playerId: 0 }
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
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const solo = core.setupGame(deck, { size: 3, players: 1, random: () => 0, durissimaMater: true });
  solo.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 1, y: 0, card: card("227"), playerId: 0 },
    { x: 2, y: 0, card: card("238"), playerId: 0 },
    { x: 0, y: 1, card: card("247"), playerId: 0 },
    { x: 1, y: 1, card: card("328"), playerId: 0 },
    { x: 2, y: 1, card: card("336"), playerId: 0 },
    { x: 0, y: 2, card: card("348"), playerId: 0 },
    { x: 1, y: 2, card: card("356"), playerId: 0 },
    { x: 2, y: 2, card: card("367"), playerId: 0 }
  ];
  assert.equal(core.maybeCompleteDurissima(solo), true);
  assert.equal(solo.status, "success");
  assert.equal(solo.winner, 0);

  const coop = core.setupGame(deck, { size: 3, players: 2, random: () => 0, durissimaMater: true });
  coop.board = solo.board.map(entry => ({ ...entry, playerId: 1 }));
  assert.equal(core.maybeCompleteDurissima(coop), true);
  assert.equal(coop.winner, null);
}

testDurissimaEmptyHandDoesNotEndGameEarly();
testDurissimaCompletesWhenBoardFull();

function testDurissimaPassOnlyAfterAtLeastOnePlacement() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const solo = core.setupGame(deck, { size: 3, players: 1, random: () => 0, durissimaMater: true });
  assert.equal(core.canPassTurnVoluntarily(solo), false);
  assert.throws(() => core.passTurn(solo), /vita extra/);
  solo.turnPlayed = 1;
  const beforeSolo = solo.hands[0].length;
  core.endTurn(solo);
  assert.ok(solo.hands[0].length >= beforeSolo || solo.drawPile.length === 0);

  const multi = core.setupGame(deck, { size: 3, players: 2, random: () => 0, durissimaMater: true });
  assert.equal(core.canPassTurnVoluntarily(multi), true);
  const pid = multi.currentPlayer;
  const handBefore = multi.hands[pid].length;
  const pileBefore = multi.drawPile.length;
  core.passTurn(multi);
  assert.equal(multi.hands[pid].length, handBefore);
  assert.equal(multi.turnPlayed, 0);
}

function testMonteAfterFullRoundPassesEvenWithDrawPile() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 2, random: () => 0 });
  assert.ok(state.drawPile.length > 0);
  core.passTurn(state);
  assert.equal(state.status, "playing");
  core.passTurn(state);
  assert.equal(state.status, "stalled");
}

function testDurissimaCoopPassDoesNotDrawWithPile() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 2, random: () => 0, durissimaMater: true });
  assert.ok(state.drawPile.length > 0);
  const pid = state.currentPlayer;
  const handBefore = state.hands[pid].length;
  core.passTurn(state);
  assert.equal(state.hands[pid].length, handBefore);
}

function testDurissimaPlannerPlaysLegalMove() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, { size: 3, players: 1, random: () => 0.5, durissimaMater: true });
  const random = core.mulberry32(99);
  const result = core.botStep(state, ["durissima-planner"], random);
  assert.equal(result.played || result.drew || result.passed || result.ended, true);
}

testDurissimaPlannerPlaysLegalMove();

testDurissimaPassOnlyAfterAtLeastOnePlacement();
testMonteAfterFullRoundPassesEvenWithDrawPile();
testDurissimaCoopPassDoesNotDrawWithPile();

function testDurissimaDefaultSimpleRulesNoReactiveAids() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, { size: 5, players: 3, random: () => 0, durissimaMater: true });
  assert.equal(state.durissimaReserve.length, 0);
  assert.equal(state.durissimaEmergencyDrawsLeft, 0);
  assert.equal(state.durissimaVitaExtraPool, 0);
  assert.equal(state.durissimaVitaExtraEnabled, false);
}

function testDurissimaVitaExtraOptInPoolEqualsMatrixSize() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, {
    size: 5,
    players: 3,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: true
  });
  assert.equal(state.durissimaVitaExtraPool, 5);
  assert.equal(core.durissimaVitaExtraPoolLeft(state), 5);
  assert.equal(state.durissimaVitaExtraEnabled, true);
}

function testDurissimaVitaExtraReshufflesAndRefillsHand() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 1,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: true
  });
  const pileBefore = state.drawPile.length;
  const handBefore = state.hands[0].map(card => card.code);
  assert.equal(core.tryDurissimaVitaExtra(state, 0, core.mulberry32(42)), true);
  assert.equal(state.durissimaVitaExtraPool, 2);
  assert.equal(state.hands[0].length, 3);
  assert.equal(state.durissimaVitaExtraUsed[0], 1);
  assert.equal(state.drawPile.length + state.hands[0].length, pileBefore + handBefore.length);
}

function testDurissimaVitaExtraPoolChainsUntilPlayableOrEmpty() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 1,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: true,
    durissimaVitaExtraBudget: 3
  });
  const rng = core.mulberry32(11);
  assert.equal(core.tryDurissimaVitaExtra(state, 0, rng), true);
  assert.equal(core.tryDurissimaVitaExtra(state, 0, rng), true);
  assert.equal(core.tryDurissimaVitaExtra(state, 0, rng), true);
  assert.equal(core.tryDurissimaVitaExtra(state, 0, rng), false);
  assert.equal(state.durissimaVitaExtraPool, 0);
  assert.equal(state.durissimaVitaExtraUsed[0], 3);
}

function testDurissimaMultiPassAfterVitaGoesToNextPlayer() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 2,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: true,
    durissimaVitaExtraBudget: 1
  });
  state.currentPlayer = 0;
  state.turnPlayed = 0;
  state.hands[0] = [card("118")];
  state.hands[1] = [card("227")];
  state.board = [
    { x: 0, y: 0, card: card("238"), playerId: 0 },
    { x: 1, y: 0, card: card("247"), playerId: 0 },
    { x: 0, y: 1, card: card("328"), playerId: 0 },
    { x: 1, y: 1, card: card("336"), playerId: 0 },
    { x: 2, y: 0, card: card("348"), playerId: 0 },
    { x: 2, y: 1, card: card("356"), playerId: 0 },
    { x: 0, y: 2, card: card("118"), playerId: 0 },
    { x: 1, y: 2, card: card("227"), playerId: 0 }
  ];
  assert.equal(core.hasLegalPlacementsNow(state, 0), false);
  const stuck = core.resolveDurissimaStuck(state, core.mulberry32(3), { useVitaExtra: false });
  assert.equal(stuck, "passed");
  assert.equal(state.status, "playing");
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.consecutivePasses, 1);
}

function testDurissimaSoloAutoVitaExtraOnStuckWhenOptIn() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 1,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: true,
    durissimaVitaExtraBudget: 1
  });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 1, y: 0, card: card("227"), playerId: 0 },
    { x: 0, y: 1, card: card("238"), playerId: 0 },
    { x: 1, y: 1, card: card("247"), playerId: 0 },
    { x: 2, y: 0, card: card("328"), playerId: 0 },
    { x: 2, y: 1, card: card("336"), playerId: 0 },
    { x: 0, y: 2, card: card("348"), playerId: 0 },
    { x: 1, y: 2, card: card("356"), playerId: 0 }
  ];
  state.hands[0] = [card("118")];
  assert.equal(core.hasLegalPlacementsNow(state, 0), false);
  const random = core.mulberry32(7);
  const result = core.botStep(state, ["durissima-planner"], random);
  assert.equal(result.vitaExtra || state.durissimaVitaExtraUsed[0] > 0, true);
}

function testDurissimaSoloStuckWithoutMovesIsLoss() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 1,
    random: () => 0,
    durissimaMater: true
  });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 1, y: 0, card: card("227"), playerId: 0 },
    { x: 0, y: 1, card: card("238"), playerId: 0 },
    { x: 1, y: 1, card: card("247"), playerId: 0 },
    { x: 2, y: 0, card: card("328"), playerId: 0 },
    { x: 2, y: 1, card: card("336"), playerId: 0 },
    { x: 0, y: 2, card: card("348"), playerId: 0 },
    { x: 1, y: 2, card: card("356"), playerId: 0 }
  ];
  state.hands[0] = [card("118")];
  const result = core.botStep(state, ["durissima-planner"], core.mulberry32(3));
  assert.equal(result.lost || state.status === "stalled", true);
}

function testDurissimaTeamPlannerPlaysInCoop() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 4);
  const state = core.setupGame(deck, { size: 4, players: 2, random: () => 0.5, durissimaMater: true });
  const result = core.botStep(state, ["durissima-team-planner", "durissima-team-planner"], core.mulberry32(21));
  assert.equal(result.played || result.passed || result.ended, true);
}

function testDurissimaMultiNoEmergencyBuffer() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, { size: 5, players: 3, random: () => 0, durissimaMater: true });
  assert.equal(state.durissimaEmergencyDrawsLeft, 0);
  assert.equal(core.tryDurissimaEmergencyDraw(state, 0), false);
}

function testDurissimaSolitaireBufferExhaustedIsLoss() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 1,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraBudget: 0,
    durissimaEmergencyDrawBudget: 0
  });
  state.hands[0] = [];
  const result = core.botStep(state, ["planner"], () => 0);
  assert.equal(result.lost || state.status === "stalled", true);
}

testDurissimaDefaultSimpleRulesNoReactiveAids();
testDurissimaVitaExtraOptInPoolEqualsMatrixSize();
testDurissimaVitaExtraReshufflesAndRefillsHand();
testDurissimaVitaExtraPoolChainsUntilPlayableOrEmpty();
testDurissimaMultiPassAfterVitaGoesToNextPlayer();
testDurissimaSoloAutoVitaExtraOnStuckWhenOptIn();
testDurissimaSoloStuckWithoutMovesIsLoss();
testDurissimaTeamPlannerPlaysInCoop();
testDurissimaMultiNoEmergencyBuffer();
testDurissimaSolitaireBufferExhaustedIsLoss();

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

function testSimulateGameReportsFourCardTurns() {
  let gamesWithFour = 0;
  let totalFourCardTurns = 0;
  const trials = 200;
  for (let i = 0; i < trials; i++) {
    const result = core.simulateGame(deck, {
      size: 4,
      players: 2,
      strategies: ["planner", "planner"],
      random: core.mulberry32(44000 + i),
      durissimaMater: false,
      randomizeTurnOrder: true
    });
    assert.ok(result.maxPlacementsInTurn >= 0 && result.maxPlacementsInTurn <= 4);
    assert.equal(result.fourCardTurns >= 0, true);
    assert.equal(result.hadFourCardTurn, result.maxPlacementsInTurn >= 4);
    if (result.hadFourCardTurn) gamesWithFour++;
    totalFourCardTurns += result.fourCardTurns;
  }
  assert.ok(
    totalFourCardTurns >= gamesWithFour,
    `four-card turn count should be at least gamesWithFour (${totalFourCardTurns} vs ${gamesWithFour})`
  );
}

testSimulateGameReportsFourCardTurns();

function testIdeaFifthCardAfterFourPlacements() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 4);
  const state = core.setupGame(deck, { size: 4, players: 2, random: () => 0 });
  state.board = [
    { x: 0, y: 0, card: card("118"), playerId: 0 },
    { x: 1, y: 0, card: card("227"), playerId: 0 },
    { x: 0, y: 1, card: card("238"), playerId: 0 },
    { x: 1, y: 1, card: card("247"), playerId: 0 }
  ];
  state.currentPlayer = 0;
  state.turnPlayed = 4;
  state.hands[0] = [card("428")];
  const ideaMoves = core.legalPlacements(state, 0, 1);
  assert.ok(ideaMoves.length > 0, "expected at least one legal idea placement");
  const move = ideaMoves[0];
  core.applyPlacement(state, 0, move);
  assert.equal(state.turnPlayed, 5);
  assert.equal(state.lastMove.idea, true);
  assert.equal(state.lastMove.requirement, 1);
  assert.throws(
    () => core.validatePlacement(state, 0, move),
    /limite di pose|Partita non in corso/
  );
}

function testIdeaSkippedEndsTurnAtFour() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 4);
  const state = core.setupGame(deck, { size: 4, players: 2, random: () => 0 });
  state.turnPlayed = 4;
  state.hands[0] = [card("428")];
  assert.equal(core.canOfferIdea(state, 0), true);
  core.endTurn(state);
  assert.equal(state.turnPlayed, 0);
  assert.equal(state.currentPlayer, 1);
}

testIdeaFifthCardAfterFourPlacements();
testIdeaSkippedEndsTurnAtFour();

function testIdeaOffersCountedOnFourthPlacement() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 4);
  const state = core.setupGame(deck, { size: 4, players: 2, random: () => 0 });
  state.board = [
    { x: 1, y: 0, card: card("118"), playerId: 0 },
    { x: 0, y: 1, card: card("227"), playerId: 0 },
    { x: 2, y: 1, card: card("238"), playerId: 0 },
    { x: 1, y: 2, card: card("328"), playerId: 0 }
  ];
  state.turnPlayed = 3;
  state.hands[0] = [card("247"), card("428")];
  const fourth = core.legalPlacements(state, 0, 4)[0];
  assert.ok(fourth, "expected a legal fourth placement");
  core.applyPlacement(state, 0, fourth);
  assert.equal(state.turnPlacementStats.ideaOffers, 1);
  assert.equal(core.canOfferIdea(state, 0), true);
}

testIdeaOffersCountedOnFourthPlacement();

function testComputeInitialDealOvercrowded() {
  assert.deepEqual(core.computeInitialDeal(5, 7), {
    cardsPerPlayer: 3,
    drawCount: 4,
    overcrowded: true,
    totalCards: 25
  });
  assert.deepEqual(core.computeInitialDeal(8, 16), {
    cardsPerPlayer: 4,
    drawCount: 0,
    overcrowded: true,
    totalCards: 64
  });
  assert.deepEqual(core.computeInitialDeal(5, 4), {
    cardsPerPlayer: 5,
    drawCount: 5,
    overcrowded: false,
    totalCards: 25
  });
}

function testOvercrowdedSetupDeal() {
  const sub = deck.filter(card => Number(card.value) <= 5);
  const state = core.setupGame(sub, { size: 5, players: 7, random: () => 0 });
  assert.equal(state.hands.length, 7);
  state.hands.forEach(hand => assert.equal(hand.length, 3));
  assert.equal(state.drawPile.length, 4);
  assert.equal(state.initialHandSize, 3);
  assert.equal(state.overcrowdedDeal, true);
}

function testClassicDealWhenGNotGreaterThanN() {
  const sub = deck.filter(card => Number(card.value) <= 5);
  const state = core.setupGame(sub, { size: 5, players: 4, random: () => 0 });
  state.hands.forEach(hand => assert.equal(hand.length, 5));
  assert.equal(state.drawPile.length, 5);
  assert.equal(state.overcrowdedDeal, false);
}

function testIsPlayableSetupBounds() {
  assert.equal(core.isPlayableSetup(3, 3), true);
  assert.equal(core.isPlayableSetup(3, 4), false);
  assert.equal(core.isPlayableSetup(3, 9), false);
  assert.equal(core.isPlayableSetup(4, 5), true);
  assert.equal(core.isPlayableSetup(4, 6), false);
  assert.equal(core.isPlayableSetup(5, 8), true);
  assert.equal(core.isPlayableSetup(5, 9), false);
  assert.equal(core.isPlayableSetup(8, 16), true);
  assert.equal(core.isPlayableSetup(8, 17), false);
  assert.equal(core.isPlayableSetup(8, 21), false);
  assert.equal(core.isPlayableSetup(8, 22), false);
}

function testMaxPlayersForSize() {
  assert.equal(core.maxPlayersForSize(3), 6);
  assert.equal(core.maxPlayersForSize(4), 8);
  assert.equal(core.maxPlayersForSize(5), 10);
  assert.equal(core.maxPlayersForSize(8), 16);
}

function testRecommendedMaxPlayersIsClassicFormat() {
  assert.equal(core.recommendedMaxPlayers(3), 3);
  assert.equal(core.recommendedMaxPlayers(4), 4);
  assert.equal(core.recommendedMaxPlayers(5), 5);
  assert.equal(core.recommendedMaxPlayers(6), 6);
  assert.equal(core.recommendedMaxPlayers(7), 7);
  assert.equal(core.recommendedMaxPlayers(8), 8);
  assert.equal(core.isRecommendedSetup(5, 5), true);
  assert.equal(core.isRecommendedSetup(5, 7), false);
  assert.equal(core.isRecommendedSetup(5, 8), false);
  assert.equal(core.isPlayableSetup(5, 8), true);
  assert.equal(core.isRecommendedSetup(8, 16), false);
  assert.equal(core.isPlayableSetup(8, 16), true);
}

function testRejectsUnderThreeCardsPerHand() {
  assert.throws(
    () => core.setupGame(deck.filter(c => Number(c.value) <= 3), { size: 3, players: 4, random: () => 0 }),
    /almeno 3 carte a testa/
  );
}

testComputeInitialDealOvercrowded();
testOvercrowdedSetupDeal();
testClassicDealWhenGNotGreaterThanN();
testIsPlayableSetupBounds();
testMaxPlayersForSize();
testRecommendedMaxPlayersIsClassicFormat();
testRejectsUnderThreeCardsPerHand();

function testSummarizeParticipationCountsPlacementsPerPlayer() {
  const board = [
    { playerId: 0 },
    { playerId: 0 },
    { playerId: 1 },
    { playerId: 2 }
  ];
  const summary = core.summarizeParticipation(board, 3, 4, 0);
  assert.deepEqual(summary.placementsByPlayer, [2, 1, 1]);
  assert.equal(summary.totalPlacements, 4);
  assert.equal(summary.minPlacementsPerPlayer, 1);
  assert.equal(summary.playersWithZeroPlacements, 0);
  assert.equal(summary.playersWithOnePlacement, 2);
  assert.equal(summary.hasPlayerWithOnePlacement, true);
  assert.equal(summary.everyonePlacedAtLeastTwo, false);
  assert.equal(summary.winnerPlacements, 2);
  assert.equal(summary.winnerPlacedAtLeastHalfHand, true);
}

function testSummarizeParticipationDetectsExcludedPlayer() {
  const board = [{ playerId: 0 }, { playerId: 0 }, { playerId: 0 }];
  const summary = core.summarizeParticipation(board, 4, 3, 0);
  assert.deepEqual(summary.placementsByPlayer, [3, 0, 0, 0]);
  assert.equal(summary.playersWithZeroPlacements, 3);
  assert.equal(summary.hasPlayerWithZeroPlacements, true);
  assert.equal(summary.minPlacementsPerPlayer, 0);
}

testSummarizeParticipationCountsPlacementsPerPlayer();
testSummarizeParticipationDetectsExcludedPlayer();

console.log("core regression tests passed");
