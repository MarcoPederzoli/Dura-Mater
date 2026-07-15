"use strict";
const path = require("node:path");
const { runWorkerPool } = require("./scripts/cpu-workers");

const configs = [
  [8, 2],
  [8, 7],
  [6, 5]
];
const namespaces = ["gltN", "huntA", "huntB", "huntC", "huntD"];
const SEEDS = 40;
const tasks = [];
for (const ns of namespaces) {
  for (const [n, g] of configs) {
    for (let s = 0; s < SEEDS; s++) tasks.push({ n, g, seed: s, ns });
  }
}

console.log("hunt zeros", tasks.length, "deals");

(async () => {
  const rows = await runWorkerPool(path.resolve("temp-hunt-worker.js"), tasks, {
    workers: 7
  });
  const by = new Map();
  for (const r of rows) {
    const k = r.n + "x" + r.g;
    if (!by.has(k)) by.set(k, { w: 0, d: 0, p: 0, t: r.total, hits: [] });
    const b = by.get(k);
    b.d++;
    b.p += r.placed || 0;
    if ((r.placed || 0) >= r.total) {
      b.w++;
      b.hits.push(r.ns + ":" + r.seed);
    }
  }
  for (const [k, b] of [...by.entries()].sort()) {
    console.log(
      k +
        ": " +
        b.w +
        "/" +
        b.d +
        " avgP " +
        (b.p / b.d).toFixed(1) +
        "/" +
        b.t +
        (b.w > 0 ? " YES " + b.hits.slice(0, 5).join(",") : " NO")
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
