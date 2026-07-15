"use strict";

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

const path = require("node:path");
const { Worker } = require("worker_threads");
const os = require("os");

const countLib = require("./deck-grid-solution-count-lib");
const { findOneSolutionForSize, buildNeighbors } = countLib;

require(path.join(__dirname, "..", "mpcards-core.js"));
const core = globalThis.MPCardsCore;

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

module.exports = {
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
if (require.main === module) {
  const size = parseInt(process.argv[2] || "4", 10);
  console.log(`Ricerco matrice schedulabile ${size}x${size} ...`);
  const res = findSchedulableMatrix(size, { maxNodesA: 20_000_000, maxNodesB: 3_000_000 });
  if (res.success) {
    console.log("SUCCESSO!");
    console.log("Griglia (esempio):");
    console.log(formatGrid(res.grid, res.cards));
    console.log("Primi turni assemblaggio (cell indices):", res.assembly.turns.slice(0, 3));
    console.log("Stats A:", res.levelAStats);
    console.log("Stats B:", res.levelBStats);
  } else {
    console.log("NON TROVATO in budget:", res.reason || res);
  }
}