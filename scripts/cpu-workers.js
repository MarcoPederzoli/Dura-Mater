"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");

const HEAVY_PROBE_LOCK_PATH = path.join(__dirname, ".heavy-probe.lock");

function logicalCpuCount() {
  return os.cpus().length || 4;
}

/** Worker CLI paralleli: 6 (margine CPU per altra istanza agente sullo stesso PC). */
function defaultCliWorkers() {
  return Math.min(6, Math.max(1, logicalCpuCount() - 2));
}

/** Probe pesanti (DFS G=N, simulazioni lunghe): 1 worker per non contendere CPU/RAM. */
function defaultHeavyCliWorkers() {
  return 1;
}

function hasForceLockFlag(argv) {
  return argv.includes("--force-lock");
}

function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === "EPERM";
  }
}

function readHeavyProbeLock() {
  try {
    if (!fs.existsSync(HEAVY_PROBE_LOCK_PATH)) return null;
    return JSON.parse(fs.readFileSync(HEAVY_PROBE_LOCK_PATH, "utf8"));
  } catch (_err) {
    return null;
  }
}

function clearHeavyProbeLock() {
  try {
    if (fs.existsSync(HEAVY_PROBE_LOCK_PATH)) fs.unlinkSync(HEAVY_PROBE_LOCK_PATH);
  } catch (_err) {
    /* lock gia rimosso */
  }
}

/**
 * Un solo probe pesante alla volta. Evita N processi Node con 7 worker che si pestano.
 * @param {string} scriptName nome script (per messaggio)
 * @param {string[]} argv process.argv.slice(2)
 */
function acquireHeavyProbeLock(scriptName, argv = []) {
  const existing = readHeavyProbeLock();
  if (existing && !isProcessAlive(existing.pid)) {
    clearHeavyProbeLock();
  } else if (existing && existing.pid !== process.pid) {
    if (!hasForceLockFlag(argv)) {
      process.stderr.write(
        "\nProbe pesante gia in esecuzione:\n" +
          `  script: ${existing.script || "?"}\n` +
          `  pid:    ${existing.pid}\n` +
          `  avvio:  ${existing.started || "?"}\n\n` +
          "Attendere la fine o killare il processo. Per ignorare: --force-lock\n"
      );
      process.exit(2);
    }
    clearHeavyProbeLock();
  }

  const payload = {
    script: scriptName,
    pid: process.pid,
    started: new Date().toISOString()
  };
  fs.writeFileSync(HEAVY_PROBE_LOCK_PATH, JSON.stringify(payload));

  let released = false;
  function release() {
    if (released) return;
    released = true;
    const current = readHeavyProbeLock();
    if (current && current.pid === process.pid) clearHeavyProbeLock();
  }

  process.once("exit", release);
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(143);
  });
}

function parseWorkersFlag(argv, fallback = defaultCliWorkers()) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--workers" || argv[i] === "-j") {
      const n = Number(argv[i + 1]);
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
    }
  }
  return fallback;
}

function filterArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--workers" || argv[i] === "-j") {
      i++;
      continue;
    }
    if (argv[i] === "--force-lock") continue;
    out.push(argv[i]);
  }
  return out;
}

/**
 * Esegue task in parallelo con worker_threads (adatto a batch Node.js CLI).
 * @param {string} workerFile path assoluto o relativo al worker
 * @param {Array<unknown>} tasks
 * @param {{ workers?: number, onProgress?: (done: number, total: number) => void }} opts
 */
function runWorkerPool(workerFile, tasks, opts = {}) {
  const total = tasks.length;
  if (!total) return Promise.resolve([]);
  const workers = Math.max(1, Math.min(opts.workers || defaultCliWorkers(), total));
  const workerAbs = path.isAbsolute(workerFile) ? workerFile : path.join(__dirname, workerFile);
  const results = new Array(total);
  let nextIndex = 0;
  let finished = 0;
  let failed = null;

  return new Promise((resolve, reject) => {
    function launch() {
      if (failed || nextIndex >= total) return;
      const index = nextIndex++;
      const task = tasks[index];
      const worker = new Worker(workerAbs, { workerData: { index, task } });
      worker.on("message", message => {
        if (message?.ok) {
          results[index] = message.result;
          finished++;
          if (opts.onProgress) opts.onProgress(finished, total);
          worker.terminate().catch(() => {});
          if (finished === total) resolve(results);
          else launch();
        } else {
          failed = new Error(message?.error || "Worker fallito");
          reject(failed);
        }
      });
      worker.on("error", err => {
        failed = err;
        reject(err);
      });
    }

    for (let i = 0; i < workers; i++) launch();
  });
}

module.exports = {
  logicalCpuCount,
  defaultCliWorkers,
  defaultHeavyCliWorkers,
  acquireHeavyProbeLock,
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
};