"use strict";

const { parentPort, workerData } = require("worker_threads");
const { runCellAudit } = require("./tournament-audit-lib");

try {
  const { task } = workerData;
  const result = runCellAudit(task.cell, task.count, task.strategy, task.seedTag);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || String(error) });
}