"use strict";

function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${String(rs).padStart(2, "0")}s`;
}

/**
 * @param {{ label: string, total: number, interval?: number }} opts
 */
function createProgressReporter({ label, total, interval }) {
  const started = Date.now();
  let lastReport = -1;
  const step = Math.max(1, interval || Math.max(1, Math.floor(total / 20)));

  function tick(current) {
    const now = Date.now();
    const done = current >= total;
    const first = current === 0;
    const milestone = current > 0 && current % step === 0;
    if (!first && !done && !milestone) return;
    if (current === lastReport) return;
    lastReport = current;

    const elapsed = now - started;
    const rate = current > 0 ? elapsed / current : 0;
    const remaining = current > 0 && current < total ? (total - current) * rate : 0;
    const pct = total > 0 ? ((100 * current) / total).toFixed(0) : "100";
    const eta = current > 0 && current < total ? ` · ETA ~${formatDuration(remaining)}` : "";
    process.stderr.write(
      `[${label}] ${current}/${total} (${pct}%) · trascorso ${formatDuration(elapsed)}${eta}\n`
    );
  }

  return {
    tick,
    done() {
      tick(total);
    }
  };
}

module.exports = { createProgressReporter, formatDuration };