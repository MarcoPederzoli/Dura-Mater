"use strict";

/**
 * Confronto impatto regola Idea (5a carta jolly) sulla Durissima Mater.
 * Modi:
 *   current         - jolly cieca + buco topologico (motore attuale)
 *   legacy-neighbor - jolly cieca ma conta come vicino occupato (pre-buco)
 *   pre-jolly       - ea7e993: 5a carta con regole tratto normali, no ideaBlind
 *
 * Uso: node scripts/durissima-idea-impact-probe.js [L] [COUNT] [--g 1,3,4,5] [--workers N]
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { Worker, workerData, parentPort, isMainThread } = require("worker_threads");
const { parseWorkersFlag } = require("./cpu-workers");

const ROOT = path.join(__dirname, "..");
const MODES = ["current", "legacy-neighbor", "pre-jolly"];
const argv = process.argv.slice(2);
const L = Number(argv.find(a => /^\d+$/.test(a))) || 5;
const COUNT = Number(argv.filter(a => /^\d+$/.test(a))[1]) || 200;
const WORKERS = parseWorkersFlag(argv, Math.min(6, Math.max(1, (os.cpus().length || 4) - 2)));

function parseGFlag(list) {
  for (let i = 0; i < list.length; i++) {
    if (list[i] === "--g" && list[i + 1]) {
      return list[i + 1].split(",").map(n => Number(n.trim())).filter(n => Number.isInteger(n) && n >= 1);
    }
  }
  return [1, 3, 4, 5];
}

const G_LIST = parseGFlag(argv).filter(g => g <= L);
if (!G_LIST.length) {
  process.stderr.write("Nessun G valido.\n");
  process.exit(1);
}

const LEGACY_CORE_PATH = path.join(__dirname, ".mpcards-core-legacy-neighbor.js");
const PRE_JOLLY_CORE_PATH = path.join(__dirname, ".mpcards-core-pre-jolly.js");

function ensureVariantCores() {
  const current = fs.readFileSync(path.join(ROOT, "mpcards-core.js"), "utf8");

  if (!fs.existsSync(LEGACY_CORE_PATH)) {
    const legacy = current
      .replace(
        "      if (isIdeaBlindBoardEntry(adjacent)) continue;\n      neighbors++;",
        "      neighbors++;\n      if (isIdeaBlindBoardEntry(adjacent)) {\n        compatibleNeighbors++;\n        continue;\n      }"
      )
      .replace(
        "      const entry = map.get(coordKey(x + dir.x, y + dir.y));\n      if (entry && !isIdeaBlindBoardEntry(entry)) n++;",
        "      if (map.has(coordKey(x + dir.x, y + dir.y))) n++;"
      );
    fs.writeFileSync(LEGACY_CORE_PATH, legacy);
  }

  if (!fs.existsSync(PRE_JOLLY_CORE_PATH)) {
    const src = execSync("git show ea7e993:mpcards-core.js", { cwd: ROOT, encoding: "utf8" });
    fs.writeFileSync(PRE_JOLLY_CORE_PATH, src);
  }
}

function corePathForMode(mode) {
  if (mode === "current") return path.join(ROOT, "mpcards-core.js");
  if (mode === "legacy-neighbor") return LEGACY_CORE_PATH;
  return PRE_JOLLY_CORE_PATH;
}

function simOptions(L, G) {
  const strategy = G === 1
    ? "durissima-planner"
    : (G === L ? "durissima-global-planner" : "durissima-team-planner");
  return {
    size: L,
    players: G,
    strategies: Array.from({ length: G }, () => strategy),
    durissimaMater: true,
    durissimaPursueIdea: true,
    randomizeTurnOrder: true
  };
}

function runChunk({ mode, L, G, count, seedBase, chunkIndex }) {
  delete require.cache[require.resolve(corePathForMode(mode))];
  require(corePathForMode(mode));
  const core = globalThis.MPCardsCore;
  const deck = core.simulationDeck();
  const random = core.mulberry32(core.hashSeed(`${seedBase}:${mode}:${L}:${G}:${chunkIndex}`));
  const base = simOptions(L, G);

  const stats = {
    done: 0,
    wins: 0,
    ideaOffers: 0,
    fiveCardTurns: 0,
    fourCardTurns: 0,
    placedSum: 0,
    turnsSum: 0,
    vitaSum: 0
  };

  for (let i = 0; i < count; i++) {
    const result = core.simulateGame(deck, { ...base, random });
    stats.done++;
    if (result.status === "success") stats.wins++;
    stats.ideaOffers += result.ideaOffers || 0;
    stats.fiveCardTurns += result.fiveCardTurns || 0;
    stats.fourCardTurns += result.fourCardTurns || 0;
    stats.placedSum += result.totalPlacements || 0;
    stats.turnsSum += result.turns || 0;
    stats.vitaSum += result.durissimaVitaExtraUsed || 0;
  }

  return { mode, L, G, chunkIndex, ...stats };
}

async function runMode(mode, L, G, count) {
  const seedBase = `idea-impact-L${L}-G${G}`;
  const chunks = [];
  const per = Math.floor(count / WORKERS);
  const rem = count % WORKERS;
  for (let w = 0; w < WORKERS; w++) {
    const n = per + (w < rem ? 1 : 0);
    if (n > 0) chunks.push({ mode, L, G, count: n, seedBase, chunkIndex: w });
  }

  const results = await Promise.all(chunks.map(task => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { task } });
    worker.on("message", resolve);
    worker.on("error", reject);
    worker.on("exit", code => {
      if (code !== 0) reject(new Error(`worker exit ${code}`));
    });
  })));

  const merged = {
    mode,
    L,
    G,
    done: 0,
    wins: 0,
    ideaOffers: 0,
    fiveCardTurns: 0,
    fourCardTurns: 0,
    placedSum: 0,
    turnsSum: 0,
    vitaSum: 0
  };
  for (const r of results) {
    for (const k of Object.keys(merged)) {
      if (k === "mode" || k === "L" || k === "G") continue;
      merged[k] += r[k] || 0;
    }
  }
  return merged;
}

function fmtPct(n, d) {
  return d ? (100 * n / d).toFixed(2) + "%" : "n/a";
}

function summarize(row) {
  const d = row.done || 1;
  return {
    winPct: fmtPct(row.wins, d),
    ideaOffersPerGame: (row.ideaOffers / d).toFixed(3),
    fiveCardTurnsPerGame: (row.fiveCardTurns / d).toFixed(3),
    fourCardTurnsPerGame: (row.fourCardTurns / d).toFixed(3),
    avgPlaced: (row.placedSum / d).toFixed(2),
    avgTurns: (row.turnsSum / d).toFixed(1),
    avgVita: (row.vitaSum / d).toFixed(2)
  };
}

async function main() {
  if (!isMainThread) {
    parentPort.postMessage(runChunk(workerData.task));
    return;
  }

  ensureVariantCores();
  const started = Date.now();
  process.stderr.write(
    `\nDurissima Idea impact probe · L=${L} · G=${G_LIST.join(",")} · ${COUNT} partite/modo/cella · worker=${WORKERS}\n\n`
  );

  const all = [];
  for (const G of G_LIST) {
    for (const mode of MODES) {
      process.stderr.write(`  ${mode} · ${L}x${G} ... `);
      const row = await runMode(mode, L, G, COUNT);
      all.push(row);
      const s = summarize(row);
      process.stderr.write(`win ${s.winPct} · idea ${s.ideaOffersPerGame}/gioco · 5-card ${s.fiveCardTurnsPerGame}/gioco\n`);
    }
    process.stderr.write("\n");
  }

  const out = {
    format: "durissima-idea-impact-probe",
    L,
    count: COUNT,
    workers: WORKERS,
    gList: G_LIST,
    modes: MODES,
    durationMs: Date.now() - started,
    rows: all.map(row => ({ ...row, summary: summarize(row) }))
  };

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outPath = path.join(ROOT, "tests", `dura-mater-durissima-idea-impact-L${L}-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  process.stdout.write("\n=== Riepilogo ===\n\n");
  for (const G of G_LIST) {
    process.stdout.write(`${L}x${G} (${COUNT} partite per modo)\n`);
    const rows = all.filter(r => r.G === G);
    const cur = rows.find(r => r.mode === "current");
    const leg = rows.find(r => r.mode === "legacy-neighbor");
    const pre = rows.find(r => r.mode === "pre-jolly");
    for (const r of rows) {
      const s = summarize(r);
      process.stdout.write(
        `  ${r.mode.padEnd(17)} win ${s.winPct.padStart(7)}  idea ${s.ideaOffersPerGame}/g  ` +
        `5-card ${s.fiveCardTurnsPerGame}/g  4-card ${s.fourCardTurnsPerGame}/g  ` +
        `pose ${s.avgPlaced}  turni ${s.avgTurns}\n`
      );
    }
    if (cur && leg) {
      const dWin = cur.wins - leg.wins;
      const dIdea = (cur.ideaOffers - leg.ideaOffers) / cur.done;
      process.stdout.write(
        `  delta buco vs vicino: win ${dWin >= 0 ? "+" : ""}${dWin}  idea ${dIdea >= 0 ? "+" : ""}${dIdea.toFixed(3)}/g\n`
      );
    }
    if (cur && pre) {
      const dWin = cur.wins - pre.wins;
      const dIdea = (cur.ideaOffers - pre.ideaOffers) / cur.done;
      process.stdout.write(
        `  delta jolly vs pre-jolly: win ${dWin >= 0 ? "+" : ""}${dWin}  idea ${dIdea >= 0 ? "+" : ""}${dIdea.toFixed(3)}/g\n`
      );
    }
    process.stdout.write("\n");
  }
  process.stdout.write(`JSON: ${outPath}\n`);
}

main().catch(err => {
  process.stderr.write(String(err && err.stack || err) + "\n");
  process.exit(1);
});