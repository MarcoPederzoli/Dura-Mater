"use strict";

require("../mpcards-core.js");
const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();
const COUNT = Number(process.argv[2]) || 200;
const CELLS = [[3, 1], [3, 2], [3, 3]];

function runCell(L, G, strategic) {
  const strategy = G === 1 ? "durissima-planner" : "durissima-team-planner";
  const random = core.mulberry32(core.hashSeed(`vita-ab:${strategic}:${L}:${G}`));
  let wins = 0;
  for (let i = 0; i < COUNT; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: G,
      random,
      strategies: Array.from({ length: G }, () => strategy),
      durissimaMater: true,
      durissimaVitaExtraEnabled: true,
      durissimaStrategicVitaExtra: strategic,
      randomizeTurnOrder: true
    });
    if (result.status === "success") wins++;
  }
  return wins;
}

process.stderr.write(`\nConfronto vita extra · ${COUNT} partite/cella\n\n`);
for (const [L, G] of CELLS) {
  const key = `${L}x${G}`;
  const reactive = runCell(L, G, false);
  const strategic = runCell(L, G, true);
  console.log(
    `${key}: reattivo ${(100 * reactive / COUNT).toFixed(1)}% (${reactive}/${COUNT})` +
    ` · strategico ${(100 * strategic / COUNT).toFixed(1)}% (${strategic}/${COUNT})`
  );
}