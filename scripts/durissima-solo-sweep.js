"use strict";

const { createProgressReporter } = require("./cli-progress");

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const COUNT = Number(process.argv[2]) || 1000;
const L_MIN = Number(process.argv[3]) || 5;
const L_MAX = Number(process.argv[4]) || 8;

const sizes = [];
for (let L = L_MIN; L <= L_MAX; L++) {
  if (core.isPlayableSetup(L, 1)) sizes.push(L);
}

process.stderr.write(
  `\nDurissima solitario: ${sizes.map(L => `${L}x1`).join(", ")} · ${COUNT} partite/ciascuno\n\n`
);

for (let si = 0; si < sizes.length; si++) {
  const L = sizes[si];
  const key = `${L}x1`;
  let ok = 0;
  let stalls = 0;
  let emergSum = 0;
  let afterSum = 0;
  const random = core.mulberry32(core.hashSeed(`solo-sweep:${L}:1`));
  const progress = createProgressReporter({
    label: `${si + 1}/${sizes.length} ${key}`,
    total: COUNT,
    interval: Math.max(25, Math.floor(COUNT / 40))
  });

  progress.tick(0);
  for (let i = 0; i < COUNT; i++) {
    const result = core.simulateGame(deck, {
      size: L,
      players: 1,
      random,
      strategies: ["durissima-planner"],
      durissimaMater: true,
      randomizeTurnOrder: true
    });
    if (result.status === "success") ok++;
    else stalls++;
    emergSum += result.durissimaEmergencyDrawsUsed || 0;
    afterSum += result.durissimaAfterPlayDrawsUsed || 0;
    progress.tick(i + 1);
  }
  progress.done();

  const draw = core.computeInitialDeal(L, 1).drawCount;
  const pct = (100 * ok / COUNT).toFixed(1);
  console.log(
    `${key} (mazzo ${draw}): ok ${ok}/${COUNT} (${pct}%) · stalli ${stalls} · emerg/med ${(emergSum / COUNT).toFixed(2)} · after/med ${(afterSum / COUNT).toFixed(2)}`
  );
}

process.stderr.write("\nSweep solitario completato.\n");