"use strict";

const { createProgressReporter } = require("./cli-progress");

require("../mpcards-core.js");

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

const COUNT = Number(process.argv[2]) || 1000;
const cellArgs = process.argv.slice(3);

if (!cellArgs.length) {
  process.stderr.write("Uso: node scripts/durissima-coop-sweep.js <partite> <LxG> [LxG ...]\n");
  process.stderr.write("Es.: node scripts/durissima-coop-sweep.js 1000 3x2 4x2 4x3 5x2 5x3 5x4\n");
  process.exit(1);
}

const cells = [];
for (const spec of cellArgs) {
  const m = String(spec).match(/^(\d+)x(\d+)$/);
  if (!m) {
    process.stderr.write(`Cella non valida: ${spec} (atteso LxG, es. 5x3)\n`);
    process.exit(1);
  }
  const L = Number(m[1]);
  const G = Number(m[2]);
  if (!core.isPlayableSetup(L, G)) {
    process.stderr.write(`Configurazione non ammessa: ${spec}\n`);
    process.exit(1);
  }
  cells.push([L, G]);
}

process.stderr.write(
  `\nDurissima cooperativo: ${cells.map(([L, G]) => `${L}x${G}`).join(", ")} · ${COUNT} partite/ciascuno\n\n`
);

for (let si = 0; si < cells.length; si++) {
  const [L, G] = cells[si];
  const key = `${L}x${G}`;
  let ok = 0;
  let stalls = 0;
  const random = core.mulberry32(core.hashSeed(`coop-sweep:${L}:${G}`));
  const progress = createProgressReporter({
    label: `${si + 1}/${cells.length} ${key}`,
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

process.stderr.write("\nSweep cooperativo completato.\n");