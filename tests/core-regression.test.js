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

function testDurissimaHandCapPassDrawsWhenBelowCap() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 2,
    random: () => 0,
    durissimaMater: true,
    durissimaHandDrawCap: true,
    durissimaVitaExtraEnabled: false
  });
  assert.equal(core.durissimaUsesCompetitiveDraw(state), true);
  assert.ok(state.drawPile.length > 0);
  const pid = state.currentPlayer;
  state.hands[pid].pop();
  const handBefore = state.hands[pid].length;
  assert.ok(handBefore < state.initialHandSize);
  core.passTurn(state);
  assert.equal(state.hands[pid].length, handBefore + 1);
}

function testDurissimaHandCapBlocksDrawAtCap() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, {
    size: 5,
    players: 3,
    random: () => 0,
    durissimaMater: true,
    durissimaHandDrawCap: true,
    durissimaVitaExtraEnabled: false
  });
  const pid = state.currentPlayer;
  state.hands[pid] = state.hands[pid].slice(0, state.initialHandSize);
  const pileBefore = state.drawPile.length;
  core.passTurn(state);
  assert.equal(state.hands[pid].length, state.initialHandSize);
  assert.equal(state.drawPile.length, pileBefore);
}

function testDurissimaHandCap2NUsesGridSize() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 2,
    random: () => 0,
    durissimaMater: true,
    durissimaHandDrawCap: true,
    durissimaHandDrawCapFactor: 2,
    durissimaVitaExtraEnabled: false
  });
  assert.equal(core.durissimaHandDrawCapLimit(state), 6);
  const pid = state.currentPlayer;
  while (state.hands[pid].length < 6 && state.drawPile.length > 0) {
    core.drawForPlayer(state, pid);
  }
  assert.equal(state.hands[pid].length, 6);
  const pileBefore = state.drawPile.length;
  core.drawForPlayer(state, pid);
  assert.equal(state.hands[pid].length, 6);
  assert.equal(state.drawPile.length, pileBefore);
}

function testDurissimaFreeDrawCoopPassDrawsWithNReshuffle() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 2,
    random: () => 0,
    durissimaMater: true,
    durissimaCompetitiveDraw: true
  });
  assert.equal(core.durissimaUsesCompetitiveDraw(state), true);
  assert.equal(state.durissimaHandDrawCap, false);
  assert.equal(state.durissimaVitaExtraEnabled, true);
  assert.equal(state.durissimaVitaExtraPool, 3);
  const pid = state.currentPlayer;
  state.hands[pid].pop();
  const handBefore = state.hands[pid].length;
  core.passTurn(state);
  assert.equal(state.hands[pid].length, handBefore + 1);
}

testDurissimaHandCapPassDrawsWhenBelowCap();
testDurissimaHandCapBlocksDrawAtCap();
testDurissimaHandCap2NUsesGridSize();
function testDurissimaFreeDrawBotPassesWhenMonteSafe() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 2,
    random: () => 0,
    durissimaMater: true,
    durissimaCompetitiveDraw: true
  });
  const requirement = core.placementRequirement(state);
  assert.ok(core.legalPlacements(state, state.currentPlayer, requirement).length > 0);
  assert.equal(state.consecutivePasses, 0);
  const random = core.mulberry32(42);
  const result = core.botStep(state, ["durissima-team-planner", "durissima-team-planner"], random);
  assert.equal(result.passed, true);
  assert.equal(state.consecutivePasses, 1);
}

function testDurissimaFreeDrawBotPlacesWhenMonteThreat() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 2,
    random: () => 0,
    durissimaMater: true,
    durissimaCompetitiveDraw: true
  });
  state.consecutivePasses = 1;
  const random = core.mulberry32(42);
  const result = core.botStep(state, ["durissima-team-planner", "durissima-team-planner"], random);
  assert.equal(result.played, true);
  assert.equal(state.consecutivePasses, 0);
}

testDurissimaFreeDrawCoopPassDrawsWithNReshuffle();
testDurissimaFreeDrawBotPassesWhenMonteSafe();
testDurissimaFreeDrawBotPlacesWhenMonteThreat();

function testDurissimaNReshuffleDefaultWithPool() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, { size: 5, players: 3, random: () => 0, durissimaMater: true });
  assert.equal(state.durissimaReserve.length, 0);
  assert.equal(state.durissimaEmergencyDrawsLeft, 0);
  assert.equal(state.durissimaVitaExtraPool, 5);
  assert.equal(core.durissimaVitaExtraPoolLeft(state), 5);
  assert.equal(state.durissimaVitaExtraEnabled, true);
}

function testDurissimaCorePureOptOutDisablesNReshuffle() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, {
    size: 5,
    players: 3,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  assert.equal(state.durissimaVitaExtraPool, 0);
  assert.equal(state.durissimaVitaExtraEnabled, false);
}

function testDurissimaSelectiveReshuffleKeepsCardsAndRefills() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 4);
  const state = core.setupGame(deck, {
    size: 4,
    players: 1,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: true,
    durissimaVitaExtraBudget: 1
  });
  const keepUid = state.hands[0][0].uid;
  const keepCode = state.hands[0][0].code;
  assert.equal(
    core.tryDurissimaVitaExtra(state, 0, core.mulberry32(99), { keepUids: [keepUid] }),
    true
  );
  assert.equal(state.hands[0].length, 4);
  assert.equal(state.hands[0].some(card => card.uid === keepUid), true);
  assert.equal(state.hands[0].some(card => card.code === keepCode), true);
  assert.equal(state.durissimaVitaExtraPool, 0);
}

function testDurissimaSelectiveReshuffleRequiresAtLeastOneChange() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 1,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: true
  });
  const allUids = state.hands[0].map(card => card.uid);
  assert.equal(core.tryDurissimaVitaExtra(state, 0, core.mulberry32(1), { keepUids: allUids }), false);
  assert.equal(state.durissimaVitaExtraPool, 3);
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

function testDurissimaPlannerReshufflesWhenOnlyBlockingMoves() {
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
  const random = core.mulberry32(7);
  const result = core.botStep(state, ["durissima-planner"], random);
  assert.ok(
    state.durissimaVitaExtraUsed[0] > 0 || result.played,
    "il planner reshuffle a inizio turno o posa una mossa non bloccante"
  );
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
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
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

function testDurissimaGnIdealDetectsPoolDeal() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 3,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  assert.equal(core.isDurissimaGnIdeal(state), true);
  assert.equal(state.initialDrawCount, 0);
}

function testDurissimaGlobalPlannerPlaysLegalGnMove() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const state = core.setupGame(deck, {
    size: 3,
    players: 3,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  const strategies = ["durissima-global-planner", "durissima-global-planner", "durissima-global-planner"];
  const result = core.botStep(state, strategies, core.mulberry32(1));
  assert.equal(result.played, true);
}

function testDurissimaGlobalPlannerSolvesGn3x3() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 3);
  const random = core.mulberry32(42);
  const result = core.simulateGame(deck, {
    size: 3,
    players: 3,
    random,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true,
    strategies: ["durissima-global-planner", "durissima-global-planner", "durissima-global-planner"]
  });
  assert.equal(result.status, "success");
}

function testDurissimaGlobalPlannerPlaysLegalGn5x5() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, {
    size: 5,
    players: 5,
    random: core.mulberry32(1),
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true
  });
  assert.equal(core.isDurissimaGnIdeal(state), true);
  const strategies = Array.from({ length: 5 }, () => "durissima-global-planner");
  const result = core.botStep(state, strategies, core.mulberry32(1));
  assert.equal(result.played, true);
}

function testDurissimaGlobalPlannerSearchBudgetTiers() {
  assert.equal(core.gnPerMoveNodesForSize(3), 15000);
  assert.equal(core.gnPerMoveNodesForSize(4), 20000);
  assert.equal(core.gnMaxNodesForSize(4), 200000);
  assert.equal(core.gnPerMoveNodesForSize(5), 35000);
  assert.equal(core.gnMaxNodesForSize(5), 500000);
  assert.equal(core.gnShallowMaxDepth(5), 8);
  assert.equal(core.gnShallowNodesPerMove(5), 6000);
}

function testGnTieredSearchOnlyAboveL5() {
  assert.equal(core.gnCriticalEmptyThreshold(5), 10);
  assert.equal(core.gnCriticalEmptyThreshold(8), 26);
  const deck5 = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state5 = core.setupGame(deck5, {
    size: 5,
    players: 5,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  assert.equal(core.gnIsCriticalPosition(state5), true);
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 8);
  const state = core.setupGame(deck, {
    size: 8,
    players: 8,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  assert.equal(core.gnIsCriticalPosition(state), false);
  while (state.board.length < 42) {
    state.board.push({
      x: state.board.length % 8,
      y: Math.floor(state.board.length / 8),
      playerId: 0,
      card: deck[state.board.length]
    });
  }
  assert.equal(core.gnIsCriticalPosition(state), true);
}

function testGnIdealFillMatchingRejectsDeadLastCell() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, {
    size: 5,
    players: 5,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  const byCode = code => deck.find(c => c.code === code);
  const place = (x, y, card) => state.board.push({ x, y, playerId: 0, card });
  const c587 = byCode(587);
  const c456 = byCode(456);
  const c238 = byCode(238);
  const c227 = byCode(227);
  const c118 = byCode(118);
  place(3, 2, c587);
  place(2, 3, c456);
  place(4, 3, c238);
  place(3, 4, c227);
  state.hands = [[], [], [], [c118], []];
  assert.equal(core.gnIdealFillMatchingPossible(state), false);
}

function testGnPruneReservedCardMisuse() {
  const deck = core.simulationDeck();
  const byCode = code => deck.find(c => c.code == code);
  const state = core.setupGame(deck, {
    size: 5,
    players: 5,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  const placements = [
    [0, 0, "554"], [1, 0, "588"], [2, 0, "577"], [1, 1, "548"], [2, 1, "478"], [0, 1, "564"],
    [1, 2, "586"], [2, 2, "486"], [0, 2, "575"], [3, 2, "587"], [3, 1, "467"], [3, 0, "247"],
    [4, 1, "445"]
  ];
  for (const [x, y, code] of placements) {
    state.board.push({ x, y, playerId: 0, card: byCode(code) });
  }
  state.hands = [
    [byCode(428), byCode(238)],
    [byCode(336), byCode(456), byCode(367)],
    [byCode(227), byCode(437), byCode(538)],
    [byCode(348), byCode(118)],
    [byCode(328), byCode(356)]
  ];
  state.drawPile = [];
  const reserved = byCode(538);
  const reservations = core.gnCardReservations(state);
  assert.ok(reservations.has(reserved.uid));
  assert.equal(reservations.get(reserved.uid).x, 0);
  assert.equal(reservations.get(reserved.uid).y, 3);
  const misuse = [
    { card: reserved, cardUid: reserved.uid, x: 0, y: 1 },
    { card: reserved, cardUid: reserved.uid, x: 0, y: 3 }
  ];
  const pruned = core.gnPruneReservedCardMisuse(state, misuse);
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].x, 0);
  assert.equal(pruned[0].y, 3);
}

function testGn5x5PatchPhasesAdvance() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
  const state = core.setupGame(deck, {
    size: 5,
    players: 5,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  const corner3 = core.gnSelectBestPatchGoal(state);
  assert.equal(corner3.w, 3);
  assert.equal(corner3.ox, 0);
  let i = 0;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      state.board.push({ x, y, playerId: 0, card: deck[i++] });
    }
  }
  const second = core.gnSelectBestPatchGoal(state);
  assert.ok(second.w === 3 || second.w === 4);
  for (let y = second.oy; y < second.oy + 3; y++) {
    for (let x = second.ox; x < second.ox + 3; x++) {
      if (x < 3 && y < 3) continue;
      state.board.push({ x, y, playerId: 0, card: deck[i++] });
    }
  }
  while (state.board.length < 20) {
    state.board.push({
      x: state.board.length % 5,
      y: Math.floor(state.board.length / 5),
      playerId: 0,
      card: deck[i++]
    });
  }
  assert.equal(core.gnSelectBestPatchGoal(state), null);
}

function testGn7x7PatchCornerOrder() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 7);
  const state = core.setupGame(deck, {
    size: 7,
    players: 7,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  const center = core.gn7x7Center3();
  const first = core.gnSelectBestPatchGoal(state);
  assert.equal(first.w, 3);
  assert.equal(first.ox, center.ox);
  assert.equal(first.oy, center.oy);
  let i = 0;
  for (let y = center.oy; y < center.oy + 3; y++) {
    for (let x = center.ox; x < center.ox + 3; x++) {
      state.board.push({ x, y, playerId: 0, card: deck[i++] });
    }
  }
  for (const rect of core.gn7x7PatchPhaseOrder().slice(1)) {
    const goal = core.gnSelectBestPatchGoal(state);
    assert.equal(goal.w, 3);
    assert.equal(goal.ox, rect.ox);
    assert.equal(goal.oy, rect.oy);
    for (let y = rect.oy; y < rect.oy + 3; y++) {
      for (let x = rect.ox; x < rect.ox + 3; x++) {
        if (state.board.some(e => e.x === x && e.y === y)) continue;
        state.board.push({ x, y, playerId: 0, card: deck[i++] });
      }
    }
  }
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      if (state.board.some(e => e.x === x && e.y === y)) continue;
      state.board.push({ x, y, playerId: 0, card: deck[i++] });
    }
  }
  assert.ok(core.gn7x7PatchPlanComplete(state));
  assert.equal(core.gnSelectBestPatchGoal(state), null);
}

function testGn8x8PatchQuadOrder() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 8);
  const state = core.setupGame(deck, {
    size: 8,
    players: 8,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  const first = core.gnSelectBestPatchGoal(state);
  assert.equal(first.w, 4);
  assert.equal(first.ox, 0);
  assert.equal(first.oy, 0);
  let i = 0;
  for (const rect of core.gn8x8Quad4Order()) {
    const goal = core.gnSelectBestPatchGoal(state);
    assert.equal(goal.w, 4);
    assert.equal(goal.ox, rect.ox);
    assert.equal(goal.oy, rect.oy);
    for (let y = rect.oy; y < rect.oy + 4; y++) {
      for (let x = rect.ox; x < rect.ox + 4; x++) {
        if (state.board.some(e => e.x === x && e.y === y)) continue;
        state.board.push({ x, y, playerId: 0, card: deck[i++] });
      }
    }
  }
  assert.ok(core.gn8x8PatchPlanComplete(state));
  assert.equal(core.gnSelectBestPatchGoal(state), null);
}

function testGnPatchGoalOnLargeBoard() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 8);
  const state = core.setupGame(deck, {
    size: 8,
    players: 8,
    random: () => 0,
    durissimaMater: true,
    durissimaVitaExtraEnabled: false
  });
  state.board.push({ x: 0, y: 0, playerId: 0, card: deck[0] });
  state.board.push({ x: 1, y: 0, playerId: 1, card: deck[1] });
  const patch = core.gnSelectBestPatchGoal(state);
  assert.ok(patch);
  assert.ok(patch.w === 3 || patch.w === 4);
  assert.ok(patch.ox <= 1 && patch.oy === 0);
}

function testGnPatchGuidedMoveStaysInPatch() {
  const deck = core.simulationDeck().filter(card => Number(card.value) <= 8);
  const state = core.setupGame(deck, {
    size: 8,
    players: 8,
    random: core.mulberry32(12),
    durissimaMater: true,
    durissimaVitaExtraEnabled: false,
    randomizeTurnOrder: true
  });
  state.board.push({ x: 2, y: 2, playerId: 0, card: deck[0] });
  state.board.push({ x: 3, y: 2, playerId: 1, card: deck[1] });
  state._gnPlannerPatchGoal = { ox: 2, oy: 2, w: 3, h: 3 };
  const strategies = Array.from({ length: 8 }, () => "durissima-global-planner");
  const result = core.botStep(state, strategies, core.mulberry32(12));
  assert.equal(result.played, true);
  const last = state.board[state.board.length - 1];
  assert.ok(last.x >= 2 && last.x <= 4 && last.y >= 2 && last.y <= 4);
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

testDurissimaNReshuffleDefaultWithPool();
testDurissimaCorePureOptOutDisablesNReshuffle();
testDurissimaSelectiveReshuffleKeepsCardsAndRefills();
testDurissimaSelectiveReshuffleRequiresAtLeastOneChange();
testDurissimaVitaExtraReshufflesAndRefillsHand();
testDurissimaVitaExtraPoolChainsUntilPlayableOrEmpty();
testDurissimaMultiPassAfterVitaGoesToNextPlayer();
testDurissimaPlannerReshufflesWhenOnlyBlockingMoves();
testDurissimaSoloAutoVitaExtraOnStuckWhenOptIn();
testDurissimaSoloStuckWithoutMovesIsLoss();
testDurissimaTeamPlannerPlaysInCoop();
testDurissimaGnIdealDetectsPoolDeal();
testDurissimaGlobalPlannerPlaysLegalGnMove();
testDurissimaGlobalPlannerSolvesGn3x3();
testDurissimaGlobalPlannerPlaysLegalGn5x5();
testDurissimaGlobalPlannerSearchBudgetTiers();
testGnTieredSearchOnlyAboveL5();
testGnIdealFillMatchingRejectsDeadLastCell();
testGnPruneReservedCardMisuse();
testGn5x5PatchPhasesAdvance();
testGn7x7PatchCornerOrder();
testGn8x8PatchQuadOrder();
testGnPatchGoalOnLargeBoard();
testGnPatchGuidedMoveStaysInPatch();
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
  assert.equal(core.recommendedMinPlayers(3), 2);
  assert.equal(core.recommendedMinPlayers(4), 2);
  assert.equal(core.recommendedMinPlayers(5), 3);
  assert.equal(core.recommendedMinPlayers(6), 3);
  assert.equal(core.recommendedMinPlayers(7), 3);
  assert.equal(core.recommendedMinPlayers(8), 4);
  assert.equal(core.isRecommendedSetup(5, 5), true);
  assert.equal(core.isRecommendedSetup(5, 3), true);
  assert.equal(core.isRecommendedSetup(5, 2), false);
  assert.equal(core.isRecommendedSetup(7, 3), true);
  assert.equal(core.isRecommendedSetup(7, 4), true);
  assert.equal(core.isRecommendedSetup(7, 2), false);
  assert.equal(core.durissimaMinPlayers(), 1);
  assert.equal(core.isDurissimaSweepSetup(5, 1), true);
  assert.equal(core.isDurissimaSweepSetup(5, 2), true);
  assert.equal(core.isDefaultSweepSetup(5, 2), false);
  assert.equal(core.isDefaultSweepSetup(5, 3), true);
  assert.equal(core.isDefaultSweepSetup(7, 3), true);
  assert.equal(core.isDefaultSweepSetup(5, 8), true);
  assert.equal(core.isPlayableSetup(5, 2), true);
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

function testTournamentTurnOrderRotatesStarter() {
  assert.deepEqual(core.tournamentTurnOrder(4, 0), [0, 1, 2, 3]);
  assert.deepEqual(core.tournamentTurnOrder(4, 1), [1, 2, 3, 0]);
  assert.deepEqual(core.tournamentTurnOrder(4, 3), [3, 0, 1, 2]);
}

function testTournamentMontePenalties() {
  const random = gameState.createRandom("tournament-monte");
  const state = core.setupGame(deck, { size: 3, players: 2, random, tournamentMode: true });
  state.hands[0] = [card("118"), card("227")];
  state.hands[1] = [];
  state.drawPile = [card("238"), card("247"), card("328")];
  state.tournamentExited[1] = true;
  core.tournamentApplyMontePenalties(state);
  assert.equal(state.tournamentScores[0], -2);
  assert.equal(state.tournamentScores[1], 0);
}

function testTournamentFinishAwardsDescendingPoints() {
  const random = gameState.createRandom("tournament-finish");
  const state = core.setupGame(deck, { size: 5, players: 4, random, tournamentMode: true });
  state.tournamentExited = [false, false, false, false];
  state.tournamentScores = [0, 0, 0, 0];
  state.tournamentHandScores = [0, 0, 0, 0];
  state.hands[0] = [];
  core.tournamentMarkFinished(state, 0);
  assert.equal(state.tournamentScores[0], 4);
  state.hands[1] = [];
  core.tournamentMarkFinished(state, 1);
  assert.equal(state.tournamentScores[1], 3);
  state.hands[2] = [];
  core.tournamentMarkFinished(state, 2);
  assert.equal(state.tournamentScores[2], 2);
  state.hands[3] = [];
  core.tournamentMarkFinished(state, 3);
  assert.equal(state.tournamentScores[3], 1);
  assert.equal(state.status, "hand_over");
}

function testSimulateTournamentCompletes() {
  const random = core.mulberry32(core.hashSeed("tournament-sim"));
  const result = core.simulateTournament(deck, {
    size: 3,
    players: 2,
    strategies: ["planner", "planner"],
    random
  });
  assert.equal(result.tournamentMode, true);
  assert.equal(result.tournamentHandsPlayed, 2);
  assert.equal(result.tournamentComplete, true);
  assert.equal(result.status, "tournament_complete");
  assert.equal(result.tournamentScores.length, 2);
}

testTournamentTurnOrderRotatesStarter();
testTournamentMontePenalties();
testTournamentFinishAwardsDescendingPoints();
testSimulateTournamentCompletes();

console.log("core regression tests passed");
