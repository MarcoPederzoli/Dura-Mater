"use strict";

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 7;
const seed = Number(process.argv[3]) ?? 1;
const beforeStep = Number(process.argv[4]) || 60;

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
const req = C.placementRequirement(state);
const moves = C.legalPlacements(state, pid, req);
const safe = moves.filter(m => !C.gnMoveBreaksIdealFillPlan(state, pid, m));

process.stdout.write(
  "step=" + beforeStep + " P" + pid + " tp=" + state.turnPlayed
    + " req=" + req + " fill=" + state.board.length
    + " legal=" + moves.length + " safe=" + safe.length + "\n"
);

for (const m of safe) {
  process.stdout.write("  safe: " + m.card.code + "@(" + m.x + "," + m.y + ")\n");
}

const reservations = C.gnCardReservations(state);
const held = [];
for (const [uid, cell] of reservations) {
  if ((state.hands[pid] || []).some(c => c.uid === uid)) held.push(uid + "@(" + cell.x + "," + cell.y + ")");
}
process.stdout.write("  heldRes=" + (held.join(" ") || "none") + "\n");
for (const m of safe) {
  const res = reservations.get(m.card.uid);
  const misuse = res && (m.x !== res.x || m.y !== res.y);
  process.stdout.write("  misuse " + m.card.code + "@(" + m.x + "," + m.y + ")=" + !!misuse + "\n");
}
process.stdout.write("  patchFirst=" + C.gnUsePatchFirstStrategy(state) + "\n");
process.stdout.write("  critical=" + C.gnIsCriticalPosition(state) + "\n");

const action = C.chooseAction(state, pid, "durissima-global-planner", random);
process.stdout.write(
  "chooseAction: " + (action.type === "move"
    ? action.move.card.code + "@(" + action.move.x + "," + action.move.y + ")"
    : action.type) + "\n"
);