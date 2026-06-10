"use strict";

const { parentPort, workerData } = require("worker_threads");
const { runScenario } = require("./tournament-sweep-lib");

try {
  const { task } = workerData;
  const result = runScenario(task.scenario, task.count, task.strategy);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error?.message || String(error) });
}