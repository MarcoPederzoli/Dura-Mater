"use strict";

const path = require("node:path");
const fs = require("node:fs");
const corePath = path.join(__dirname, "..", "mpcards-core.js");
let src = fs.readFileSync(corePath, "utf8");
src = src.replace(
  "globalThis.MPCardsCore = {",
  "globalThis._midRepick = gnRepick7x7MidgameCandidatesRollout; globalThis.MPCardsCore = {"
);
eval(src);

const midRepick = globalThis._midRepick;
const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 7;
const seed = Number(process.argv[3]) ?? 0;
const beforeStep = Number(process.argv[4]) || 45;

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
const patchAction = C.gnTryPatchGuidedAction(state, pid);
const pick = patchAction && patchAction.type === "move" ? patchAction.move : null;
process.stdout.write(
  "gnTryPatchGuidedAction: "
    + (pick ? pick.card.code + "@(" + pick.x + "," + pick.y + ")" : (patchAction && patchAction.type) || "null") + "\n"
);

if (pick) {
  const repick = midRepick(state, pid, pick);
  process.stdout.write(
    "midRepick: " + repick.card.code + "@(" + repick.x + "," + repick.y + ")\n"
  );
}