"use strict";

/**
 * Celle per sweep/audit CLI: di default solo formati con G >= G_min (ceil(N/2), eccezione 7x7->3).
 * Passare --all-legal / --tutte-legali per includere anche sotto-G sconsigliato e G=1.
 */

function parseAllLegalFlag(argv) {
  const list = Array.isArray(argv) ? argv : process.argv.slice(2);
  return list.includes("--all-legal") || list.includes("--tutte-legali");
}

function isSweepCell(core, size, players, options = {}) {
  if (!core.isPlayableSetup(size, players)) return false;
  if (options.durissima === true) return core.isDurissimaSweepSetup(size, players);
  if (options.allLegal) return true;
  return core.isDefaultSweepSetup(size, players);
}

function playableGForSize(core, size, options = {}) {
  const out = [];
  const gMaxCap = Number.isFinite(options.gMaxCap) ? options.gMaxCap : core.maxPlayersForSize(size);
  const gMax = Math.min(core.maxPlayersForSize(size), gMaxCap);
  const gStart = (options.durissima === true || options.allLegal)
    ? core.durissimaMinPlayers()
    : core.recommendedMinPlayers(size);
  for (let g = gStart; g <= gMax; g++) {
    if (isSweepCell(core, size, g, options)) out.push(g);
  }
  return out;
}

function buildCellPairs(core, sizes, options = {}) {
  const cells = [];
  for (const L of sizes) {
    for (const G of playableGForSize(core, L, options)) {
      cells.push([L, G]);
    }
  }
  return cells;
}

module.exports = {
  parseAllLegalFlag,
  isSweepCell,
  playableGForSize,
  buildCellPairs
};