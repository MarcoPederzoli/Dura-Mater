"use strict";

const path = require("node:path");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const COUNT = Number(process.argv[2]) || 1000;
const STRATEGY = process.argv[3] || "planner";

function runCell(L, drawOnlyAfterPlacement) {
  const random = core.mulberry32(
    core.hashSeed(`dura-solo-pesca:${L}:${drawOnlyAfterPlacement ? "after" : "norm"}`)
  );
  let wins = 0;
  let stalls = 0;
  let turnSum = 0;
  let placedSum = 0;

  for (let i = 0; i < COUNT; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: 1,
      random,
      strategies: [STRATEGY],
      durissimaMater: false,
      drawOnlyAfterPlacement,
      randomizeTurnOrder: true
    });
    if (result.status === "success") wins++;
    else stalls++;
    turnSum += result.turns || 0;
    placedSum += result.totalPlacements || 0;
  }

  return {
    wins,
    stalls,
    winPct: (100 * wins) / COUNT,
    avgTurns: turnSum / COUNT,
    avgPlaced: placedSum / COUNT
  };
}

process.stderr.write(
  `\nDura solitario — pesca (${STRATEGY}, ${COUNT} partite/cella)\n` +
    "  normale = pesca anche su pass (competitiva)\n" +
    "  dopo    = pesca solo dopo posata (regola Durissima)\n\n"
);

console.log("Lx1   normale%   dopo%   delta   normTurns  dopoTurns  normPlaced  dopoPlaced");
for (let L = 3; L <= 8; L++) {
  const norm = runCell(L, false);
  const after = runCell(L, true);
  const delta = after.winPct - norm.winPct;
  console.log(
    `${L}x1  ${norm.winPct.toFixed(1).padStart(7)}  ${after.winPct.toFixed(1).padStart(6)}  ` +
      `${(delta >= 0 ? "+" : "") + delta.toFixed(1).padStart(5)}  ` +
      `${norm.avgTurns.toFixed(1).padStart(8)}  ${after.avgTurns.toFixed(1).padStart(8)}  ` +
      `${norm.avgPlaced.toFixed(1).padStart(9)}  ${after.avgPlaced.toFixed(1).padStart(9)}`
  );
}

process.stderr.write("\nProbe completato.\n");