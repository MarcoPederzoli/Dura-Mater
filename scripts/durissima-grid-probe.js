"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  defaultHeavyCliWorkers,
  acquireHeavyProbeLock,
  logicalCpuCount,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
} = require("./cpu-workers");
const { createProgressReporter } = require("./cli-progress");
const { playableGForSize } = require("./sweep-cells");
const { runCellChunk } = require("./durissima-pool-sweep-lib");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const argvRaw = process.argv.slice(2);
acquireHeavyProbeLock("durissima-grid-probe", argvRaw);
const argv = filterArgv(argvRaw);
const WORKERS = parseWorkersFlag(argvRaw, defaultHeavyCliWorkers());
const L = Number(argv[0]) || 5;
const COUNT = Number(argv[1]) || 500;

function parseGMaxCapFlag(list) {
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "--g-max" || list[i] === "--gmax") {
      const n = Number(list[i + 1]);
      if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    }
  }
  return core.maxPlayersForSize(L);
}

const G_MAX_CAP = parseGMaxCapFlag(process.argv.slice(2));
const FREE_DRAW_VARIANT = process.argv.slice(2).includes("--free-draw");
const SCARTI_VARIANT = process.argv.slice(2).includes("--scarti-n-reshuffle");
const HAND_CAP_2N = process.argv.slice(2).includes("--hand-cap-2n");
const HAND_CAP_VARIANT = HAND_CAP_2N || process.argv.slice(2).includes("--hand-cap");

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

function cellLabel(G) {
  const gMinClassic = core.recommendedMinPlayers(L);
  const deal = core.computeInitialDeal(L, G);
  let tag = "";
  if (G === 1) tag = "solitario";
  else if (G < gMinClassic) tag = "sotto-G-classic";
  else if (G === L) tag = "G=N";
  else if (G > L) tag = "overcrowd";
  else tag = "banda";
  return `${L}x${G} (${deal.cardsPerPlayer}/${deal.drawCount}) [${tag}]`;
}

async function main() {
  if (!Number.isInteger(L) || L < 3 || L > 8) {
    process.stderr.write("Griglia L non valida (3-8).\n");
    process.exit(1);
  }

  const gList = playableGForSize(core, L, { durissima: true, gMaxCap: G_MAX_CAP });
  if (!gList.length) {
    process.stderr.write(`Nessuna cella legale per ${L}x? (cap G=${G_MAX_CAP}).\n`);
    process.exit(1);
  }

  const seedTag = `grid-probe-L${L}-${stamp()}`;
  const variant = SCARTI_VARIANT
    ? "scarti-n-reshuffle"
    : FREE_DRAW_VARIANT
      ? "free-draw-n-reshuffle"
      : HAND_CAP_2N
        ? "hand-cap-2n"
        : (HAND_CAP_VARIANT ? "hand-cap" : undefined);
  const tasks = gList.map((G, index) => ({
    L,
    G,
    count: COUNT,
    seedTag,
    chunkIndex: index,
    variant
  }));

  const variantLabel = SCARTI_VARIANT
    ? "scarti-n-reshuffle (tetto N, scarti riciclabili max N volte, no vita extra)"
    : FREE_DRAW_VARIANT
      ? "free-draw-n-reshuffle (pesca competitiva + N reshuffle selettivo)"
      : HAND_CAP_2N
        ? "hand-cap-2n (pesca competitiva, tetto 2N carte, no reshuffle)"
        : HAND_CAP_VARIANT
          ? "hand-cap (pesca competitiva, tetto N carte, no reshuffle)"
          : "n-reshuffle";
  process.stderr.write(
    `\nDurissima L=${L} probe [${variantLabel}] · G=1..${G_MAX_CAP} (legali: ${gList.join(", ")}) · ${COUNT} partite/cella\n` +
      `Senza G_min competitivo · worker=${WORKERS}/${logicalCpuCount()} logici\n\n`
  );

  const started = Date.now();
  const progress = createProgressReporter({ label: "celle", total: tasks.length, interval: 1 });
  progress.tick(0);

  const chunkResults = await runWorkerPool(
    path.join(__dirname, "durissima-pool-sweep-worker.js"),
    tasks,
    {
      workers: WORKERS,
      onProgress(done) {
        progress.tick(done);
      }
    }
  );
  progress.done();

  const cells = {};
  const rows = [];
  for (const chunk of chunkResults) {
    const key = chunk.key;
    const winPct = (100 * chunk.wins / chunk.done).toFixed(1);
    const vitaMed = (chunk.vitaUsedSum / chunk.done).toFixed(2);
    const recycleMed = ((chunk.discardRecyclesUsedSum || 0) / chunk.done).toFixed(2);
    const turnsMed = (chunk.turnSum / chunk.done).toFixed(1);
    cells[key] = {
      cell: key,
      L: chunk.L,
      G: chunk.G,
      category: chunk.category,
      durissimaMinPlayers: core.durissimaMinPlayers(),
      classicGMin: core.recommendedMinPlayers(L),
      initialHandSize: chunk.initialHandSize,
      initialDrawCount: chunk.initialDrawCount,
      done: chunk.done,
      wins: chunk.wins,
      stalls: chunk.stalls,
      winPct: Number(winPct),
      vitaUsedSum: chunk.vitaUsedSum,
      vitaMed: Number(vitaMed),
      discardRecyclesUsedSum: chunk.discardRecyclesUsedSum || 0,
      discardRecyclesMed: Number(recycleMed),
      turnSum: chunk.turnSum,
      turnsMed: Number(turnsMed)
    };
    rows.push(cells[key]);
    const recycleSuffix = SCARTI_VARIANT ? ` · ricicli med ${recycleMed}` : "";
    console.log(
      `${cellLabel(chunk.G)}: ok ${chunk.wins}/${chunk.done} (${winPct}%)` +
        ` · turni med ${turnsMed} · vita med ${vitaMed}${recycleSuffix}`
    );
  }

  rows.sort((a, b) => a.G - b.G);
  const minPct = rows.length ? Math.min(...rows.map(r => r.winPct)) : 0;
  const maxPct = rows.length ? Math.max(...rows.map(r => r.winPct)) : 0;

  console.log(`\n--- Riepilogo ${L}x${L} (${rows.length} celle, G cap ${G_MAX_CAP}) ---`);
  console.log(`Completamento: min ${minPct}% · max ${maxPct}%`);
  console.log(rows.map(r => `${r.cell} ${r.winPct}%`).join(" · "));

  const out = path.join(__dirname, "..", "tests", `dura-mater-durissima-l${L}-probe-${stamp()}.json`);
  fs.writeFileSync(out, JSON.stringify({
    format: "dura-mater-durissima-grid-probe",
    variant: variantLabel,
    size: L,
    durissimaMinPlayers: core.durissimaMinPlayers(),
    classicGMin: core.recommendedMinPlayers(L),
    gMaxCap: G_MAX_CAP,
    legalG: gList,
    countPerCell: COUNT,
    workers: WORKERS,
    durationMs: Date.now() - started,
    exportedAt: new Date().toISOString(),
    cells
  }, null, 2), "utf8");
  console.log(`\nScritto: ${out}`);
}

main().catch(err => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});