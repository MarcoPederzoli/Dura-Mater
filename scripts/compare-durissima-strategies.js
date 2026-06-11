"use strict";

const { createProgressReporter } = require("./cli-progress");

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck().filter(card => Number(card.value) <= 5);
const N = Number(process.argv[2]) || 100;

const FORMATS = [[3, 1], [4, 1], [5, 1], [3, 3]];

function run(size, players, strategy, formatIndex, strategyIndex) {
  const label = `${formatIndex + 1}/${FORMATS.length} ${size}x${players} · ${strategy}`;
  const progress = createProgressReporter({
    label,
    total: N,
    interval: Math.max(1, Math.floor(N / 10))
  });
  let ok = 0;

  progress.tick(0);
  for (let i = 0; i < N; i++) {
    const res = core.simulateGame(deck, {
      size,
      players,
      random: core.mulberry32(90000 + size * 1000 + players * 100 + i),
      strategies: Array.from({ length: players }, () => strategy),
      durissimaMater: true
    });
    if (res.status === "success") ok++;
    progress.tick(i + 1);
  }
  progress.done();
  return ok;
}

process.stderr.write(
  `\nConfronto strategie Durissima: ${FORMATS.length} formati  x  2 strategie  x  ${N} partite\n\n`
);

for (let fi = 0; fi < FORMATS.length; fi++) {
  const [size, players] = FORMATS[fi];
  const g = run(size, players, "durissima-planner", fi, 0);
  const p = run(size, players, "planner", fi, 1);
  console.log(`${size}x${players}: G ${g}/${N} (${(100 * g / N).toFixed(1)}%)  P ${p}/${N} (${(100 * p / N).toFixed(1)}%)`);
}

process.stderr.write("\nConfronto completato.\n");