/* eslint-disable */
/**
 * Solver coordinatore Durissima per browser — generato da scripts/build-coordinator-browser.js
 * Non modificare a mano: rigenerare con `node scripts/build-coordinator-browser.js`
 */
(function () {
  "use strict";
  if (!globalThis.MPCardsCore) {
    console.warn("[Durissima browser] MPCardsCore non caricato — coordinatore disabilitato.");
    return;
  }
  const core = globalThis.MPCardsCore;

{



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

const DeckGridSolutionCountLib = {
  countSolutionsForSize,
  findOneSolutionForSize,
  shareCount,
  buildNeighbors,
  buildCompatMasks
};
globalThis.DeckGridSolutionCountLib = DeckGridSolutionCountLib;
}

{

/**
 * durissima-matrix-solver.js
 * Solver migliorato per matrici NxN di Dura Mater / Durissima.
 *
 * Obiettivi (2026-07):
 * - Livello A: incastro compatibile su griglia rettangolare (gia' forte nel count-lib).
 * - Livello B: ricerca di sequenze di assemblaggio rispettando i vincoli di turno
 *   (1-4 pose, requisito = #vicini gia' presenti nella sequenza, crescita connessa).
 * - Fornire oracolo forte per 7x7/8x8 e tutti gli ordini.
 * - Supporto per parallelismo futuro e certificazioni su seed/deal.
 *
 * Usa bitmask CSP dal deck-grid-solution-count-lib per trovare griglie valide velocemente.
 * Poi scheduler separato per linearizzare in turni.
 */


const { findOneSolutionForSize, buildNeighbors } = DeckGridSolutionCountLib;


function deckForSize(size) {
  return core.simulationDeck().filter(c => Number(c.value) <= size);
}

/**
 * Verifica se una griglia (assegnazione cella -> cardIdx) e' valida Livello A.
 * (Ridondante se viene da findOne, utile per check custom.)
 */
function isValidGridLabeling(grid, size, cards) {
  const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c1 = cards[grid[y][x]];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        const c2 = cards[grid[ny][nx]];
        if (core.shareTraitCount ? core.shareTraitCount(c1, c2) : shareCount(c1, c2) < 1) return false;
      }
    }
  }
  return true;
}

function shareCount(a, b) {
  let s = 0;
  if (a.value === b.value) s++;
  if (a.shape === b.shape) s++;
  if (a.color === b.color) s++;
  return s;
}

/**
 * Cerca una sequenza di riempimento (lista di cell indices flat) che rispetti:
 * - Crescita connessa (ogni cella dopo la prima ha >=1 vicino gia' filled)
 * - Raggruppamento in turni di 1..4 pose
 * - Per la m-esima posa del turno (m=1..4), la cella deve avere al momento del piazzamento
 *   almeno m vicini ortogonali gia' presenti nella sequenza.
 *
 * Ritorna { sequence: number[], turns: number[][], success: true } o {success:false}
 * sequence = ordine di cellIndex (0 .. n-1, row-major y*size + x)
 */
function findSchedulableAssembly(grid, size, options) {
  options = options || {};
  const maxNodes = options.maxNodes || 2_000_000;
  const n = size * size;
  const neighbors = buildNeighbors(size); // array di array di indici flat

  // grid[y][x] -> cardIdx ; converti a flat per comodita'
  const cardOf = new Array(n);
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    cardOf[y*size + x] = grid[y][x];
  }

  let stats = { nodes: 0, maxDepth: 0 };
  let bestSeq = null;

  // Stato: filled (bitmask o Set), current sequence, turnStep (0 prima di iniziare un turno)
  // Usiamo Set per vicini rapidi + array per seq.
  function dfs(filled /*Set*/, seq, turnStep) {
    if (stats.nodes >= maxNodes) return "budget";
    stats.nodes++;
    if (seq.length > stats.maxDepth) stats.maxDepth = seq.length;

    if (seq.length === n) {
      bestSeq = seq.slice();
      return "solved";
    }

    // possibili candidati: non filled, con almeno 1 vicino filled (connesso)
    const candidates = [];
    for (let c = 0; c < n; c++) {
      if (filled.has(c)) continue;
      let sup = 0;
      for (const nb of neighbors[c]) {
        if (filled.has(nb)) sup++;
      }
      if (sup === 0 && seq.length > 0) continue; // non connesso

      const req = turnStep + 1; // 1-based nel turno corrente
      if (sup >= req) {
        candidates.push({ cell: c, support: sup });
      }
    }

    // ordinamento euristico: preferisci alto supporto o celle "interne" (morfologia implicita)
    candidates.sort((a, b) => b.support - a.support || a.cell - b.cell);

    for (const cand of candidates) {
      const c = cand.cell;
      filled.add(c);
      seq.push(c);

      const newTurnStep = turnStep + 1;
      let outcome;
      if (newTurnStep < 4) {
        // possiamo continuare il turno o chiuderlo
        outcome = dfs(filled, seq, newTurnStep);
        if (outcome === "solved") return "solved";
        if (outcome === "budget") return "budget";

        // prova anche a chiudere il turno ora (end turn) e iniziare nuovo con req=1
        // (solo se ha senso; dopo 1 posa si puo' sempre)
        outcome = dfs(filled, seq, 0);
        if (outcome === "solved") return "solved";
        if (outcome === "budget") return "budget";
      } else {
        // dopo 4a, obbligatorio (o Idea ma per ora base) chiudere
        outcome = dfs(filled, seq, 0);
        if (outcome === "solved") return "solved";
        if (outcome === "budget") return "budget";
      }

      // backtrack
      seq.pop();
      filled.delete(c);
    }

    // possiamo anche decidere di "passare il turno" senza posa? no, per solver assumiamo che si posi quando possibile.
    // Se turnStep===0 e nessun candidato per req=1, dead end.

    return "dead";
  }

  // Prova diversi starting points (angoli, centro, random sample limitato)
  const starts = [];
  // centro approssimato
  const cx = Math.floor(size / 2), cy = Math.floor(size / 2);
  starts.push(cy * size + cx);
  // angoli e bordi
  starts.push(0, size-1, (size-1)*size, n-1);
  for (let i = 1; i < size-1; i++) {
    starts.push(i); // top row
    starts.push((size-1)*size + i);
  }

  for (const start of starts) {
    const filled = new Set([start]);
    const seq = [start];
    const res = dfs(filled, seq, 0);
    if (res === "solved" && bestSeq) {
      // reconverti in turn groups per leggibilita'
      const turns = [];
      let t = 0;
      while (t < bestSeq.length) {
        turns.push(bestSeq.slice(t, t+4));
        t += 4;
      }
      return {
        success: true,
        sequence: bestSeq,
        turns,
        startCell: start,
        stats
      };
    }
    if (res === "budget") break; // non insistere su questo start
  }

  return { success: false, stats, triedStarts: starts.length };
}

/**
 * Trova una griglia valida + un assemblaggio schedulabile per la dimensione.
 * Ritorna info completa o null.
 */
function findSchedulableMatrix(size, options) {
  options = options || {};
  const gridSol = findOneSolutionForSize(size, { maxNodes: options.maxNodesA || 10_000_000 });
  if (!gridSol || !gridSol.found || !gridSol.grid) {
    return { success: false, reason: "no-level-a", stats: gridSol ? gridSol.stats : null };
  }

  const assembly = findSchedulableAssembly(gridSol.grid, size, { maxNodes: options.maxNodesB || 5_000_000 });
  if (assembly.success) {
    return {
      success: true,
      size,
      grid: gridSol.grid,
      cards: gridSol.cards,
      assembly,
      levelAStats: gridSol.stats,
      levelBStats: assembly.stats
    };
  }
  return {
    success: false,
    reason: "level-a-ok-but-no-schedulable-assembly",
    grid: gridSol.grid,
    levelAStats: gridSol.stats,
    levelBStats: assembly.stats
  };
}

/**
 * Helper: stampa una griglia in forma leggibile (codici o indici).
 */
function formatGrid(grid, cards) {
  if (!grid) return "nessuna";
  return grid.map(row =>
    row.map(idx => {
      const c = cards[idx];
      return c ? `${c.value}${c.shape[0]}${c.color[0]}` : "?";
    }).join(" ")
  ).join("\n");
}

/**
 * Dato il risultato di findSchedulableMatrix (o assembly + grid), restituisce
 * un "piano" semplice: lista ordinata di {x, y, card} che rappresenta una sequenza
 * legale di pose (rispettando i gruppi di turno).
 * Utile per guidare il bot/oracolo G=N.
 */
function getTargetPlan(result) {
  if (!result || !result.success || !result.assembly || !result.grid || !result.cards) return null;

  const size = result.size;
  const plan = [];
  for (const turn of result.assembly.turns) {
    for (const cellIdx of turn) {
      const x = cellIdx % size;
      const y = Math.floor(cellIdx / size);
      const cardIdx = result.grid[y][x];
      plan.push({
        x,
        y,
        card: result.cards[cardIdx],
        cellIdx
      });
    }
  }
  return plan;
}

/**
 * Crea un piano target per una size (helper di comodo).
 */
function createTargetPlanForSize(size, options) {
  const res = findSchedulableMatrix(size, options);
  if (!res.success) return null;
  return getTargetPlan(res);
}

/**
 * Crea un piano player-aware per un deal G=N specifico.
 * Input: size, hands (array di array di card objects con .uid)
 * Usa una griglia Livello A + ricerca di ordine di riempimento (Livello B)
 * filtrato per ownership delle mani + simulazione burst/turni/passi.
 * Ritorna piano come array di {x,y,card,cellIdx,holderId} ordinato per sequenza fattibile,
 * oppure null se nessun ordine ownership-compatible trovato (fallback a piano generico).
 */
function createPlayerAwarePlanForDeal(size, hands, options) {
  options = options || {};
  const maxNodes = options.maxNodes || 2_000_000;
  const gridRes = findOneSolutionForSize(size, { maxNodes: options.maxNodesA || 20_000_000 });
  if (!gridRes || !gridRes.found || !gridRes.grid) {
    return null;
  }

  const n = size * size;
  const uidForCell = new Array(n);
  const cardForCell = new Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = gridRes.grid[y][x];
      const c = gridRes.cards[idx];
      const cell = y * size + x;
      uidForCell[cell] = c.uid;
      cardForCell[cell] = c;
    }
  }

  const holderOf = new Map();
  const nPlayers = Math.max(size, (hands || []).length);
  for (let p = 0; p < nPlayers; p++) {
    const hand = (hands && hands[p]) || [];
    for (const c of hand) {
      if (c && c.uid != null) holderOf.set(c.uid, p);
    }
  }

  const neigh = buildNeighbors(size);
  let stats = { nodes: 0 };
  let bestOrder = null;

  function dfs(filled, order, burstStep, player, direction, firstDone, passes) {
    stats.nodes++;
    if (stats.nodes > maxNodes) return "budget";
    if (order.length === n) {
      bestOrder = order.slice();
      return "solved";
    }

    const req = burstStep + 1;

    // candidates: frontier + support + owned by current virtual player
    const candidates = [];
    for (let c = 0; c < n; c++) {
      if (filled.has(c)) continue;
      let sup = 0;
      for (const nb of neigh[c]) if (filled.has(nb)) sup++;
      if (order.length > 0 && sup < req) continue;
      const uid = uidForCell[c];
      if (holderOf.get(uid) === player) {
        candidates.push({ cell: c, support: sup });
      }
    }

    candidates.sort((a, b) => b.support - a.support || a.cell - b.cell);

    for (const cand of candidates) {
      const c = cand.cell;
      filled.add(c);
      order.push(c);

      const x = c % size;
      const y = Math.floor(c / size);

      let newDir = direction;
      let newFirst = firstDone;

      // approx flip on potential close (first axis or full span) - sufficient for guiding 4x4
      if (!newFirst) {
        // heuristic: any placement may contribute; actual close detected later in game
        // leave dir mostly +1, rely on pass allowance for alignment
      }

      const newBurst = burstStep + 1;
      let outcome;
      if (newBurst < 4) {
        outcome = dfs(filled, order, newBurst, player, newDir, newFirst, passes);
        if (outcome === "solved") return "solved";
        if (outcome === "budget") return "budget";

        const nextP = (player + newDir + size) % size;
        outcome = dfs(filled, order, 0, nextP, newDir, newFirst, passes);
        if (outcome === "solved") return "solved";
        if (outcome === "budget") return "budget";
      } else {
        const nextP = (player + newDir + size) % size;
        outcome = dfs(filled, order, 0, nextP, newDir, newFirst, passes);
        if (outcome === "solved") return "solved";
        if (outcome === "budget") return "budget";
      }

      order.pop();
      filled.delete(c);
    }

    // allow PASS at turn start (models "skip this player this round")
    if (burstStep === 0 && passes < size * 2) {
      const nextP = (player + direction + size) % size;
      const outcome = dfs(filled, order, 0, nextP, direction, firstDone, passes + 1);
      if (outcome === "solved") return "solved";
      if (outcome === "budget") return "budget";
    }

    return "dead";
  }

  // Try different virtual starting players (cycle is circular; passes help align)
  for (let startP = 0; startP < size && !bestOrder; startP++) {
    const starts = [];
    for (let c = 0; c < n; c++) {
      if (holderOf.get(uidForCell[c]) === startP) {
        starts.push(c);
        if (starts.length >= 6) break;
      }
    }
    // prefer central starts
    starts.sort((a, b) => {
      const da = Math.abs((a % size) - (size / 2)) + Math.abs(Math.floor(a / size) - (size / 2));
      const db = Math.abs((b % size) - (size / 2)) + Math.abs(Math.floor(b / size) - (size / 2));
      return da - db;
    });

    for (const start of starts) {
      const filled = new Set([start]);
      const order = [start];
      const res = dfs(filled, order, 0, startP, 1, false, 0);
      if (bestOrder) break;
      if (res === "budget") break;
    }
  }

  if (!bestOrder) return null;

  // build plan in same shape as generic targetPlan + holderId
  const plan = [];
  for (const cellIdx of bestOrder) {
    const x = cellIdx % size;
    const y = Math.floor(cellIdx / size);
    const card = cardForCell[cellIdx];
    const holderId = holderOf.get(card.uid);
    plan.push({ x, y, card, cellIdx, holderId });
  }
  return plan;
}

const DurissimaMatrixSolver = {
  findOneSolutionForSize,
  isValidGridLabeling,
  findSchedulableAssembly,
  findSchedulableMatrix,
  getTargetPlan,
  createTargetPlanForSize,
  createPlayerAwarePlanForDeal,
  formatGrid,
  deckForSize
};
// CLI semplice per test rapido:
// node scripts/durissima-matrix-solver.js 4

globalThis.DurissimaMatrixSolver = DurissimaMatrixSolver;
}

{

/**
 * durissima-gn-decoupled-oracle.js
 *
 * New approach: Decoupled Geometric + Burst Plan (A+B) then Schedule Check (C).
 *
 * Idea:
 * 1. Generate a candidate assembly (total order + burst groups) using the fast A+B solver.
 *    This gives a valid geometric filling + valid way to chunk into turns of 1-4 respecting req and growth.
 * 2. For this fixed assembly, simulate the dynamic player sequence (starting player 0, direction +1, flips when lines complete during the sequence).
 * 3. For each burst group in the assembly, check if *all* cards in that group belong to the player who is supposed to play that burst.
 *
 * If yes, this particular plan is playable for the given deal/hands.
 *
 * This is "plan the board and the chunks first (easy), then see if the chunks are owned by the right players in the induced schedule".
 *
 * Much cheaper than joint search over placements + hands + turns.
 *
 * For a deal, we can generate several different assemblies (different starting cells or random choices in B) and see if any matches the hands.
 *
 * This is a classic "generate candidate plans then validate against resources/agents".
 */

const matrixSolver = globalThis.DurissimaMatrixSolver;

/**
 * Simulate the player for each burst in the assembly, applying flips when rows/cols complete.
 * Returns list of players for each burst (one per group in assembly.turns).
 */
function computePlayersForBursts(assembly, size, numPlayers) {
  if (!assembly || !assembly.turns) return null;
  const G = numPlayers || size;

  const rowCount = new Array(size).fill(0);
  const colCount = new Array(size).fill(0);
  const rowComplete = new Array(size).fill(false);
  const colComplete = new Array(size).fill(false);

  let firstAxisDone = false;
  let dmClosed = false;
  let direction = 1;
  let currentPlayer = 0;

  const burstPlayers = [];

  let globalStep = 0;

  for (const burst of assembly.turns) {
    burstPlayers.push(currentPlayer);

    // Simulate the cells in this burst for completions
    for (const cellIdx of burst) {
      const x = cellIdx % size;
      const y = Math.floor(cellIdx / size);

      rowCount[y]++;
      colCount[x]++;

      // Check for first axis
      if (!firstAxisDone) {
        if (rowCount[y] === size && !rowComplete[y]) {
          firstAxisDone = true;
          direction = -direction;
        } else if (colCount[x] === size && !colComplete[x]) {
          firstAxisDone = true;
          direction = -direction;
        }
      }

      // Mark complete
      if (rowCount[y] === size) rowComplete[y] = true;
      if (colCount[x] === size) colComplete[x] = true;

      // Check for DM close (both dimensions have at least one complete line)
      if (!dmClosed && firstAxisDone) {
        const hasRow = rowComplete.some(Boolean);
        const hasCol = colComplete.some(Boolean);
        if (hasRow && hasCol) {
          dmClosed = true;
          direction = -direction;
        }
      }

      globalStep++;
    }

    // After the burst, advance to next player according to current direction
    currentPlayer = (currentPlayer + direction + G) % G;
  }

  return burstPlayers;
}

/**
 * Check if a given assembly (with bursts) is playable for the hands in the deal.
 * Relaxed version: after each burst we can skip 0..G-2 players (full pass turns) to reach the owner of the next burst.
 */
function isAssemblyPlayable(assemblyResult, dealState) {
  if (!assemblyResult || !assemblyResult.success) return false;
  const size = assemblyResult.size;
  const plan = matrixSolver.getTargetPlan(assemblyResult);
  if (!plan) return false;

  const hands = dealState.hands || [];
  const G = dealState.players || hands.length || size;

  // Use the base player sequence as starting point, but allow skips
  const baseBurstPlayers = computePlayersForBursts(assemblyResult.assembly, size, G);
  if (!baseBurstPlayers) return false;

  // For relaxed check we ignore the exact base and just verify there exists a schedule with skips
  // Simpler: simulate with possible skips
  let planIdx = 0;
  let curP = 0;
  let dir = 1;
  // We don't simulate full DM here for the relaxed check; we just check ownership feasibility with skips

  for (let b = 0; b < (assemblyResult.assembly.turns || []).length; b++) {
    const burstSize = assemblyResult.assembly.turns[b].length;
    let assigned = false;
    // Try landing on a player that owns the whole next burst, by skipping
    for (let skip = 0; skip < G; skip++) {
      const candidateP = (curP + skip + G) % G;
      let allOwned = true;
      for (let j = 0; j < burstSize; j++) {
        const step = plan[planIdx + j];
        const card = step.card;
        if (!hands[candidateP] || !hands[candidateP].some(c => c.uid === card.uid)) {
          allOwned = false;
          break;
        }
      }
      if (allOwned) {
        planIdx += burstSize;
        curP = (candidateP + 1 + G) % G;  // advance after the burst
        assigned = true;
        break;
      }
    }
    if (!assigned) return false;
  }

  return true;
}

/**
 * Try to find if the deal is solvable by testing several different A+B assemblies.
 */
function solveDealDecoupled(dealState, numTries = 20) {
  const size = dealState.size;
  const results = [];

  for (let t = 0; t < numTries; t++) {
    // Generate a (possibly different) assembly by using different starting heuristics or just call multiple times
    // For now, call the generator; in future we can randomize starts or morph in the B scheduler.
    const asm = matrixSolver.findSchedulableMatrix(size, {
      maxNodesA: 20000000,
      maxNodesB: 3000000
    });

    if (!asm.success) continue;

    const playable = isAssemblyPlayable(asm, dealState);
    results.push({ playable, asmStats: { aNodes: asm.levelAStats ? asm.levelAStats.nodes : 0 } });

    if (playable) {
      return { solved: true, tries: t + 1, results };
    }
  }

  return { solved: false, tries: numTries, results };
}

/**
 * Compute solvability rate over several deals using the decoupled checker.
 */
function runDecoupledRate(size, numDeals, options = {}) {
  const baseSeed = options.baseSeed || 0;
  const numTriesPerDeal = options.numTriesPerDeal || 30;

  let solved = 0;
  const details = [];

  for (let i = 0; i < numDeals; i++) {
    const seed = baseSeed + i;
    const deal = buildDeal(size, seed);
    const res = solveDealDecoupled(deal, numTriesPerDeal);
    if (res.solved) solved++;
    details.push({ seed, solved: res.solved, tries: res.tries });
    if (options.verbose) {
      console.log(`seed ${seed}: ${res.solved ? "SOLVED" : "not"} after ${res.tries} tries`);
    }
  }

  return {
    size,
    numDeals,
    solved,
    rate: (solved / numDeals * 100).toFixed(1) + "%",
    details
  };
}

/**
 * Given a flat sequence of cell indices (in placement order), and the hands,
 * search if there exists a way to chunk it into bursts of 1-4 such that:
 * - Each burst's cards are all owned by the player who has that burst.
 * - Flips are correctly applied as lines complete during the sequence.
 *
 * This is the "burst-boundary search" for a fixed geometric plan.
 */
function isFlatSequenceSchedulableForDeal(flatSequence, size, hands) {
  const n = size * size;
  if (flatSequence.length !== n) return false;

  // Precompute card for each cell in sequence (we will use indices for simplicity; map to uids if needed)
  // Assume flatSequence is list of cellIdx, and we have a way to know which card is at that cell.
  // For this, we need the grid. For now, this function will be called with additional grid info.
  // To make standalone, the caller will provide a map cell -> cardUid or we pass the full plan.

  // For implementation, let's assume we are passed the ordered list of card uids directly, and a way to know (x,y) for flip simulation.
  // Better: pass ordered list of {cellIdx, cardUid}
  // But to simplify for this file, we'll make a version that takes orderedCells (list of cellIdx) and a grid (2d array of cardUid or index), and hands as sets of cardUids.

  // This function is the core searcher.
  // For the prototype, we implement the logic assuming we have:
  // - orderedCells: array of cellIdx in the order they are placed
  // - cardForCell: array[cellIdx] = cardUid
  // - hands: array of Set<cardUid>

  // The function below is the searcher.

  return false; // placeholder, real impl below in the full function
}

/**
 * Cerca chunking della sequenza flat in burst 1-4 mono-owner, con schedule giocatori corretto.
 * Ritorna {success: true, bursts: Array<{player, cells: number[]}> } se trova, altrimenti {success:false}.
 * cells sono gli indici flat nella sequenza.
 */
function searchBurstBoundaries(orderedCells, cardForCell, size, hands) {
  const n = size * size;
  if (!orderedCells || orderedCells.length !== n) return { success: false };

  function dfs(pos, curPlayer, direction, firstDone, dmDone, rowC, colC, rowF, colF, currentBursts) {
    if (pos === n) {
      return { success: true, bursts: currentBursts };
    }

    const maxK = Math.min(4, n - pos);

    for (let k = 1; k <= maxK; k++) {
      let ok = true;
      const burstCells = [];
      for (let j = 0; j < k; j++) {
        const cell = orderedCells[pos + j];
        burstCells.push(cell);
        const uid = cardForCell[cell];
        if (!hands[curPlayer] || !hands[curPlayer].has(uid)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      // simula
      let newRow = rowC.slice();
      let newCol = colC.slice();
      let newRowF = rowF.slice();
      let newColF = colF.slice();
      let newFirst = firstDone;
      let newDm = dmDone;
      let newDir = direction;

      for (let j = 0; j < k; j++) {
        const cell = orderedCells[pos + j];
        const x = cell % size;
        const y = Math.floor(cell / size);
        newRow[y] += 1;
        newCol[x] += 1;
        if (!newFirst) {
          if ((newRow[y] === size && !newRowF[y]) || (newCol[x] === size && !newColF[x])) {
            newFirst = true;
            newDir = -newDir;
          }
        }
        if (newRow[y] === size) newRowF[y] = true;
        if (newCol[x] === size) newColF[x] = true;
        if (!newDm && newFirst) {
          if (newRowF.some(Boolean) && newColF.some(Boolean)) {
            newDm = true;
            newDir = -newDir;
          }
        }
      }

      const newBursts = currentBursts.concat([{ player: curPlayer, cells: burstCells }]);

      // After burst, allow skipping 0 to G-2 players (pass their turns) to reach the owner for the next burst
      let found = false;
      for (let sk = 0; sk < size - 1; sk++) {
        const landed = (curPlayer + newDir * (1 + sk) + size * 10) % size;  // approximate advance with skips
        // Try the next k for this landed player (we already checked ownership in the k loop? No, we check here for the next)
        // Since we are deciding the next burst now, we will check in the next recursive call.
        // For simplicity, just advance by 1 + sk and let the next iteration check ownership for its k.
        const nextP = (curPlayer + newDir * (1 + sk) + size) % size;
        const res = dfs(pos + k, nextP, newDir, newFirst, newDm, newRow, newCol, newRowF, newColF, newBursts);
        if (res.success) return res;
      }
    }

    return { success: false };
  }

  const initRow = new Array(size).fill(0);
  const initCol = new Array(size).fill(0);
  const initRF = new Array(size).fill(false);
  const initCF = new Array(size).fill(false);

  return dfs(0, 0, 1, false, false, initRow, initCol, initRF, initCF, []);
}

// Export the key function

/**
 * Cerca un piano "perfetto" (assembly validato per le mani) e restituisce uno script followable.
 * Ritorna { success: true, script: [{player, x, y, card}, ...], assembly, burstPlayers } o {success:false}
 * Lo script è la sequenza lineare di pose con il giocatore scheduled.
 */
function findPerfectPlanForDeal(dealState, maxTries = 100) {
  const size = dealState.size;
  const G = dealState.players || (dealState.hands && dealState.hands.length) || size;
  const handsSets = (dealState.hands || []).map(h => new Set((h || []).map(c => c.uid)));

  for (let t = 0; t < maxTries; t++) {
    const asm = matrixSolver.findSchedulableMatrix(size, {
      maxNodesA: 20000000,
      maxNodesB: 5000000
    });
    if (!asm || !asm.success || !asm.grid) continue;

    // 1. Natural assembly
    if (isAssemblyPlayable(asm, dealState)) {
      const plan = matrixSolver.getTargetPlan(asm);
      const burstPlayers = computePlayersForBursts(asm.assembly, size, G);
      if (plan && burstPlayers) {
        const script = [];
        let idx = 0;
        for (let b = 0; b < burstPlayers.length; b++) {
          const p = burstPlayers[b];
          const burst = asm.assembly.turns[b] || [];
          for (let j = 0; j < burst.length; j++) {
            const step = plan[idx++];
            script.push({ player: p, x: step.x, y: step.y, card: step.card });
          }
        }
        return { success: true, script, assembly: asm, burstPlayers };
      }
    }

    // 2. Use boundary search with full simulation to find chunking that matches owners and produces correct player sequence.
    const flat = (asm.assembly && asm.assembly.sequence) ? asm.assembly.sequence : null;
    if (flat && flat.length === size * size) {
      const cardForCell = new Array(size * size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const cidx = asm.grid[y][x];
        cardForCell[y * size + x] = asm.cards[cidx].uid;
      }
      const boundaryRes = searchBurstBoundaries(flat, cardForCell, size, handsSets);
      if (boundaryRes.success && boundaryRes.bursts && boundaryRes.bursts.length > 0) {
        const script = [];
        for (const burst of boundaryRes.bursts) {
          for (const cell of burst.cells) {
            const x = cell % size;
            const y = Math.floor(cell / size);
            let cardObj = null;
            for (const c of asm.cards) {
              if (c.uid === cardForCell[cell]) { cardObj = c; break; }
            }
            if (cardObj) {
              script.push({ player: burst.player, x, y, card: cardObj });
            }
          }
        }
        if (script.length === size * size) {
          return { success: true, script, assembly: asm, via: "boundary-sim" };
        }
      }
    }
  }
  return { success: false };
}


// To use:
// 1. Get a flat orderedCells from a matrix assembly
// 2. Build cardForCell from the grid
// 3. Build hands as array of Set<cardUid>
// 4. Call searchBurstBoundaries(orderedCells, cardForCell, size, hands)




const DurissimaGnDecoupledOracle = { findPerfectPlanForDeal, isAssemblyPlayable, computePlayersForBursts };
globalThis.DurissimaGnDecoupledOracle = DurissimaGnDecoupledOracle;
}
  globalThis.__DM_COORDINATOR_BROWSER__ = true;
})();
