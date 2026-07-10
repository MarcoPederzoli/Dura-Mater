"use strict";

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

const matrixSolver = require("./durissima-matrix-solver");
const gnLib = require("./durissima-gn-solver-lib");

function buildDeal(size, seed) {
  return gnLib.buildGnDeal(size, seed);
}

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
module.exports.searchBurstBoundaries = searchBurstBoundaries;

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

module.exports.findPerfectPlanForDeal = findPerfectPlanForDeal;
module.exports.isAssemblyPlayable = isAssemblyPlayable;
module.exports.computePlayersForBursts = computePlayersForBursts;

// To use:
// 1. Get a flat orderedCells from a matrix assembly
// 2. Build cardForCell from the grid
// 3. Build hands as array of Set<cardUid>
// 4. Call searchBurstBoundaries(orderedCells, cardForCell, size, hands)



// CLI for quick test
// node scripts/durissima-gn-decoupled-oracle.js 7 5
if (require.main === module) {
  const size = parseInt(process.argv[2] || "7", 10);
  const num = parseInt(process.argv[3] || "5", 10);
  console.log(`Decoupled Oracle Rate — size=${size} deals=${num}`);
  const sum = runDecoupledRate(size, num, { verbose: true, baseSeed: 42, numTriesPerDeal: 20 });
  console.log("Final:", sum.rate, "solved", sum.solved + "/" + sum.numDeals);
}
