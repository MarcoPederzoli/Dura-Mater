"use strict";

const { parentPort, workerData } = require("worker_threads");
const { runCellChunk } = require("./durissima-pool-sweep-lib");

try {
  const result = runCellChunk(workerData.task);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || String(error) });
}