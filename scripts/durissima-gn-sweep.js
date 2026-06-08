"use strict";

const { createProgressReporter } = require("./cli-progress");

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const COUNT = Number(process.argv[2]) || 1000;
const L_MIN = Number(process.argv[3]) || 3;
const L_MAX = Number(process.argv[4]) || 8;

const sizes = [];
for (let L = L_MIN; L <= L_MAX; L++) {
  if (core.isPlayableSetup(L, L)) sizes.push(L);
}

process.stderr.write(
  `\nDurissima G=N: ${sizes.map(L => `${L}x${L}`).join(", ")} · ${COUNT} partite/ciascuno\n\n`
);

for (let si = 0; si < sizes.length; si++) {
  const L = sizes[si];
  const G = L;
  const key = `${L}x${G}`;
  let ok = 0;
  let stalls = 0;
  const random = core.mulberry32(core.hashSeed(`gn-sweep:${L}:${G}`));
  const progress = createProgressReporter({
    label: `${si + 1}/${sizes.length} ${key}`,
    total: COUNT,
    interval: Math.max(25, Math.floor(COUNT / 40))
  });

  progress.tick(0);
  for (let i = 0; i < COUNT; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: G,
      random,
      strategies: Array.from({ length: G }, () => "durissima-planner"),
      durissimaMater: true,
      randomizeTurnOrder: true
    });
    if (result.status === "success") ok++;
    else stalls++;
    progress.tick(i + 1);
  }
  progress.done();

  const draw = core.computeInitialDeal(L, G).drawCount;
  const pct = (100 * ok / COUNT).toFixed(1);
  console.log(`${key} (mazzo ${draw}): ok ${ok}/${COUNT} (${pct}%) · stalli ${stalls}`);
}

process.stderr.write("\nSweep G=N completato.\n");