"use strict";

const path = require("path");

require(path.join(__dirname, "..", "mpcards-core.js"));

const core = globalThis.MPCardsCore;
const deck = core.simulationDeck();

function cellCategory(size, players) {
  if (players === 1) return "solitario";
  if (players === size) return "G=N";
  if (players < size) return "sotto-G";
  return "overcrowd";
}

function simOptionsForCell(L, G, variant) {
  const strategy = G === 1
    ? "durissima-planner"
    : (G === L ? "durissima-global-planner" : "durissima-team-planner");
  const base = {
    size: L,
    players: G,
    strategies: Array.from({ length: G }, () => strategy),
    durissimaMater: true,
    randomizeTurnOrder: true
  };
  if (variant === "hand-cap" || variant === "hand-cap-2n") {
    return {
      ...base,
      durissimaHandDrawCap: true,
      durissimaHandDrawCapFactor: variant === "hand-cap-2n" ? 2 : undefined,
      durissimaVitaExtraEnabled: false,
      durissimaSelectiveReshuffle: false
    };
  }
  if (variant === "free-draw-n-reshuffle") {
    return {
      ...base,
      durissimaCompetitiveDraw: true,
      durissimaSelectiveReshuffle: true
    };
  }
  if (variant === "scarti-n-reshuffle") {
    return {
      ...base,
      durissimaScartiNReshuffle: true
    };
  }
  return base;
}

function runCellChunk(task) {
  const { L, G, count, seedTag, chunkIndex, variant } = task;
  const key = `${L}x${G}`;
  const random = core.mulberry32(core.hashSeed(`${seedTag}:${L}:${G}:${chunkIndex}`));
  const base = simOptionsForCell(L, G, variant);

  const stats = {
    done: 0,
    stalls: 0,
    wins: 0,
    vitaUsedSum: 0,
    vitaPoolRemainSum: 0,
    discardRecyclesUsedSum: 0,
    turnSum: 0
  };

  for (let i = 0; i < count; i++) {
    const result = core.simulateGame(deck, { ...base, random });
    stats.done++;
    stats.turnSum += result.turns || 0;
    stats.vitaUsedSum += result.durissimaVitaExtraUsed || 0;
    stats.vitaPoolRemainSum += result.durissimaVitaExtraPoolRemaining || 0;
    stats.discardRecyclesUsedSum += result.durissimaDiscardRecyclesUsed || 0;
    if (result.status === "success") stats.wins++;
    else stats.stalls++;
  }

  const deal = core.computeInitialDeal(L, G);
  return {
    L,
    G,
    key,
    chunkIndex,
    category: cellCategory(L, G),
    initialHandSize: deal.cardsPerPlayer,
    initialDrawCount: deal.drawCount,
    overcrowdedDeal: deal.overcrowded,
    ...stats
  };
}

function mergeChunkResults(chunks) {
  const byKey = new Map();
  for (const chunk of chunks) {
    const prev = byKey.get(chunk.key);
    if (!prev) {
      byKey.set(chunk.key, {
        cell: chunk.key,
        L: chunk.L,
        G: chunk.G,
        category: chunk.category,
        initialHandSize: chunk.initialHandSize,
        initialDrawCount: chunk.initialDrawCount,
        overcrowdedDeal: chunk.overcrowdedDeal,
        done: 0,
        stalls: 0,
        wins: 0,
        vitaUsedSum: 0,
        vitaPoolRemainSum: 0,
        discardRecyclesUsedSum: 0,
        turnSum: 0
      });
    }
    const agg = byKey.get(chunk.key);
    agg.done += chunk.done;
    agg.stalls += chunk.stalls;
    agg.wins += chunk.wins;
    agg.vitaUsedSum += chunk.vitaUsedSum;
    agg.vitaPoolRemainSum += chunk.vitaPoolRemainSum;
    agg.discardRecyclesUsedSum += chunk.discardRecyclesUsedSum || 0;
    agg.turnSum += chunk.turnSum;
  }
  return byKey;
}

function buildChunkTasks(cells, count, seedTag, chunks) {
  const tasks = [];
  const chunkCount = Math.max(1, Math.floor(chunks));
  for (const [L, G] of cells) {
    let remaining = count;
    for (let c = 0; c < chunkCount; c++) {
      const take = c === chunkCount - 1
        ? remaining
        : Math.floor(count / chunkCount);
      remaining -= take;
      if (take <= 0) continue;
      tasks.push({ L, G, count: take, seedTag, chunkIndex: c });
    }
  }
  return tasks;
}

module.exports = {
  cellCategory,
  simOptionsForCell,
  runCellChunk,
  mergeChunkResults,
  buildChunkTasks
};