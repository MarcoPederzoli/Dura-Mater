"use strict";

/**
 * Verifica rapida bot G=N (global-planner): win% e tempo per formato.
 * Uso: node scripts/durissima-gn-bot-check.js [L ...] [deal]
 * Esempio: node scripts/durissima-gn-bot-check.js 3 4 5      (formati 3,4,5 · 5 deal)
 *          node scripts/durissima-gn-bot-check.js 5 8          (solo 5x5 · 8 deal)
 *          node scripts/durissima-gn-bot-check.js 3 4 5 10   (formati 3,4,5 · 10 deal)
 * Default: 1 worker, un solo probe pesante alla volta (lock). Piu worker: --workers N
 */

const path = require("node:path");
const {
  defaultHeavyCliWorkers,
  acquireHeavyProbeLock,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./cpu-workers");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const argvRaw = process.argv.slice(2);
acquireHeavyProbeLock("durissima-gn-bot-check", argvRaw);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, defaultHeavyCliWorkers());

const nums = argv.filter(a => /^\d+$/.test(a)).map(Number);
let sizes = [];
let deals = 5;
if (nums.length === 0) {
  sizes = [3, 4, 5];
} else if (nums.length === 1) {
  sizes = [nums[0]];
} else if (nums.length === 2) {
  sizes = [nums[0]];
  deals = nums[1];
} else {
  const last = nums[nums.length - 1];
  if (last > 8) {
    deals = last;
    sizes = nums.slice(0, -1);
  } else {
    sizes = nums;
  }
}

sizes = sizes.filter(L => L >= 3 && L <= 8);
if (!sizes.length) {
  process.stderr.write("Specificare almeno un L tra 3 e 8.\n");
  process.exit(1);
}

async function main() {
  const tasks = [];
  for (const L of sizes) {
    for (let seed = 0; seed < deals; seed++) {
      tasks.push({ L, seed });
    }
  }

  process.stderr.write(
    `\nDurissima G=N bot-check · ${sizes.join(", ")} · ${deals} deal/formato · worker=${WORKERS}/${logicalCpuCount()}\n` +
      "Bot: durissima-global-planner · regole: core G=N (no tallone, no reshuffle)\n\n"
  );

  const started = Date.now();
  const rows = await runWorkerPool(
    path.join(__dirname, "durissima-gn-bot-check-worker.js"),
    tasks,
    { workers: WORKERS }
  );

  const bySize = new Map();
  for (const row of rows) {
    if (!bySize.has(row.L)) bySize.set(row.L, { wins: 0, done: 0, ms: 0, nodes: 0 });
    const b = bySize.get(row.L);
    b.done++;
    b.ms += row.ms || 0;
    b.nodes += row.nodes || 0;
    if (row.status === "success") b.wins++;
  }

  console.log("\n--- Bot G=N (global-planner) ---\n");
  console.log("L".padEnd(4) + "win%".padEnd(8) + "deal".padEnd(8) + "ms/deal".padEnd(10) + "nodi/deal");
  console.log("-".repeat(42));
  for (const L of sizes.sort((a, b) => a - b)) {
    const b = bySize.get(L);
    if (!b) continue;
    const winPct = (100 * b.wins / b.done).toFixed(0);
    const msDeal = (b.ms / b.done).toFixed(0);
    const nodesDeal = (b.nodes / b.done).toFixed(0);
    console.log(
      String(L).padEnd(4) +
      `${winPct}%`.padEnd(8) +
      `${b.wins}/${b.done}`.padEnd(8) +
      msDeal.padEnd(10) +
      nodesDeal
    );
  }
  console.log(`\nTotale: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch(err => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});