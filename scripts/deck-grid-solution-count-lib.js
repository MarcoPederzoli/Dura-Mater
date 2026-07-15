"use strict";

const path = require("node:path");
require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;

function shareCount(a, b) {
  let s = 0;
  if (a.value === b.value) s++;
  if (a.shape === b.shape) s++;
  if (a.color === b.color) s++;
  return s;
}

function popcount(mask) {
  let n = 0;
  while (mask) {
    n++;
    mask &= mask - 1n;
  }
  return n;
}

function lowestBit(mask) {
  return mask & -mask;
}

function buildNeighbors(size) {
  const cells = size * size;
  const neighbors = Array.from({ length: cells }, () => []);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (x > 0) neighbors[idx].push(idx - 1);
      if (x < size - 1) neighbors[idx].push(idx + 1);
      if (y > 0) neighbors[idx].push(idx - size);
      if (y < size - 1) neighbors[idx].push(idx + size);
    }
  }
  return neighbors;
}

function buildCompatMasks(cards) {
  const n = cards.length;
  const masks = new Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0n;
    for (let j = 0; j < n; j++) {
      if (i !== j && shareCount(cards[i], cards[j]) >= 1) m |= 1n << BigInt(j);
    }
    masks[i] = m;
  }
  return masks;
}

function countSolutionsForSize(size, options) {
  const maxNodes = options.maxNodes ?? 500_000_000;
  const fixed = options.fixed ?? [];
  const cards = core.simulationDeck().filter(c => Number(c.value) <= size);
  const n = cards.length;
  if (n !== size * size) {
    throw new Error("Sottomazzo " + n + " != " + size * size);
  }

  const allMask = (1n << BigInt(n)) - 1n;
  const neighbors = buildNeighbors(size);
  const compat = buildCompatMasks(cards);
  const stats = { nodes: 0, solutions: 0, maxBranching: 0 };

  const assigned = new Int32Array(n).fill(-1);
  const domains = new Array(n);
  for (let i = 0; i < n; i++) domains[i] = allMask;

  const domainStack = [];

  function pushDomains() {
    domainStack.push(domains.map(d => d));
  }

  function popDomains() {
    const prev = domainStack.pop();
    for (let i = 0; i < n; i++) domains[i] = prev[i];
  }

  function propagate(fromCell, cardIdx) {
    const allow = compat[cardIdx];
    for (const nb of neighbors[fromCell]) {
      if (assigned[nb] >= 0) continue;
      const next = domains[nb] & allow;
      if (next === domains[nb]) continue;
      if (next === 0n) return false;
      domains[nb] = next;
    }
    return true;
  }

  function pickCell() {
    let best = -1;
    let bestSize = 999;
    for (let i = 0; i < n; i++) {
      if (assigned[i] >= 0) continue;
      const sz = popcount(domains[i]);
      if (sz === 0) return i;
      if (sz < bestSize) {
        bestSize = sz;
        best = i;
      }
    }
    return best;
  }

  function dfs() {
    if (stats.nodes >= maxNodes) return "budget";
    stats.nodes++;

    const cell = pickCell();
    if (cell < 0) {
      stats.solutions++;
      return "done";
    }

    let opts = domains[cell];
    if (opts === 0n) return "dead";

    const branch = popcount(opts);
    stats.maxBranching = Math.max(stats.maxBranching, branch);

    while (opts) {
      const bit = lowestBit(opts);
      opts ^= bit;
      const cardIdx = Number(bit.toString(2).length - 1);

      pushDomains();
      assigned[cell] = cardIdx;
      domains[cell] = bit;
      for (let i = 0; i < n; i++) {
        if (assigned[i] < 0 && i !== cell) domains[i] &= ~bit;
      }
      if (propagate(cell, cardIdx) && dfs() === "budget") {
        assigned[cell] = -1;
        popDomains();
        return "budget";
      }
      assigned[cell] = -1;
      popDomains();
    }
    return "ok";
  }

  for (const { cell, card } of fixed) {
    const bit = 1n << BigInt(card);
    if ((domains[cell] & bit) === 0n) {
      return { ...stats, result: "ok", cards: n, cells: n };
    }
    assigned[cell] = card;
    domains[cell] = bit;
    for (let i = 0; i < n; i++) {
      if (assigned[i] < 0 && i !== cell) domains[i] &= ~bit;
    }
    if (!propagate(cell, card)) {
      return { ...stats, result: "ok", cards: n, cells: n };
    }
  }

  const result = dfs();
  return { ...stats, result, cards: n, cells: n };
}

/**
 * Trova UNA soluzione completa di griglia NxN valida (incastro Livello A).
 * Usa lo stesso CSP con bitmask + propagazione del counter.
 * Ritorna { grid: number[][], cards: Card[] } dove grid[y][x] = indice carta nel deck filtrato,
 * oppure null se non trovata entro maxNodes.
 */
function findOneSolutionForSize(size, options) {
  options = options || {};
  const maxNodes = options.maxNodes ?? 50_000_000;
  const cards = core.simulationDeck().filter(c => Number(c.value) <= size);
  const n = cards.length;
  if (n !== size * size) throw new Error("Sottomazzo errato");

  const allMask = (1n << BigInt(n)) - 1n;
  const neighbors = buildNeighbors(size);
  const compat = buildCompatMasks(cards);
  const stats = { nodes: 0, found: false };

  const assigned = new Int32Array(n).fill(-1);
  const domains = new Array(n);
  for (let i = 0; i < n; i++) domains[i] = allMask;

  const domainStack = [];

  function pushDomains() { domainStack.push(domains.map(d => d)); }
  function popDomains() {
    const prev = domainStack.pop();
    for (let i = 0; i < n; i++) domains[i] = prev[i];
  }

  function propagate(fromCell, cardIdx) {
    const allow = compat[cardIdx];
    for (const nb of neighbors[fromCell]) {
      if (assigned[nb] >= 0) continue;
      const next = domains[nb] & allow;
      if (next === 0n) return false;
      domains[nb] = next;
    }
    return true;
  }

  function pickCell() {
    let best = -1, bestSize = 999;
    for (let i = 0; i < n; i++) {
      if (assigned[i] >= 0) continue;
      const sz = popcount(domains[i]);
      if (sz === 0) return i;
      if (sz < bestSize) { bestSize = sz; best = i; }
    }
    return best;
  }

  let solution = null;

  function dfs() {
    if (stats.nodes >= maxNodes) return "budget";
    stats.nodes++;
    const cell = pickCell();
    if (cell < 0) {
      // trovato!
      stats.found = true;
      const grid = Array.from({ length: size }, () => new Array(size).fill(-1));
      for (let i = 0; i < n; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        grid[y][x] = assigned[i];
      }
      solution = { grid, assigned: Array.from(assigned), cards };
      return "done";
    }
    let opts = domains[cell];
    if (opts === 0n) return "dead";

    while (opts && !stats.found) {
      const bit = lowestBit(opts);
      opts ^= bit;
      const cardIdx = Number(bit.toString(2).length - 1);

      pushDomains();
      assigned[cell] = cardIdx;
      domains[cell] = bit;
      for (let i = 0; i < n; i++) {
        if (assigned[i] < 0 && i !== cell) domains[i] &= ~bit;
      }
      if (propagate(cell, cardIdx)) {
        const r = dfs();
        if (r === "done" || r === "budget") {
          if (r === "budget" && !stats.found) { /* continua */ }
        }
      }
      assigned[cell] = -1;
      popDomains();
      if (stats.found) break;
    }
    return stats.found ? "done" : "ok";
  }

  const res = dfs();
  if (stats.found && solution) {
    return { found: true, ...solution, stats: { ...stats, result: res } };
  }
  return { found: false, stats: { ...stats, result: res }, result: res };
}

module.exports = {
  countSolutionsForSize,
  findOneSolutionForSize,
  shareCount,
  buildNeighbors,
  buildCompatMasks
};