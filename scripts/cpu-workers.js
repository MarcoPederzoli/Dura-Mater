"use strict";

const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");

function logicalCpuCount() {
  return os.cpus().length || 4;
}

/** Worker CLI paralleli: tutti i core logici meno uno per il sistema. */
function defaultCliWorkers() {
  return Math.max(1, logicalCpuCount() - 1);
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
  parseWorkersFlag,
  filterArgv,
  runWorkerPool
};