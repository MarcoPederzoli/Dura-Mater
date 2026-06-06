"use strict";

const MPCARDS_CORE_SOURCE = `
(function () {
  "use strict";

  const VALUES = ["1", "2", "3", "4", "5", "6", "7", "8"];
  const SHAPES = ["Cerchi", "Cuori", "Triangoli", "Quadrati", "Stelle", "Esagoni", "Lampi", "Croci"];
  const COLORS = ["Rosso", "Arancio", "Giallo", "Verde", "Azzurro", "Blu", "Viola", "Bianco"];
  const SIM_DECK_CODES = [
    118, 227, 238, 247, 328, 336, 348, 356, 367, 428, 437, 445, 456, 467, 478, 486,
    538, 548, 554, 564, 575, 577, 588, 586, 587, 637, 646, 655, 666, 663, 675, 678,
    674, 688, 687, 684, 747, 757, 758, 768, 766, 765, 776, 772, 773, 782, 784, 785,
    783, 846, 858, 857, 856, 868, 865, 864, 875, 874, 873, 877, 883, 885, 882, 881
  ];
  const STRATEGIES = [
    ["high-value", "A - Valori alti", "A"],
    ["low-value", "B - Valori bassi", "B"],
    ["compatibility", "M - Compatibilita'", "M"],
    ["greedy", "C - Minimizza caratteristiche condivise", "C"],
    ["adjacent", "D - Minimizza adiacenze", "D"],
    ["draw-random-finish-random", "E - Pesca una, finale casuale", "E"],
    ["planner", "P - Pianifica fino a 4 pose", "P"],
    ["hand-planner", "H - Mano ampia: pianifica, altrimenti M", "H"],
    ["prudent", "U - Pianifica ma chiude se la sequenza si blocca", "U"],
    ["chain-max", "F - Massimizza carte giocate nel turno", "F"],
    ["random", "R - Casuale legale", "R"],
    ["auto", "Auto a partita", "Auto"]
  ];
  const STRATEGY_KEYS = [
    "random", "greedy", "adjacent", "draw-random-finish-random", "low-value", "high-value", "compatibility",
    "planner", "hand-planner", "prudent", "chain-max"
  ];
  const PLANNER_BRANCH_LIMIT = 10;
  const PLANNER_MAX_NODES = 280;
  const POSITIONAL_COUNTS = [1, 3, 5, 7, 9, 11, 13, 15];
  const MAX_PLAYERS = 21;
  const MIN_INITIAL_HAND = 3;

  function hashSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(items, random) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  function decodeCardCode(code, index) {
    const text = String(code).padStart(3, "0");
    const valueIndex = Number(text[0]) - 1; // 1a cifra: VALORE (1–8)
    const shapeIndex = Number(text[1]) - 1; // 2a cifra: FORMA (1–8)
    const colorIndex = Number(text[2]) - 1; // 3a cifra: COLORE (1–8)
    if (
      !Number.isInteger(valueIndex) || valueIndex < 0 || valueIndex >= VALUES.length ||
      !Number.isInteger(shapeIndex) || shapeIndex < 0 || shapeIndex >= SHAPES.length ||
      !Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex >= COLORS.length
    ) {
      throw new Error("Codice carta non valido: " + code);
    }
    return {
      uid: text + "-" + index,
      code: text,
      value: VALUES[valueIndex],
      shape: SHAPES[shapeIndex],
      color: COLORS[colorIndex]
    };
  }

  function simulationDeck() {
    return SIM_DECK_CODES.map(decodeCardCode);
  }

  function deckCodesText(codes) {
    return (codes || SIM_DECK_CODES).map(code => String(code).padStart(3, "0")).join(",");
  }

  function parseDeckCodes(text) {
    const codes = String(text || "")
      .split(/[\s,;]+/)
      .map(item => item.trim())
      .filter(Boolean);
    if (codes.length !== 64) {
      throw new Error("Il mazzo deve contenere 64 codici carta; trovati " + codes.length + ".");
    }
    return codes.map(decodeCardCode);
  }

  function cloneCardForGame(card, index) {
    return {
      uid: card.code + "-" + index,
      code: card.code,
      value: card.value,
      shape: card.shape,
      color: card.color
    };
  }

  function coordKey(x, y) {
    return x + "," + y;
  }

  function boardMap(entries) {
    const map = new Map();
    for (const entry of entries) map.set(coordKey(entry.x, entry.y), entry);
    return map;
  }

  function boardBounds(entries, extra) {
    const points = extra ? entries.concat(extra) : entries;
    if (points.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  function boardFootprint(state) {
    if (!state || state.board.length === 0) {
      return { width: 0, height: 0, atWidthLimit: false, atHeightLimit: false, atAreaLimit: false };
    }
    const bounds = boardBounds(state.board);
    const size = state.size;
    const atWidthLimit = bounds.width >= size;
    const atHeightLimit = bounds.height >= size;
    return {
      width: bounds.width,
      height: bounds.height,
      atWidthLimit,
      atHeightLimit,
      atAreaLimit: atWidthLimit && atHeightLimit
    };
  }

  function isDuraMaterDelimited(state) {
    return boardFootprint(state).atAreaLimit;
  }

  function defaultTurnOrder(players) {
    return Array.from({ length: players }, (_, index) => index);
  }

  function randomInitialTurnOrder(players, random) {
    const start = Math.floor(random() * players);
    return Array.from({ length: players }, (_, step) => (start + step) % players);
  }

  /** @deprecated Usare turnDirection; mantenuto per test legacy. */
  function invertedTurnOrder(players, closerId) {
    const order = [];
    for (let step = 0; step < players; step++) {
      order.push((closerId - step + players) % players);
    }
    return order;
  }

  function ensureTurnOrder(state) {
    if (!state.turnOrder || state.turnOrder.length !== state.players) {
      state.turnOrder = state.initialTurnOrder
        ? state.initialTurnOrder.slice()
        : defaultTurnOrder(state.players);
    }
    return state.turnOrder;
  }

  function toggleTurnDirection(state) {
    state.turnDirection = state.turnDirection === -1 ? 1 : -1;
  }

  function maxLineRun(board, horizontal) {
    if (!board.length) return 0;
    const groups = new Map();
    for (const entry of board) {
      const key = horizontal ? entry.y : entry.x;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(horizontal ? entry.x : entry.y);
    }
    let best = 0;
    for (const coords of groups.values()) {
      coords.sort((a, b) => a - b);
      let run = 1;
      let localBest = 1;
      for (let index = 1; index < coords.length; index++) {
        if (coords[index] === coords[index - 1] + 1) {
          run++;
          localBest = Math.max(localBest, run);
        } else {
          run = 1;
        }
      }
      best = Math.max(best, localBest);
    }
    return best;
  }

  function syncAxisLocksFromBoard(state) {
    const size = state.size;
    state.widthAxisFixed = maxLineRun(state.board, true) >= size;
    state.heightAxisFixed = maxLineRun(state.board, false) >= size;
  }

  function handleTurnOrderAfterPlacement(state, closerId, before) {
    syncAxisLocksFromBoard(state);
    const hadAxis = before.widthAxisFixed || before.heightAxisFixed;
    const hasAxis = state.widthAxisFixed || state.heightAxisFixed;

    if (!state.firstAxisInversionDone && hasAxis && !hadAxis) {
      state.firstAxisInversionDone = true;
      toggleTurnDirection(state);
    }

    if (!state.duraMaterClosed && isDuraMaterDelimited(state)) {
      state.duraMaterClosed = true;
      state.closedByPlayer = closerId;
      toggleTurnDirection(state);
    }
  }

  function nextPlayerId(state) {
    const order = ensureTurnOrder(state);
    const index = order.indexOf(state.currentPlayer);
    if (index < 0) return order[0];
    const step = state.turnDirection === -1 ? -1 : 1;
    const nextIndex = (index + step + order.length) % order.length;
    return order[nextIndex];
  }

  function maybeCloseDuraMater(state, closerId) {
    if (!state || state.duraMaterClosed || !isDuraMaterDelimited(state)) return false;
    const before = {
      widthAxisFixed: state.widthAxisFixed === true,
      heightAxisFixed: state.heightAxisFixed === true
    };
    handleTurnOrderAfterPlacement(state, closerId, before);
    return state.duraMaterClosed;
  }

  function sharedProperties(a, b) {
    let total = 0;
    if (a.value === b.value) total++;
    if (a.shape === b.shape) total++;
    if (a.color === b.color) total++;
    return total;
  }

  function compatibilityScore(card) {
    return String(card.code)
      .padStart(3, "0")
      .slice(0, 3)
      .split("")
      .reduce((total, digit) => total + (POSITIONAL_COUNTS[Number(digit) - 1] || 0), 0);
  }

  function candidateCells(state) {
    if (state.board.length === 0) return [{ x: 0, y: 0 }];
    const map = boardMap(state.board);
    const cells = new Map();
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const entry of state.board) {
      for (const dir of dirs) {
        const x = entry.x + dir.x;
        const y = entry.y + dir.y;
        const key = coordKey(x, y);
        if (!map.has(key)) cells.set(key, { x, y });
      }
    }
    return Array.from(cells.values());
  }

  function placementScore(state, card, x, y) {
    const map = boardMap(state.board);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    let matches = 0;
    let neighbors = 0;
    let compatibleNeighbors = 0;
    for (const dir of dirs) {
      const adjacent = map.get(coordKey(x + dir.x, y + dir.y));
      if (!adjacent) continue;
      neighbors++;
      const shared = sharedProperties(card, adjacent.card);
      matches += shared;
      if (shared > 0) compatibleNeighbors++;
    }
    return { matches, neighbors, compatibleNeighbors };
  }

  function legalPlacements(state, playerId, requirement) {
    const hand = state.hands[playerId] || [];
    const moves = [];
    const map = boardMap(state.board);
    for (const cell of candidateCells(state)) {
      if (map.has(coordKey(cell.x, cell.y))) continue;
      const bounds = boardBounds(state.board, [{ x: cell.x, y: cell.y }]);
      if (bounds.width > state.size || bounds.height > state.size) continue;
      for (const card of hand) {
        const score = placementScore(state, card, cell.x, cell.y);
        if (state.board.length === 0 || (score.neighbors >= requirement && score.compatibleNeighbors === score.neighbors)) {
          moves.push({ cardUid: card.uid, card, x: cell.x, y: cell.y, matches: score.matches, neighbors: score.neighbors, compatibleNeighbors: score.compatibleNeighbors });
        }
      }
    }
    return moves;
  }

  function cloneCardSnapshot(card) {
    return {
      uid: card.uid,
      code: card.code,
      value: card.value,
      shape: card.shape,
      color: card.color
    };
  }

  function cloneSimState(source, playerId) {
    const hand = source.hands[playerId] || [];
    const hands = [];
    hands[playerId] = hand.map(cloneCardSnapshot);
    return {
      size: source.size,
      board: source.board.map(entry => ({
        x: entry.x,
        y: entry.y,
        playerId: entry.playerId,
        card: cloneCardSnapshot(entry.card)
      })),
      hands,
      turnPlayed: source.turnPlayed
    };
  }

  function applyPlacementSim(sim, playerId, move) {
    const hand = sim.hands[playerId];
    if (!hand) return false;
    const cardIndex = hand.findIndex(card => card.uid === move.cardUid);
    if (cardIndex < 0) return false;
    const card = hand.splice(cardIndex, 1)[0];
    sim.board.push({ x: move.x, y: move.y, card, playerId });
    sim.turnPlayed++;
    return true;
  }

  function placementRequirement(state) {
    if (state.turnPlayed >= 4) return 1;
    return state.turnPlayed + 1;
  }

  function canOfferIdea(state, playerId) {
    return (
      state.status === "playing" &&
      state.turnPlayed === 4 &&
      (state.hands[playerId] || []).length > 0
    );
  }

  function maxChainPlays(sim, playerId, branchLimit, random, budget) {
    if (budget.count >= budget.max) return sim.turnPlayed;
    budget.count++;
    if (sim.turnPlayed >= 5) return sim.turnPlayed;
    const hand = sim.hands[playerId] || [];
    const requirement = sim.turnPlayed < 4
      ? sim.turnPlayed + 1
      : (sim.turnPlayed === 4 && hand.length ? 1 : 99);
    if (requirement > 4 && requirement !== 1) return sim.turnPlayed;
    const moves = legalPlacements(sim, playerId, requirement);
    if (!moves.length) return sim.turnPlayed;
    let best = sim.turnPlayed;
    const sample = moves.length > branchLimit ? shuffle(moves, random).slice(0, branchLimit) : moves;
    for (const move of sample) {
      if (budget.count >= budget.max) break;
      const next = cloneSimState(sim, playerId);
      if (!applyPlacementSim(next, playerId, move)) continue;
      const depth = maxChainPlays(next, playerId, branchLimit, random, budget);
      if (depth > best) best = depth;
      if (best >= 5) return 5;
    }
    return best;
  }

  function quickFollowUpScore(sim, playerId) {
    if (sim.turnPlayed >= 5) return 0;
    const hand = sim.hands[playerId] || [];
    const requirement = sim.turnPlayed < 4
      ? sim.turnPlayed + 1
      : (sim.turnPlayed === 4 && hand.length ? 1 : 99);
    if (requirement > 4 && requirement !== 1) return 0;
    return legalPlacements(sim, playerId, requirement).length;
  }

  function canExtendChain(state, playerId, random) {
    const requirement = placementRequirement(state);
    if (state.turnPlayed >= 4 && requirement > 4) return false;
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return false;
    const sample = moves.length > 10 ? shuffle(moves, random).slice(0, 10) : moves;
    for (const move of sample) {
      const sim = cloneSimState(state, playerId);
      applyPlacementSim(sim, playerId, move);
      if (maxChainPlays(sim, playerId, 8, random, { count: 0, max: 40 }) > sim.turnPlayed) return true;
    }
    return false;
  }

  function placementStrategyForTurn(state, playerId, strategy) {
    const handSize = (state.hands[playerId] || []).length;
    if (strategy === "planner" || strategy === "chain-max") return strategy;
    if (strategy === "hand-planner") {
      return handSize + state.turnPlayed >= 4 ? "planner" : "compatibility";
    }
    if (strategy === "prudent") {
      return handSize + state.turnPlayed >= 3 ? "planner" : "compatibility";
    }
    return strategy;
  }

  function choosePlacementPlanner(state, playerId, requirement, random, branchLimit) {
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const budget = { count: 0, max: PLANNER_MAX_NODES };
    const lightSearch = state.turnPlayed >= 2;
    let bestDepth = -1;
    let bestMoves = [];
    const sample = moves.length > branchLimit ? shuffle(moves, random).slice(0, branchLimit) : moves;
    for (const move of sample) {
      const sim = cloneSimState(state, playerId);
      if (!applyPlacementSim(sim, playerId, move)) continue;
      const depth = lightSearch
        ? sim.turnPlayed + Math.min(1, quickFollowUpScore(sim, playerId) / 8)
        : maxChainPlays(sim, playerId, branchLimit, random, budget);
      if (depth > bestDepth) {
        bestDepth = depth;
        bestMoves = [move];
      } else if (depth === bestDepth) {
        bestMoves.push(move);
      }
    }
    if (!bestMoves.length) return moves[Math.floor(random() * moves.length)];
    return bestMoves[Math.floor(random() * bestMoves.length)];
  }

  function choosePlacement(state, playerId, requirement, strategy, random) {
    const moves = legalPlacements(state, playerId, requirement);
    if (moves.length === 0) return null;
    const placementStrategy = placementStrategyForTurn(state, playerId, strategy);
    if (placementStrategy === "planner" || placementStrategy === "chain-max") {
      const limit = placementStrategy === "chain-max" ? PLANNER_BRANCH_LIMIT + 4 : PLANNER_BRANCH_LIMIT;
      return choosePlacementPlanner(state, playerId, requirement, random, limit);
    }
    if (strategy === "random") return moves[Math.floor(random() * moves.length)];
    if (strategy === "low-value" || strategy === "high-value") {
      const values = moves.map(move => Number(move.card.value) || 0);
      const target = strategy === "low-value" ? Math.min.apply(null, values) : Math.max.apply(null, values);
      const tied = moves.filter(move => Number(move.card.value) === target);
      return tied[Math.floor(random() * tied.length)];
    }
    if (strategy === "compatibility") {
      const scores = moves.map(move => compatibilityScore(move.card));
      const target = Math.min.apply(null, scores);
      const tied = moves.filter(move => compatibilityScore(move.card) === target);
      return tied[Math.floor(random() * tied.length)];
    }
    const scored = moves.map(move => {
      const base = placementStrategy === "adjacent"
        ? -move.neighbors * 100 - move.matches * 8
        : -move.matches * 100 - move.neighbors * 12;
      const valueWeight = Number(move.card.value) || 0;
      return { move, score: base - valueWeight + random() * 0.01 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].move;
  }

  function chooseAction(state, playerId, strategy, random) {
    if (state.turnPlayed >= 5) return { type: "stop" };
    const requirement = placementRequirement(state);
    if (state.turnPlayed >= 4 && requirement > 4) return { type: "stop" };
    if (state.turnPlayed < 4 && requirement > 4) return { type: "stop" };
    if (
      strategy === "draw-random-finish-random" &&
      state.turnPlayed > 0 &&
      state.turnPlayed < 4 &&
      state.drawPile.length > 0
    ) {
      return { type: "stop" };
    }
    if (
      strategy === "prudent" &&
      state.turnPlayed > 0 &&
      state.turnPlayed < 4 &&
      state.drawPile.length > 0 &&
      !canExtendChain(state, playerId, random)
    ) {
      return { type: "stop" };
    }
    const effectiveStrategy = strategy === "draw-random-finish-random" ? "random" : strategy;
    const move = choosePlacement(state, playerId, requirement, effectiveStrategy || "random", random);
    if (move) return { type: "move", move };
    return { type: "stop" };
  }

  function validatePlacement(state, playerId, move) {
    if (!state || state.status !== "playing") throw new Error("Partita non in corso.");
    if (playerId !== state.currentPlayer) throw new Error("Non e' il turno del giocatore.");
    if (state.turnPlayed >= 5) throw new Error("Il turno ha gia' raggiunto il limite di pose.");
    const requirement = placementRequirement(state);
    if (state.turnPlayed < 4 && requirement > 4) {
      throw new Error("Il turno ha gia' raggiunto il limite di pose.");
    }
    if (state.turnPlayed === 4 && !(state.hands[playerId] || []).length) {
      throw new Error("Nessuna carta in mano per realizzare l'idea.");
    }
    const legalMove = legalPlacements(state, playerId, requirement).find(candidate =>
      candidate.cardUid === move.cardUid &&
      candidate.x === move.x &&
      candidate.y === move.y
    );
    if (!legalMove) throw new Error("Posa non legale.");
    return legalMove;
  }

  function isDurissimaMater(state) {
    return state.durissimaMater === true;
  }

  function isBoardComplete(state) {
    return state.board.length >= state.size * state.size;
  }

  function maybeCompleteDurissima(state) {
    if (!isDurissimaMater(state) || state.status !== "playing" || !isBoardComplete(state)) return false;
    state.status = "success";
    state.winner = state.players === 1 ? 0 : null;
    return true;
  }

  function maybeDrawDurissimaEmptyHand(state) {
    if (!isDurissimaMater(state) || state.status !== "playing") return false;
    const playerId = state.currentPlayer;
    if ((state.hands[playerId] || []).length > 0) return false;
    if (state.drawPile.length === 0) return false;
    return drawForPlayer(state, playerId);
  }

  function applyPlacement(state, playerId, move) {
    const legalMove = validatePlacement(state, playerId, move);
    const hand = state.hands[playerId];
    const cardIndex = hand.findIndex(card => card.uid === legalMove.cardUid);
    if (cardIndex < 0) throw new Error("Carta non presente nella mano.");
    const card = hand.splice(cardIndex, 1)[0];
    const milestoneBefore = {
      widthAxisFixed: state.widthAxisFixed === true,
      heightAxisFixed: state.heightAxisFixed === true
    };
    state.board.push({ x: legalMove.x, y: legalMove.y, card, playerId });
    state.consecutivePasses = 0;
    const ideaPlacement = state.turnPlayed === 4;
    state.turnPlayed++;
    state.lastMove = {
      playerId,
      card,
      x: legalMove.x,
      y: legalMove.y,
      matches: legalMove.matches,
      requirement: ideaPlacement ? 1 : state.turnPlayed,
      idea: ideaPlacement
    };
    handleTurnOrderAfterPlacement(state, playerId, milestoneBefore);
    if (isDurissimaMater(state)) {
      maybeCompleteDurissima(state);
    } else if (hand.length === 0) {
      state.status = "success";
      state.winner = playerId;
    }
    if (
      state.turnPlayed === 4 &&
      hand.length > 0 &&
      state.status === "playing" &&
      state.turnPlacementStats
    ) {
      state.turnPlacementStats.ideaOffers++;
    }
  }

  function passTurn(state) {
    const drew = drawForPlayer(state, state.currentPlayer);
    state.consecutivePasses++;
    const canStall = !isDurissimaMater(state) || !isBoardComplete(state);
    if (canStall && state.consecutivePasses >= state.players && !drew && state.drawPile.length === 0) {
      state.status = "stalled";
    }
    endTurn(state);
  }

  function drawForPlayer(state, playerId) {
    if (state.drawPile.length === 0) return false;
    state.hands[playerId].push(state.drawPile.shift());
    return true;
  }

  function emptyTurnPlacementStats() {
    return { byCount: [0, 0, 0, 0, 0, 0], maxInTurn: 0, ideaOffers: 0 };
  }

  function recordTurnPlacements(state) {
    const stats = state.turnPlacementStats;
    if (!stats) return;
    const played = state.turnPlayed;
    if (played < 0 || played > 5) return;
    stats.byCount[played]++;
    if (played > stats.maxInTurn) stats.maxInTurn = played;
  }

  function endTurn(state) {
    recordTurnPlacements(state);
    const playerId = state.currentPlayer;
    const handEmpty = (state.hands[playerId] || []).length === 0;
    if (
      state.status === "playing" &&
      state.turnPlayed > 0 &&
      !(isDurissimaMater(state) && handEmpty)
    ) {
      drawForPlayer(state, playerId);
    }
    state.turns++;
    state.currentPlayer = nextPlayerId(state);
    state.turnPlayed = 0;
  }

  function computeInitialDeal(size, players) {
    const totalCards = size * size;
    const overcrowded = players > size;
    const cardsPerPlayer = overcrowded ? Math.floor(totalCards / players) : size;
    const dealt = cardsPerPlayer * players;
    return {
      cardsPerPlayer,
      drawCount: totalCards - dealt,
      overcrowded,
      totalCards
    };
  }

  function maxPlayersForSize(size) {
    if (!Number.isInteger(size) || size < 3 || size > 8) return 0;
    return Math.min(MAX_PLAYERS, 2 * size);
  }

  /** Formato consigliato: G = N (senza mazzo di pesca). */
  function recommendedMaxPlayers(size) {
    if (!Number.isInteger(size) || size < 3 || size > 8) return 0;
    return size;
  }

  function isRecommendedSetup(size, players) {
    return isPlayableSetup(size, players) && players <= recommendedMaxPlayers(size);
  }

  function isPlayableSetup(size, players) {
    if (!Number.isInteger(size) || size < 3 || size > 8) return false;
    if (!Number.isInteger(players) || players < 1 || players > MAX_PLAYERS) return false;
    if (players > maxPlayersForSize(size)) return false;
    return computeInitialDeal(size, players).cardsPerPlayer >= MIN_INITIAL_HAND;
  }

  function setupGame(deck, options) {
    const size = options.size;
    const players = options.players;
    const deal = computeInitialDeal(size, players);
    if (deal.cardsPerPlayer < MIN_INITIAL_HAND) {
      throw new Error(
        "Troppi giocatori per " + size + "×" + size + ": servono almeno " + MIN_INITIAL_HAND + " carte a testa."
      );
    }
    const gameDeck = deck
      .filter(card => Number(card.value) <= size)
      .map(cloneCardForGame);
    if (gameDeck.length !== size * size) {
      throw new Error("Sottomazzo non valido per lato " + size + ": " + gameDeck.length + " carte.");
    }
    const random = options.random;
    const shuffled = shuffle(gameDeck, random);
    const hands = Array.from({ length: players }, () => shuffled.splice(0, deal.cardsPerPlayer));
    const randomizeTurnOrder = options.randomizeTurnOrder !== false;
    const turnOrder = randomizeTurnOrder
      ? randomInitialTurnOrder(players, random)
      : defaultTurnOrder(players);
    const initialTurnOrder = turnOrder.slice();
    return {
      size,
      players,
      hands,
      drawPile: shuffled,
      board: [],
      currentPlayer: initialTurnOrder[0],
      initialTurnOrder,
      startingPlayer: initialTurnOrder[0],
      consecutivePasses: 0,
      turns: 0,
      turnPlayed: 0,
      status: "playing",
      winner: null,
      lastMove: null,
      duraMaterClosed: false,
      closedByPlayer: null,
      widthAxisFixed: false,
      heightAxisFixed: false,
      firstAxisInversionDone: false,
      turnDirection: 1,
      durissimaMater: options.durissimaMater === true,
      randomizeTurnOrder,
      turnOrder: initialTurnOrder.slice(),
      turnPlacementStats: emptyTurnPlacementStats(),
      initialHandSize: deal.cardsPerPlayer,
      initialDrawCount: deal.drawCount,
      overcrowdedDeal: deal.overcrowded
    };
  }

  function resolveStrategies(settings, players, random) {
    return Array.from({ length: players }, (_, index) => {
      const setting = settings[index] || "random";
      if (setting !== "auto") return setting;
      return STRATEGY_KEYS[Math.floor(random() * STRATEGY_KEYS.length)];
    });
  }

  function botStep(state, strategies, random) {
    if (state.status !== "playing") return { played: false, passed: false };
    maybeDrawDurissimaEmptyHand(state);
    const playerId = state.currentPlayer;
    const playerStrategy = Array.isArray(strategies) ? strategies[playerId] : strategies;
    const action = chooseAction(state, playerId, playerStrategy, random);
    if (action.type === "stop") {
      if (state.turnPlayed === 0) {
        passTurn(state);
        return { played: false, passed: true };
      }
      endTurn(state);
      return { played: false, passed: false, ended: true };
    }
    const move = action.move;
    applyPlacement(state, playerId, move);
    if (state.status !== "playing") return { played: true, move };
    if (state.turnPlayed >= 5) endTurn(state);
    return { played: true, move };
  }

  function initialTurnSlotFor(result, playerId) {
    const order = result.initialTurnOrder;
    if (!Array.isArray(order) || !order.length) return playerId;
    const idx = order.indexOf(playerId);
    return idx >= 0 ? idx : playerId;
  }

  function ensureTurnRolePatch(patch, playerCount) {
    const slots = Math.max(MAX_PLAYERS, playerCount || MAX_PLAYERS);
    if (!patch.winsByInitialTurnSlot || patch.winsByInitialTurnSlot.length < slots) {
      const grow = (list, len) => Array.from({ length: len }, (_, index) => list?.[index] || 0);
      patch.winsByInitialTurnSlot = grow(patch.winsByInitialTurnSlot, slots);
      patch.playedByInitialTurnSlot = grow(patch.playedByInitialTurnSlot, slots);
      patch.pointsByInitialTurnSlot = grow(patch.pointsByInitialTurnSlot, slots);
      patch.dmCloserByInitialTurnSlot = grow(patch.dmCloserByInitialTurnSlot, slots);
      patch.starterWins = patch.starterWins || 0;
      patch.dmClosedCount = patch.dmClosedCount || 0;
      patch.dmCloserWins = patch.dmCloserWins || 0;
    }
  }

  /** Aggrega vincitore e chi chiude DM per ruolo 1°/2°/… nel turno iniziale (simulatore). */
  function accumulateTurnRoleStats(patch, result, playerCount) {
    ensureTurnRolePatch(patch, playerCount);
    for (let player = 0; player < playerCount; player++) {
      const slot = initialTurnSlotFor(result, player);
      patch.playedByInitialTurnSlot[slot]++;
    }
    if (result.status === "success") {
      if (result.winner === null) {
        for (let player = 0; player < playerCount; player++) {
          const slot = initialTurnSlotFor(result, player);
          patch.winsByInitialTurnSlot[slot]++;
          patch.pointsByInitialTurnSlot[slot] += playerCount;
        }
      } else {
        const slot = initialTurnSlotFor(result, result.winner);
        patch.winsByInitialTurnSlot[slot]++;
        patch.pointsByInitialTurnSlot[slot] += playerCount;
        if (slot === 0) patch.starterWins++;
      }
    }
    if (result.duraMaterClosed && result.closedByPlayer != null) {
      patch.dmClosedCount++;
      const closerSlot = initialTurnSlotFor(result, result.closedByPlayer);
      patch.dmCloserByInitialTurnSlot[closerSlot]++;
      if (result.status === "success" && result.winner === result.closedByPlayer) {
        patch.dmCloserWins++;
      }
    }
  }

  function summarizeParticipation(board, players, initialHandSize, winner) {
    const placementsByPlayer = Array.from({ length: players }, () => 0);
    for (const entry of board) {
      const playerId = entry.playerId;
      if (playerId >= 0 && playerId < players) placementsByPlayer[playerId]++;
    }
    let minPlacementsPerPlayer = players ? Infinity : 0;
    let maxPlacementsPerPlayer = 0;
    let totalPlacements = 0;
    let playersWithZeroPlacements = 0;
    let playersWithOnePlacement = 0;
    for (let player = 0; player < players; player++) {
      const count = placementsByPlayer[player];
      totalPlacements += count;
      if (count < minPlacementsPerPlayer) minPlacementsPerPlayer = count;
      if (count > maxPlacementsPerPlayer) maxPlacementsPerPlayer = count;
      if (count === 0) playersWithZeroPlacements++;
      if (count === 1) playersWithOnePlacement++;
    }
    if (!players) minPlacementsPerPlayer = 0;
    const hand = initialHandSize || 0;
    const winnerPlacements = winner !== null && winner >= 0 && winner < players
      ? placementsByPlayer[winner]
      : 0;
    const halfHand = hand > 0 ? Math.ceil(hand / 2) : 0;
    return {
      placementsByPlayer,
      totalPlacements,
      minPlacementsPerPlayer: minPlacementsPerPlayer === Infinity ? 0 : minPlacementsPerPlayer,
      maxPlacementsPerPlayer,
      avgPlacementsPerPlayer: players ? totalPlacements / players : 0,
      playersWithZeroPlacements,
      playersWithOnePlacement,
      hasPlayerWithZeroPlacements: playersWithZeroPlacements > 0,
      hasPlayerWithOnePlacement: playersWithOnePlacement > 0,
      everyonePlacedAtLeastTwo: players > 0 && minPlacementsPerPlayer >= 2,
      winnerPlacements,
      winnerPlacedAtLeastHalfHand: halfHand > 0 && winnerPlacements >= halfHand
    };
  }

  function simulateGame(deck, options) {
    const random = options.random;
    let strategies = resolveStrategies(options.strategies, options.players, random);
    if (options.shuffleStrategiesAmongSeats) {
      strategies = shuffle(strategies.slice(), random);
    }
    const state = setupGame(deck, options);
    const stepFactor = options.durissimaMater === true ? 48 : 16;
    const maxSteps = options.size * options.size * options.players * stepFactor;
    let steps = 0;
    while (state.status === "playing" && steps < maxSteps) {
      botStep(state, strategies, random);
      steps++;
    }
    if (state.status === "playing") state.status = "stalled";
    if (state.turnPlayed > 0) recordTurnPlacements(state);
    const placementStats = state.turnPlacementStats || emptyTurnPlacementStats();
    const participation = summarizeParticipation(
      state.board,
      state.players,
      state.initialHandSize,
      state.winner
    );
    const playersWhoPlaced = state.players - participation.playersWithZeroPlacements;
    const order = state.initialTurnOrder;
    const lastPlayerId = order[order.length - 1];
    const lastPlayerPlaced = participation.placementsByPlayer[lastPlayerId] > 0;
    const tailSize = Math.min(3, order.length);
    const tailIds = order.slice(-tailSize);
    const lastThreeAllPlaced = tailIds.every(id => participation.placementsByPlayer[id] > 0);
    const winnerInitialTurnSlot = state.winner === null
      ? null
      : state.initialTurnOrder.indexOf(state.winner);
    const closedByInitialTurnSlot = state.closedByPlayer === null
      ? null
      : state.initialTurnOrder.indexOf(state.closedByPlayer);
    return {
      status: state.status,
      winner: state.winner,
      turns: state.turns,
      strategies,
      startingPlayer: state.startingPlayer,
      initialTurnOrder: state.initialTurnOrder.slice(),
      winnerInitialTurnSlot: winnerInitialTurnSlot >= 0 ? winnerInitialTurnSlot : null,
      closedByInitialTurnSlot: closedByInitialTurnSlot >= 0 ? closedByInitialTurnSlot : null,
      duraMaterClosed: state.duraMaterClosed,
      closedByPlayer: state.closedByPlayer,
      widthAxisFixed: state.widthAxisFixed === true,
      heightAxisFixed: state.heightAxisFixed === true,
      turnDirection: state.turnDirection,
      durissimaMater: state.durissimaMater === true,
      boardComplete: isBoardComplete(state),
      maxPlacementsInTurn: placementStats.maxInTurn,
      fourCardTurns: placementStats.byCount[4],
      hadFourCardTurn: placementStats.maxInTurn >= 4,
      ideaOffers: placementStats.ideaOffers || 0,
      fiveCardTurns: placementStats.byCount[5],
      hadFiveCardTurn: placementStats.maxInTurn >= 5,
      initialHandSize: state.initialHandSize,
      initialDrawCount: state.initialDrawCount,
      overcrowdedDeal: state.overcrowdedDeal === true,
      playersWhoPlaced,
      allPlayersPlaced: playersWhoPlaced === state.players,
      lastPlayerPlaced,
      lastThreeAllPlaced,
      ...participation
    };
  }

  function strategyLabel(value) {
    return (STRATEGIES.find(([key]) => key === value) || STRATEGIES[0])[1];
  }

  function strategyShortLabel(value) {
    return (STRATEGIES.find(([key]) => key === value) || STRATEGIES[0])[2];
  }

  globalThis.MPCardsCore = {
    VALUES,
    SHAPES,
    COLORS,
    MAX_PLAYERS,
    MIN_INITIAL_HAND,
    SIM_DECK_CODES,
    deckCodesText,
    parseDeckCodes,
    STRATEGIES,
    STRATEGY_KEYS,
    hashSeed,
    mulberry32,
    shuffle,
    simulationDeck,
    coordKey,
    boardMap,
    boardBounds,
    boardFootprint,
    isDuraMaterDelimited,
    defaultTurnOrder,
    randomInitialTurnOrder,
    invertedTurnOrder,
    maxLineRun,
    syncAxisLocksFromBoard,
    toggleTurnDirection,
    handleTurnOrderAfterPlacement,
    ensureTurnOrder,
    nextPlayerId,
    maybeCloseDuraMater,
    placementScore,
    compatibilityScore,
    legalPlacements,
    choosePlacement,
    chooseAction,
    validatePlacement,
    placementRequirement,
    canOfferIdea,
    applyPlacement,
    isDurissimaMater,
    isBoardComplete,
    maybeCompleteDurissima,
    maybeDrawDurissimaEmptyHand,
    passTurn,
    drawForPlayer,
    endTurn,
    computeInitialDeal,
    maxPlayersForSize,
    recommendedMaxPlayers,
    isRecommendedSetup,
    isPlayableSetup,
    setupGame,
    resolveStrategies,
    botStep,
    summarizeParticipation,
    simulateGame,
    initialTurnSlotFor,
    ensureTurnRolePatch,
    accumulateTurnRoleStats,
    strategyLabel,
    strategyShortLabel
  };
})();
`;

eval(MPCARDS_CORE_SOURCE);
