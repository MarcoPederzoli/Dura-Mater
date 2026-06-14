"use strict";

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const C = globalThis.MPCardsCore;
const L = Number(process.argv[2]) || 5;
const seed = process.argv[3] !== undefined ? Number(process.argv[3]) : 5;
const tx = Number.isFinite(Number(process.argv[4])) ? Number(process.argv[4]) : 0;
const ty = Number.isFinite(Number(process.argv[5])) ? Number(process.argv[5]) : 3;

const deck = C.simulationDeck();
const random = C.mulberry32(C.hashSeed(`gn-bot-check:${L}:${seed}`));
const strategies = Array.from({ length: L }, () => "durissima-global-planner");
const state = C.setupGame(deck, {
  size: L,
  players: L,
  random,
  durissimaMater: true,
  durissimaVitaExtraEnabled: false,
  randomizeTurnOrder: true,
  strategies
});

function cellOpts(st) {
  const req = C.placementRequirement(st);
  const codes = [];
  const seen = new Set();
  for (let p = 0; p < st.players; p++) {
    for (const m of C.legalPlacements(st, p, req)) {
      if (m.x !== tx || m.y !== ty) continue;
      if (seen.has(m.card.uid)) continue;
      seen.add(m.card.uid);
      codes.push(m.card.code);
    }
  }
  return { count: codes.length, codes };
}

function hasCell(st) {
  return st.board.some(e => e.x === tx && e.y === ty);
}

let step = 0;
while (state.status === "playing" && step++ < 3000) {
  if (!hasCell(state)) {
    const { count, codes } = cellOpts(state);
    if (count <= 2) {
      process.stdout.write(
        "step " + step + " fill " + state.board.length + " (" + tx + "," + ty + ") opts=" + count + " [" + codes.join(",") + "]\n"
      );
    }
  }
  const before = state.board.length;
  C.botStep(state, strategies, random);
  if (state.board.length > before) {
    const placed = state.board[state.board.length - 1];
    if (placed.x === tx && placed.y === ty) {
      process.stdout.write("FILLED (" + tx + "," + ty + ") with " + placed.card.code + " at step " + step + "\n");
    }
  }
}

process.stdout.write("\nfinal " + state.status + " " + state.board.length + "/" + (L * L) + "\n");
if (!hasCell(state)) {
  const { count, codes } = cellOpts(state);
  process.stdout.write("(" + tx + "," + ty + ") final opts=" + count + " codes=" + codes.join(",") + "\n");
}