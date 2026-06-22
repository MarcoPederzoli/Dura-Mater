"use strict";

/** Frequenza turni 4/5 carte e Idea in Durissima (veloce). */
const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
const L = Number(process.argv[2]) || 5;
const G = Number(process.argv[3]) || 1;
const N = Number(process.argv[4]) || 800;
const strategy = process.argv[5] || (G === 1 ? "durissima-planner" : (G === L ? "durissima-global-planner" : "durissima-team-planner"));

const random = core.mulberry32(core.hashSeed(`idea-freq:${L}:${G}:${strategy}`));
const base = {
  size: L,
  players: G,
  strategies: Array.from({ length: G }, () => strategy),
  durissimaMater: true,
  randomizeTurnOrder: true
};

let wins = 0;
let ideaOffers = 0;
let four = 0;
let five = 0;
let had4 = 0;
let had5 = 0;
let jollies = 0;

for (let i = 0; i < N; i++) {
  const r = core.simulateGame(deck, { ...base, random });
  if (r.status === "success") wins++;
  ideaOffers += r.ideaOffers || 0;
  four += r.fourCardTurns || 0;
  five += r.fiveCardTurns || 0;
  if (r.hadFourCardTurn) had4++;
  if (r.hadFiveCardTurn) had5++;
}

process.stdout.write(
  `${L}x${G} · ${strategy} · ${N} partite\n` +
  `  win: ${(100 * wins / N).toFixed(2)}%\n` +
  `  partite con turno 4 carte: ${had4} (${(100 * had4 / N).toFixed(2)}%)\n` +
  `  partite con turno 5 carte: ${had5} (${(100 * had5 / N).toFixed(2)}%)\n` +
  `  ideaOffers totali: ${ideaOffers} (${(ideaOffers / N).toFixed(3)}/partita)\n` +
  `  turni-4 cumulati: ${four} (${(four / N).toFixed(3)}/partita)\n` +
  `  turni-5 cumulati: ${five} (${(five / N).toFixed(3)}/partita)\n`
);