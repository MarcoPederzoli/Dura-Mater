"use strict";

const path = require("node:path");
const fs = require("node:fs");
const corePath = path.join(__dirname, "..", "mpcards-core.js");
let src = fs.readFileSync(corePath, "utf8");
const probes = [
  ["fragile", "const fragileReserved = gnTryFragileReservedMove(state, playerId);"],
  ["preserve", "const preserveSetup = gnTryPreserveReservedSetupMove(state, playerId);"],
  ["relay", "const relayAction = gnTryRelayOrEndgameAction(state, playerId);"],
  ["sole", "const soleFillerMove = gnTrySoleEdgeFillerMove(state, playerId);"],
  ["forced", "const forced = gnTryForcedMove(state, playerId);"],
  ["singleton", "const singletonDelegate = gnTryClosingEdgeSingletonDelegateMove(state, playerId);"],
  ["edgeTight", "const edgeTightMove = gnTryClosingEdgeTightMove(state, playerId);"],
  ["narrow", "const narrowMove = gnTryNarrowBoundaryMove(state, playerId);"],
  ["endgame", "const endgameRetry = gnTryEndgameSolverAction(state);"],
  ["shallowCrit", "const shallowCritical = solveGnShallowBestAction(state);"],
  ["solver", "const solverAction = solveGnBestAction(state);"],
  ["heuristic", "const move = chooseDurissimaGlobalBestHeuristicMove(state, playerId);"]
];
for (const [label, line] of probes) {
  if (line.includes("const ")) {
    const varName = line.split(" ")[1];
    src = src.replace(
      line,
      line + " if (" + varName + " && state._gnTrace) state._gnTrace.push(\"" + label + ":\"+("
        + (varName + ".move ? " + varName + ".move.card.code+\"@(\"+" + varName + ".move.x+\",\"+" + varName + ".move.y+\")\" : " + varName + ".type)")
        + ");"
    );
  }
}
src = src.replace(
  "function chooseDurissimaGlobalAction(state, playerId, random) {",
  "function chooseDurissimaGlobalAction(state, playerId, random) { state._gnTrace = [];"
);
eval(src);

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 6;
const seed = Number(process.argv[3]) || 0;
const beforeStep = Number(process.argv[4]) || 37;

const deck = C.simulationDeck();
const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
const strategies = Array.from({ length: L }, () => "durissima-global-planner");
const state = C.setupGame(deck, {
  size: L, players: L, random,
  durissimaMater: true, durissimaVitaExtraEnabled: false,
  randomizeTurnOrder: true, strategies
});

let step = 0;
while (state.status === "playing" && step < beforeStep - 1) {
  step++;
  C.botStep(state, strategies, random);
}

const pid = state.currentPlayer;
const action = C.chooseAction(state, pid, "durissima-global-planner", random);
process.stdout.write("trace=" + (state._gnTrace || []).join(" | ") + "\n");
process.stdout.write(
  "action=" + (action.type === "move"
    ? action.move.card.code + "@(" + action.move.x + "," + action.move.y + ")"
    : action.type) + "\n"
);