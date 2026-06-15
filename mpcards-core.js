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
    ["durissima-planner", "G - Durissima: chiude la griglia", "G"],
    ["durissima-team-planner", "T - Durissima coop: pianifica per la squadra", "T"],
    ["durissima-global-planner", "TG - Durissima G=N: solver globale coop", "TG"],
    ["random", "R - Casuale legale", "R"],
    ["auto", "Auto a partita", "Auto"]
  ];
  const STRATEGY_KEYS = [
    "random", "greedy", "adjacent", "draw-random-finish-random", "low-value", "high-value", "compatibility",
    "planner", "hand-planner", "prudent", "chain-max", "durissima-planner", "durissima-team-planner",
    "durissima-global-planner"
  ];
  const DURISSIMA_SCARCE_VALUES = new Set(["1", "2", "3"]);
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
    const valueIndex = Number(text[0]) - 1; // 1a cifra: VALORE (1-8)
    const shapeIndex = Number(text[1]) - 1; // 2a cifra: FORMA (1-8)
    const colorIndex = Number(text[2]) - 1; // 3a cifra: COLORE (1-8)
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

  function isTournamentMode(state) {
    return !!(state && state.tournamentMode === true && !isDurissimaMater(state));
  }

  function tournamentTurnOrder(players, handIndex) {
    const base = defaultTurnOrder(players);
    const offset = ((handIndex % players) + players) % players;
    return base.slice(offset).concat(base.slice(0, offset));
  }

  function tournamentPlayersStillIn(state) {
    if (!state.tournamentExited) return state.players;
    let count = 0;
    for (let player = 0; player < state.players; player++) {
      if (!state.tournamentExited[player]) count++;
    }
    return count;
  }

  function tournamentAddPoints(state, playerId, delta) {
    if (!delta || playerId < 0 || playerId >= state.players) return;
    state.tournamentScores[playerId] += delta;
    state.tournamentHandScores[playerId] += delta;
  }

  function tournamentLeaderId(state) {
    let best = 0;
    for (let player = 1; player < state.players; player++) {
      if (state.tournamentScores[player] > state.tournamentScores[best]) best = player;
    }
    return best;
  }

  function tournamentApplyMontePenalties(state) {
    for (let player = 0; player < state.players; player++) {
      if (state.tournamentExited[player]) continue;
      const handPenalty = (state.hands[player] || []).length;
      tournamentAddPoints(state, player, -handPenalty);
    }
  }

  function tournamentCompleteHand(state, reason) {
    if (!state.tournamentHandLog) state.tournamentHandLog = [];
    const finishOrder = (state.tournamentFinishOrder || []).slice();
    const handEntry = {
      handIndex: state.tournamentHandIndex,
      starter: state.startingPlayer,
      reason,
      finishOrder,
      firstFinisher: finishOrder.length ? finishOrder[0] : null,
      starterWonHand: finishOrder.length > 0 && finishOrder[0] === state.startingPlayer,
      handScores: (state.tournamentHandScores || []).slice(),
      turns: state.turns
    };
    if (reason === "monte") {
      if (!state.tournamentMonteLog) state.tournamentMonteLog = [];
      const drawCards = state.drawPile.length;
      const stillIn = [];
      for (let player = 0; player < state.players; player++) {
        if (state.tournamentExited[player]) continue;
        const handCards = (state.hands[player] || []).length;
        stillIn.push({
          player,
          handCards,
          handPenalty: handCards,
          totalPenalty: handCards
        });
      }
      const monteEntry = {
        drawCards,
        stillIn,
        playersStillIn: stillIn.length
      };
      state.tournamentMonteLog.push(monteEntry);
      handEntry.monte = monteEntry;
      tournamentApplyMontePenalties(state);
    }
    state.tournamentHandLog.push(handEntry);
    state.tournamentLastHandReason = reason;
    state.tournamentHandIndex++;
    if (state.tournamentHandIndex >= state.players) {
      state.status = "tournament_complete";
      state.winner = tournamentLeaderId(state);
    } else {
      state.status = "hand_over";
    }
  }

  function tournamentMarkFinished(state, playerId) {
    if (state.tournamentExited[playerId]) return;
    if (!state.tournamentFinishOrder) state.tournamentFinishOrder = [];
    state.tournamentFinishOrder.push(playerId);
    const k = tournamentPlayersStillIn(state);
    tournamentAddPoints(state, playerId, k);
    state.tournamentExited[playerId] = true;
    if (tournamentPlayersStillIn(state) === 0) {
      tournamentCompleteHand(state, "finished");
    } else {
      endTurn(state);
    }
  }

  function resetTournamentHandPlayState(state) {
    state.board = [];
    state.currentPlayer = state.turnOrder[0];
    state.consecutivePasses = 0;
    state.turns = 0;
    state.turnPlayed = 0;
    state.winner = null;
    state.lastMove = null;
    state.duraMaterClosed = false;
    state.closedByPlayer = null;
    state.widthAxisFixed = false;
    state.heightAxisFixed = false;
    state.firstAxisInversionDone = false;
    state.turnDirection = 1;
    state.turnPlacementStats = emptyTurnPlacementStats();
    state.tournamentExited = Array.from({ length: state.players }, () => false);
    state.tournamentHandScores = Array.from({ length: state.players }, () => 0);
    state.tournamentFinishOrder = [];
    state.tournamentLastHandReason = null;
    state.status = "playing";
  }

  function beginNextTournamentHand(state, deck, random) {
    if (!isTournamentMode(state) || state.status !== "hand_over") {
      throw new Error("Nuova mano torneo non disponibile.");
    }
    const size = state.size;
    const players = state.players;
    const deal = computeInitialDeal(size, players);
    const gameDeck = deck
      .filter(card => Number(card.value) <= size)
      .map(cloneCardForGame);
    if (gameDeck.length !== size * size) {
      throw new Error("Sottomazzo non valido per lato " + size + ": " + gameDeck.length + " carte.");
    }
    const shuffled = shuffle(gameDeck, random);
    state.hands = Array.from({ length: players }, () => shuffled.splice(0, deal.cardsPerPlayer));
    state.drawPile = shuffled;
    const turnOrder = tournamentTurnOrder(players, state.tournamentHandIndex);
    state.turnOrder = turnOrder.slice();
    state.initialTurnOrder = turnOrder.slice();
    state.startingPlayer = turnOrder[0];
    state.initialHandSize = deal.cardsPerPlayer;
    state.initialDrawCount = deal.drawCount;
    state.overcrowdedDeal = deal.overcrowded;
    resetTournamentHandPlayState(state);
    return state;
  }

  function nextPlayerId(state) {
    const order = ensureTurnOrder(state);
    const index = order.indexOf(state.currentPlayer);
    if (index < 0) return order[0];
    const step = state.turnDirection === -1 ? -1 : 1;
    let nextIndex = (index + step + order.length) % order.length;
    if (isTournamentMode(state) && state.tournamentExited) {
      let guard = 0;
      while (state.tournamentExited[order[nextIndex]] && guard < order.length) {
        nextIndex = (nextIndex + step + order.length) % order.length;
        guard++;
      }
    }
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

  function isDurissimaReserveEnabled(state) {
    return isDurissimaMater(state) && Array.isArray(state.durissimaReserve);
  }

  function playableCardSources(state, playerId) {
    const sources = [];
    for (const card of (state.hands[playerId] || [])) {
      sources.push({ card, fromReserve: false });
    }
    if (isDurissimaReserveEnabled(state)) {
      for (const card of state.durissimaReserve) {
        sources.push({ card, fromReserve: true });
      }
    }
    return sources;
  }

  function legalPlacements(state, playerId, requirement) {
    const moves = [];
    const map = boardMap(state.board);
    for (const cell of candidateCells(state)) {
      if (map.has(coordKey(cell.x, cell.y))) continue;
      const bounds = boardBounds(state.board, [{ x: cell.x, y: cell.y }]);
      if (bounds.width > state.size || bounds.height > state.size) continue;
      for (const source of playableCardSources(state, playerId)) {
        const score = placementScore(state, source.card, cell.x, cell.y);
        if (state.board.length === 0 || (score.neighbors >= requirement && score.compatibleNeighbors === score.neighbors)) {
          moves.push({
            cardUid: source.card.uid,
            card: source.card,
            fromReserve: source.fromReserve === true,
            x: cell.x,
            y: cell.y,
            matches: score.matches,
            neighbors: score.neighbors,
            compatibleNeighbors: score.compatibleNeighbors
          });
        }
      }
    }
    if (isDurissimaGnIdeal(state)) {
      return moves.filter(move => gnIdealCellInGrid(state, move.x, move.y));
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
      durissimaReserve: (source.durissimaReserve || []).map(cloneCardSnapshot),
      turnPlayed: source.turnPlayed
    };
  }

  function applyPlacementSim(sim, playerId, move) {
    let card = null;
    if (move.fromReserve) {
      const reserve = sim.durissimaReserve || [];
      const cardIndex = reserve.findIndex(entry => entry.uid === move.cardUid);
      if (cardIndex < 0) return false;
      card = reserve.splice(cardIndex, 1)[0];
    } else {
      const hand = sim.hands[playerId];
      if (!hand) return false;
      const cardIndex = hand.findIndex(entry => entry.uid === move.cardUid);
      if (cardIndex < 0) return false;
      card = hand.splice(cardIndex, 1)[0];
    }
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

  function canPlaceCardAt(sim, card, x, y, requirement) {
    const map = boardMap(sim.board);
    if (map.has(coordKey(x, y))) return false;
    const bounds = boardBounds(sim.board, [{ x, y }]);
    if (bounds.width > sim.size || bounds.height > sim.size) return false;
    const score = placementScore(sim, card, x, y);
    return sim.board.length === 0 || (score.neighbors >= requirement && score.compatibleNeighbors === score.neighbors);
  }

  /** Pool informativo Durissima (modello sim/bot): universo noto = mani + mazzo, ordine pesca ignoto; al tavolo mani e mazzo sono coperti. */
  function durissimaAllKnownCards(state, playerId, excludeUid) {
    const cards = [];
    if (!state || state.players <= 1) {
      for (const card of (state.hands[playerId] || [])) {
        if (!excludeUid || card.uid !== excludeUid) cards.push(card);
      }
    } else {
      for (let p = 0; p < state.players; p++) {
        for (const card of (state.hands[p] || [])) {
          if (p === playerId && excludeUid && card.uid === excludeUid) continue;
          cards.push(card);
        }
      }
    }
    for (const card of (state.drawPile || [])) cards.push(card);
    for (const card of (state.durissimaReserve || [])) cards.push(card);
    return cards;
  }

  function cardsForDurissimaOutlook(state, playerId) {
    return durissimaAllKnownCards(state, playerId, null);
  }

  function durissimaClosureOutlook(state, playerId, excludeUid) {
    return durissimaAllKnownCards(state, playerId, excludeUid);
  }

  function durissimaTwoByTwoPockets(board) {
    const map = boardMap(board);
    const pockets = [];
    const seen = new Set();
    for (const entry of board) {
      for (let ox = 0; ox <= 1; ox++) {
        for (let oy = 0; oy <= 1; oy++) {
          const x0 = entry.x - ox;
          const y0 = entry.y - oy;
          const blockKey = coordKey(x0, y0);
          if (seen.has(blockKey)) continue;
          const cells = [
            { x: x0, y: y0 },
            { x: x0 + 1, y: y0 },
            { x: x0, y: y0 + 1 },
            { x: x0 + 1, y: y0 + 1 }
          ];
          let filled = 0;
          let empty = null;
          for (const cell of cells) {
            if (map.has(coordKey(cell.x, cell.y))) filled++;
            else empty = cell;
          }
          if (filled === 3 && empty) {
            seen.add(blockKey);
            pockets.push({ x: empty.x, y: empty.y, blockKey });
          }
        }
      }
    }
    return pockets;
  }

  function durissimaPocketKey(pocket) {
    return coordKey(pocket.x, pocket.y);
  }

  function durissimaClosureCandidates(sim, pocket, outlookCards) {
    let count = 0;
    let bestRigidity = 0;
    for (const card of outlookCards) {
      if (!canPlaceCardAt(sim, card, pocket.x, pocket.y, 1)) continue;
      count++;
      bestRigidity = Math.max(bestRigidity, durissimaCardRigidity(card));
    }
    return { count, bestRigidity };
  }

  function durissimaMoveCompletesSquare(sim, move) {
    const map = boardMap(sim.board);
    for (let ox = 0; ox <= 1; ox++) {
      for (let oy = 0; oy <= 1; oy++) {
        const x0 = move.x - ox;
        const y0 = move.y - oy;
        const cells = [
          { x: x0, y: y0 },
          { x: x0 + 1, y: y0 },
          { x: x0, y: y0 + 1 },
          { x: x0 + 1, y: y0 + 1 }
        ];
        if (cells.every(cell => map.has(coordKey(cell.x, cell.y)))) return true;
      }
    }
    return false;
  }

  function durissimaCompactnessBonus(sim) {
    if (sim.board.length <= 2) return 0;
    const bounds = boardBounds(sim.board, []);
    const area = bounds.width * bounds.height;
    if (area <= 0) return 0;
    const fill = sim.board.length / area;
    const aspect = Math.max(bounds.width, bounds.height) / Math.min(bounds.width, bounds.height);
    return fill * 24 - Math.max(0, aspect - 1.15) * 10;
  }

  function durissimaLineExtensionPenalty(sim, x, y) {
    const map = boardMap(sim.board);
    function axisLength(dx, dy) {
      let len = 1;
      for (const sign of [-1, 1]) {
        let cx = x + dx * sign;
        let cy = y + dy * sign;
        while (map.has(coordKey(cx, cy))) {
          len++;
          cx += dx * sign;
          cy += dy * sign;
        }
      }
      return len;
    }
    const longest = Math.max(axisLength(1, 0), axisLength(0, 1));
    if (longest >= 5) return (longest - 4) * 16;
    if (longest === 4) return 10;
    if (longest === 3) return 4;
    return 0;
  }

  function durissimaIslandAdjust(state, sim, playerId, move, requirement) {
    const beforeKeys = new Set(durissimaTwoByTwoPockets(state.board).map(durissimaPocketKey));
    const afterPockets = durissimaTwoByTwoPockets(sim.board);
    const outlook = durissimaClosureOutlook(state, playerId, move.cardUid);
    const islandWeight = requirement === 3 ? 1.4 : (state.turnPlayed === 2 ? 1.25 : 1);
    let score = 0;

    if (durissimaMoveCompletesSquare(sim, move)) {
      score += 36 + durissimaCardRigidity(move.card) * 0.9;
    }

    for (const pocket of afterPockets) {
      const key = durissimaPocketKey(pocket);
      const isNew = !beforeKeys.has(key);
      const closure = durissimaClosureCandidates(sim, pocket, outlook);
      if (isNew) {
        if (closure.count === 0) {
          score -= 140 * islandWeight;
        } else {
          score += (26 + closure.bestRigidity * 0.95) * islandWeight;
          if (closure.bestRigidity >= 20) score += 18 * islandWeight;
        }
      } else if (closure.count === 0) {
        score -= 24;
      }
    }

    return score;
  }

  function countValueInAllHands(state, value) {
    let count = 0;
    for (let p = 0; p < state.players; p++) {
      for (const card of (state.hands[p] || [])) {
        if (card.value === value) count++;
      }
    }
    for (const card of (state.drawPile || [])) {
      if (card.value === value) count++;
    }
    return count;
  }

  function durissimaBoardNeighborsAt(sim, x, y) {
    const map = boardMap(sim.board);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    let n = 0;
    for (const dir of dirs) {
      if (map.has(coordKey(x + dir.x, y + dir.y))) n++;
    }
    return n;
  }

  /** Grado finale atteso nella matrice NxN: angolo 2, bordo 3, interno 4. */
  function durissimaExpectedFinalDegree(sim, x, y) {
    if (sim.board.length === 0) return 2;
    const bounds = boardBounds(sim.board, [{ x, y }]);
    const size = sim.size;
    const relX = x - bounds.minX;
    const relY = y - bounds.minY;
    const w = bounds.width;
    const h = bounds.height;
    const onCorner = (relX === 0 || relX === w - 1) && (relY === 0 || relY === h - 1);
    const onEdge = relX === 0 || relX === w - 1 || relY === 0 || relY === h - 1;
    if (w >= size && h >= size) {
      if (onCorner) return 2;
      if (onEdge) return 3;
      return 4;
    }
    const neighbors = durissimaBoardNeighborsAt(sim, x, y);
    if (neighbors <= 1) return onCorner ? 2 : 2.5;
    if (neighbors === 2) return onEdge ? 3 : 3.5;
    if (onEdge) return 3;
    return 4;
  }

  function durissimaCardRigidity(card) {
    return 34 - compatibilityScore(card) + (DURISSIMA_SCARCE_VALUES.has(card.value) ? 6 : 0);
  }

  function durissimaCornerEdgeFitBonus(card, expectedDegree) {
    const slotLowDegree = Math.max(0, 4 - expectedDegree);
    if (slotLowDegree <= 0) return 0;
    return slotLowDegree * durissimaCardRigidity(card) * 1.15;
  }

  function durissimaTeamSetupBonus(state, playerId, move, requirement) {
    if (!state || state.players <= 1) return 0;
    const sim = cloneSimState(state, playerId);
    if (!applyPlacementSim(sim, playerId, move)) return 0;
    const order = state.turnOrder || state.initialTurnOrder || [];
    const startIdx = order.indexOf(playerId);
    if (startIdx < 0) return 0;
    let bonus = 0;
    for (let step = 1; step < state.players; step++) {
      const partnerId = order[(startIdx + step) % order.length];
      let stepBonus = 0;
      for (const card of (state.hands[partnerId] || [])) {
        const rigidity = durissimaCardRigidity(card);
        let legalBefore = 0;
        let legalAfter = 0;
        for (const cell of candidateCells(state)) {
          if (canPlaceCardAt(state, card, cell.x, cell.y, requirement)) legalBefore++;
        }
        for (const cell of candidateCells(sim)) {
          if (canPlaceCardAt(sim, card, cell.x, cell.y, requirement)) legalAfter++;
        }
        const delta = legalAfter - legalBefore;
        if (delta > 0) stepBonus += delta * ((10 + rigidity * 0.7) / step);
        for (const pocket of durissimaTwoByTwoPockets(sim.board)) {
          const opensPocket = canPlaceCardAt(sim, card, pocket.x, pocket.y, 1)
            && !canPlaceCardAt(state, card, pocket.x, pocket.y, 1);
          if (opensPocket) stepBonus += (28 + rigidity) / step;
        }
      }
      bonus += stepBonus;
    }
    return bonus;
  }

  function durissimaCoopPlacementAdjust(state, playerId, move, requirement) {
    if (!state || state.players <= 1) return 0;
    let othersLegal = 0;
    let othersMoreFlexible = 0;
    let bestOtherFlex = Infinity;
    for (let p = 0; p < state.players; p++) {
      if (p === playerId) continue;
      for (const card of (state.hands[p] || [])) {
        if (!canPlaceCardAt(state, card, move.x, move.y, requirement)) continue;
        othersLegal++;
        const flex = compatibilityScore(card);
        bestOtherFlex = Math.min(bestOtherFlex, flex);
        if (flex < compatibilityScore(move.card)) othersMoreFlexible++;
      }
    }
    if (othersLegal === 0) return 14;
    if (othersMoreFlexible > 0) return -11;
    if (bestOtherFlex < compatibilityScore(move.card) - 4) return -6;
    return 2;
  }

  function durissimaGlobalScarcityPenalty(state, card, expectedDegree) {
    if (expectedDegree < 3.5) return 0;
    let penalty = 0;
    for (const value of DURISSIMA_SCARCE_VALUES) {
      if (card.value !== value) continue;
      const left = countValueInAllHands(state, value);
      if (left <= 1) penalty += 16;
      else if (left === 2) penalty += 7;
    }
    return penalty;
  }

  function durissimaMinPlacementRequirement(sim, x, y) {
    if (!sim.board.length) return 1;
    return Math.max(1, durissimaBoardNeighborsAt(sim, x, y));
  }

  function durissimaUnreachableFrontier(sim, outlookCards) {
    const cells = candidateCells(sim);
    if (!cells.length) return 0;
    let blocked = 0;
    for (const cell of cells) {
      const minReq = durissimaMinPlacementRequirement(sim, cell.x, cell.y);
      let reachable = false;
      for (const card of outlookCards) {
        if (canPlaceCardAt(sim, card, cell.x, cell.y, minReq)) {
          reachable = true;
          break;
        }
      }
      if (!reachable) blocked++;
    }
    return blocked;
  }

  function durissimaFlexibilityReserveCost(card, fillRatio) {
    if (fillRatio >= 0.72) return 0;
    return compatibilityScore(card) * (0.85 - fillRatio * 0.6);
  }

  function durissimaScarceValueCost(card, fillRatio) {
    if (!DURISSIMA_SCARCE_VALUES.has(card.value)) return 0;
    return (1 - fillRatio) * 11;
  }

  function durissimaMoveScore(state, playerId, move, random, branchLimit, requirement, teamMode) {
    const sim = cloneSimState(state, playerId);
    if (!applyPlacementSim(sim, playerId, move)) return -Infinity;
    const totalCells = state.size * state.size;
    const fillRatio = sim.board.length / totalCells;
    const frontier = candidateCells(sim).length;
    const outlookCards = cardsForDurissimaOutlook(state, playerId);
    const blocked = durissimaUnreachableFrontier(sim, outlookCards);
    const expectedDegree = durissimaExpectedFinalDegree(sim, move.x, move.y);
    const budget = { count: 0, max: PLANNER_MAX_NODES };
    const chainDepth = maxChainPlays(sim, playerId, branchLimit, random, budget);
    const followUp = quickFollowUpScore(sim, playerId);
    return (
      frontier * 14 +
      chainDepth * 22 +
      followUp * 4 +
      move.matches * 2 +
      durissimaCornerEdgeFitBonus(move.card, expectedDegree) +
      durissimaCoopPlacementAdjust(state, playerId, move, requirement) +
      durissimaIslandAdjust(state, sim, playerId, move, requirement) +
      durissimaCompactnessBonus(sim) -
      durissimaLineExtensionPenalty(sim, move.x, move.y) -
      blocked * 48 -
      durissimaFlexibilityReserveCost(move.card, fillRatio) -
      durissimaScarceValueCost(move.card, fillRatio) -
      durissimaGlobalScarcityPenalty(state, move.card, expectedDegree) +
      (teamMode ? durissimaTeamSetupBonus(state, playerId, move, requirement) : 0)
    );
  }

  function durissimaMoveDeadZoneStats(state, playerId, move) {
    const sim = cloneSimState(state, playerId);
    if (!applyPlacementSim(sim, playerId, move)) {
      return { blocked: Infinity, frontier: 0, fatal: true };
    }
    const outlookCards = durissimaClosureOutlook(state, playerId, move.cardUid);
    const blocked = durissimaUnreachableFrontier(sim, outlookCards);
    const frontier = candidateCells(sim).length;
    const fatal = frontier > 0 && blocked >= frontier;
    return { blocked, frontier, fatal };
  }

  /** Partita compromessa: tutta la frontiera resta inchiudibile con l'universo noto. */
  function durissimaMoveIsFatal(state, playerId, move) {
    return durissimaMoveDeadZoneStats(state, playerId, move).fatal;
  }

  /** In chiusura griglia conviene posare anche mosse rischiose piuttosto che bruciare il pool. */
  function durissimaPreferSafePlays(state) {
    const remaining = state.size * state.size - state.board.length;
    return remaining > Math.max(2, Math.ceil(state.size * 0.75));
  }

  function choosePlacementDurissima(state, playerId, requirement, random, branchLimit, teamMode, options) {
    options = options || {};
    const skipFatal = options.skipFatal === true;
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const sample = moves.length > branchLimit ? shuffle(moves, random).slice(0, branchLimit) : moves;
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const move of sample) {
      if (skipFatal && durissimaMoveIsFatal(state, playerId, move)) continue;
      const score = durissimaMoveScore(state, playerId, move, random, branchLimit, requirement, teamMode === true);
      if (score === -Infinity) continue;
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }
    if (!bestMoves.length) return null;
    return bestMoves[Math.floor(random() * bestMoves.length)];
  }

  const GN_MORPH_CACHE = new Map();
  const GN_MEMO_CAP = 50000;

  function isDurissimaGnIdeal(state) {
    return isDurissimaMater(state)
      && state.players === state.size
      && state.initialDrawCount === 0
      && (state.drawPile || []).length === 0
      && !(state.durissimaReserve || []).length;
  }

  function gnIdealCellInGrid(state, x, y) {
    return x >= 0 && y >= 0 && x < state.size && y < state.size;
  }

  /** Celle vuote nella griglia canonica 0..size-1 (G=N: non contare posizioni fuori griglia). */
  function gnEmptyCellsInIdealGrid(state) {
    if (!isDurissimaGnIdeal(state)) {
      return state.size * state.size - state.board.length;
    }
    const map = boardMap(state.board);
    let empty = 0;
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        if (!map.has(coordKey(x, y))) empty++;
      }
    }
    return empty;
  }

  function gnFilledCellsInIdealGrid(state) {
    if (!isDurissimaGnIdeal(state)) return state.board.length;
    const map = boardMap(state.board);
    let filled = 0;
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        if (map.has(coordKey(x, y))) filled++;
      }
    }
    return filled;
  }

  function gnFilterIdealGridMoves(state, moves) {
    if (!isDurissimaGnIdeal(state)) return moves;
    return moves.filter(move => gnIdealCellInGrid(state, move.x, move.y));
  }

  function gnIdealEmptyCellList(state) {
    const map = boardMap(state.board);
    const out = [];
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        if (!map.has(coordKey(x, y))) out.push({ x, y });
      }
    }
    return out;
  }

  /** Vuoti in griglia canonica raggiungibili ora (frontier). */
  function gnIdealFrontierEmptyCells(state) {
    if (!isDurissimaGnIdeal(state)) return gnIdealEmptyCellList(state);
    if (!state.board.length) return [{ x: 0, y: 0 }];
    const map = boardMap(state.board);
    const out = [];
    for (const cell of candidateCells(state)) {
      if (!gnIdealCellInGrid(state, cell.x, cell.y)) continue;
      if (!map.has(coordKey(cell.x, cell.y))) out.push(cell);
    }
    return out;
  }

  function gnCellFillableByPool(state, x, y) {
    const pool = gnPoolOutlookCards(state);
    const minReq = durissimaMinPlacementRequirement(state, x, y);
    for (const card of pool) {
      if (canPlaceCardAt(state, card, x, y, minReq)) return true;
    }
    return false;
  }

  function gnBipartitePerfectMatch(cellAdj, cardCount) {
    const matchCard = new Array(cardCount).fill(-1);
    function assignCell(cell, seen) {
      for (const ci of cellAdj[cell]) {
        if (seen[ci]) continue;
        seen[ci] = true;
        if (matchCard[ci] < 0 || assignCell(matchCard[ci], seen)) {
          matchCard[ci] = cell;
          return true;
        }
      }
      return false;
    }
    let matched = 0;
    for (let cell = 0; cell < cellAdj.length; cell++) {
      const seen = new Array(cardCount).fill(false);
      if (assignCell(cell, seen)) matched++;
    }
    return matched === cellAdj.length;
  }

  /** G=N: ogni vuoto in griglia ha almeno una carta del pool; se pochi vuoti, matching carte-celle. */
  function gnIdealFillMatchingPossible(state) {
    if (!isDurissimaGnIdeal(state)) return true;
    const cells = gnIdealFrontierEmptyCells(state);
    if (!cells.length) return true;
    const pool = gnPoolOutlookCards(state);
    if (pool.length < cells.length) return false;
    const cellAdj = cells.map(cell => {
      const minReq = durissimaMinPlacementRequirement(state, cell.x, cell.y);
      const opts = [];
      for (let i = 0; i < pool.length; i++) {
        if (canPlaceCardAt(state, pool[i], cell.x, cell.y, minReq)) opts.push(i);
      }
      return opts;
    });
    if (cellAdj.some(opts => !opts.length)) return false;
    if (cells.length > 8) return true;
    return gnBipartitePerfectMatch(cellAdj, pool.length);
  }

  function gnFirstUnfillableIdealCell(state) {
    if (!isDurissimaGnIdeal(state)) return null;
    for (const cell of gnIdealFrontierEmptyCells(state)) {
      if (!gnCellFillableByPool(state, cell.x, cell.y)) return cell;
    }
    return null;
  }

  function gnMoveBreaksIdealFillPlan(state, playerId, move) {
    if (!isDurissimaGnIdeal(state)) return false;
    const frame = gnApplyPlacementInPlace(state, playerId, move);
    if (!frame) return true;
    const ok = gnIdealFillMatchingPossible(state);
    gnUndoPlacementInPlace(state, frame);
    return !ok;
  }

  function gnPruneUnfillableIdealMoves(state, playerId, moves) {
    if (!isDurissimaGnIdeal(state)) return moves;
    const kept = moves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
    return kept.length ? kept : moves;
  }

  function gnCellPoolFillers(state, x, y) {
    const pool = gnPoolOutlookCards(state);
    const minReq = durissimaMinPlacementRequirement(state, x, y);
    const uids = [];
    for (const card of pool) {
      if (canPlaceCardAt(state, card, x, y, minReq)) uids.push(card.uid);
    }
    return uids;
  }

  function gnMergeCardReservation(map, conflicted, cell, uid) {
    if (conflicted.has(uid)) return;
    if (map.has(uid)) {
      const prev = map.get(uid);
      if (prev.x !== cell.x || prev.y !== cell.y) {
        map.delete(uid);
        conflicted.add(uid);
      }
    } else {
      map.set(uid, { x: cell.x, y: cell.y });
    }
  }

  function gnPoolCardByUid(state, uid) {
    for (const card of gnPoolOutlookCards(state)) {
      if (card.uid === uid) return card;
    }
    return null;
  }

  function gnCardIdealPlacementCount(state, uid) {
    const card = gnPoolCardByUid(state, uid);
    if (!card) return 99;
    let count = 0;
    for (const cell of gnIdealEmptyCellList(state)) {
      const minReq = durissimaMinPlacementRequirement(state, cell.x, cell.y);
      if (canPlaceCardAt(state, card, cell.x, cell.y, minReq)) count++;
    }
    return count;
  }

  function gnPairCellReservationPriority(state, cell, fillers, boundary) {
    let score = boundary ? 1000 : 0;
    score += (3 - Math.min(gnPoolOptionsForCell(state, cell.x, cell.y), 3)) * 50;
    for (const uid of fillers) {
      const anchor = gnCardIdealPlacementCount(state, uid);
      if (anchor === 1) score += 500;
      else if (anchor === 2) score += 200;
    }
    return score;
  }

  /** Coppie n=2: carta -> cella migliore (no conflitto che azzera la riserva). */
  function gnPairCellReservations(state, cells) {
    const ranked = [];
    for (const cell of cells) {
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (fillers.length !== 2) continue;
      const boundary = gnIdealCellOnBoundary(state, cell.x, cell.y);
      ranked.push({
        x: cell.x,
        y: cell.y,
        fillers,
        boundary,
        score: gnPairCellReservationPriority(state, cell, fillers, boundary)
      });
    }
    ranked.sort((a, b) => b.score - a.score);
    const map = new Map();
    const priority = new Map();
    for (const entry of ranked) {
      for (const uid of entry.fillers) {
        if (!map.has(uid) || entry.score > priority.get(uid)) {
          map.set(uid, { x: entry.x, y: entry.y });
          priority.set(uid, entry.score);
        }
      }
    }
    return map;
  }

  function gnCellLegalFillersAtReq(state, x, y, requirement) {
    const uids = new Set();
    for (let p = 0; p < state.players; p++) {
      for (const move of legalPlacements(state, p, requirement)) {
        if (move.x === x && move.y === y) uids.add(move.card.uid);
      }
    }
    return uids;
  }

  function gnSoleFillersByCellAtReq(state, requirement) {
    const out = [];
    for (const cell of gnIdealEmptyCellList(state)) {
      const uids = gnCellLegalFillersAtReq(state, cell.x, cell.y, requirement);
      if (uids.size === 1) out.push({ x: cell.x, y: cell.y, uid: [...uids][0] });
    }
    return out;
  }

  function gnSoleFillersByCellMinReq(state) {
    const out = [];
    for (const cell of gnIdealEmptyCellList(state)) {
      const minReq = durissimaMinPlacementRequirement(state, cell.x, cell.y);
      const uids = gnCellLegalFillersAtReq(state, cell.x, cell.y, minReq);
      if (uids.size === 1) out.push({ x: cell.x, y: cell.y, uid: [...uids][0], minReq });
    }
    return out;
  }

  function gnSingletonCellPriority(state, cell, uid) {
    const boundary = gnIdealCellOnBoundary(state, cell.x, cell.y);
    let score = boundary ? 1000 : 0;
    score += (3 - Math.min(gnPoolOptionsForCell(state, cell.x, cell.y), 3)) * 50;
    const edge = state.size - 1;
    if (cell.y === edge) score += 800;
    if (cell.x === edge) score += 600;
    if (gnCardIdealPlacementCount(state, uid) === 1) score += 500;
    const reqFillers = gnCellLegalFillersAtReq(state, cell.x, cell.y, 1);
    if (reqFillers.size > 1) score -= 1200;
    else if (reqFillers.size === 1 && reqFillers.has(uid)) score += 1200;
    return score;
  }

  /** Carta -> unica cella ideale che puo' coprire (singleton sul pool outlook). */
  function gnSingletonReservations(state) {
    if (!isDurissimaGnIdeal(state)) return new Map();
    if (state.size < 6) {
      const cardToCell = new Map();
      const conflicted = new Set();
      for (const cell of gnIdealEmptyCellList(state)) {
        const fillers = gnCellPoolFillers(state, cell.x, cell.y);
        if (fillers.length !== 1 || conflicted.has(fillers[0])) continue;
        gnMergeCardReservation(cardToCell, conflicted, cell, fillers[0]);
      }
      return cardToCell;
    }
    const cardToCell = new Map();
    const priority = new Map();
    for (const cell of gnIdealEmptyCellList(state)) {
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (fillers.length !== 1) continue;
      const uid = fillers[0];
      const score = gnSingletonCellPriority(state, cell, uid);
      if (!cardToCell.has(uid) || score > priority.get(uid)) {
        cardToCell.set(uid, { x: cell.x, y: cell.y });
        priority.set(uid, score);
      }
    }
    return cardToCell;
  }

  function gnExclusiveCardReservations(state) {
    if (!isDurissimaGnIdeal(state)) return new Map();
    const map = new Map();
    const conflicted = new Set();
    for (const card of gnPoolOutlookCards(state)) {
      const targets = [];
      for (const cell of gnIdealEmptyCellList(state)) {
        const minReq = durissimaMinPlacementRequirement(state, cell.x, cell.y);
        if (canPlaceCardAt(state, card, cell.x, cell.y, minReq)) targets.push(cell);
      }
      if (targets.length !== 1) continue;
      gnMergeCardReservation(map, conflicted, targets[0], card.uid);
    }
    return map;
  }

  /** Singleton + esclusive + coppie riservate su bordo/stretto. */
  function gnCardReservations(state) {
    const map = new Map();
    const conflicted = new Set();
    for (const [uid, cell] of gnSingletonReservations(state)) {
      gnMergeCardReservation(map, conflicted, cell, uid);
    }
    for (const [uid, cell] of gnExclusiveCardReservations(state)) {
      gnMergeCardReservation(map, conflicted, cell, uid);
    }
    for (const [uid, cell] of gnProspectiveCardReservations(state)) {
      gnMergeCardReservation(map, conflicted, cell, uid);
    }
    if (!isDurissimaGnIdeal(state) || state.size < 5) return map;
    if (state.size >= 6) {
      const pairCells = gnNarrowFrontierCells(state).filter(cell => cell.n === 2);
      for (const [uid, cell] of gnPairCellReservations(state, pairCells)) {
        gnMergeCardReservation(map, conflicted, cell, uid);
      }
      const closeReserve = gnEmptyCellsInIdealGrid(state) <= gnNarrowPairCloseThreshold(state.size);
      if (closeReserve) {
        const closeCells = gnIdealEmptyCellList(state).filter(cell => {
          const boundary = gnIdealCellOnBoundary(state, cell.x, cell.y);
          return boundary || gnIncludeInteriorTightCells(state);
        });
        for (const [uid, cell] of gnPairCellReservations(state, closeCells)) {
          gnMergeCardReservation(map, conflicted, cell, uid);
        }
      }
    } else {
      for (const cell of gnNarrowFrontierCells(state)) {
        if (cell.n !== 2) continue;
        const fillers = gnCellPoolFillers(state, cell.x, cell.y);
        for (const uid of fillers) {
          gnMergeCardReservation(map, conflicted, cell, uid);
        }
      }
      const closeReserve = gnEmptyCellsInIdealGrid(state) <= gnNarrowPairCloseThreshold(state.size);
      if (closeReserve) {
        for (const cell of gnIdealEmptyCellList(state)) {
          const boundary = gnIdealCellOnBoundary(state, cell.x, cell.y);
          if (!boundary && !gnIncludeInteriorTightCells(state)) continue;
          const fillers = gnCellPoolFillers(state, cell.x, cell.y);
          if (fillers.length !== 2) continue;
          for (const uid of fillers) {
            gnMergeCardReservation(map, conflicted, cell, uid);
          }
        }
      }
    }
    return map;
  }

  function gnIncludeInteriorTightCells(state) {
    const empty = gnEmptyCellsInIdealGrid(state);
    if (state.size >= 6) {
      return empty <= Math.ceil(state.size * state.size * 0.42);
    }
    return empty <= gnEndgameExactThreshold(state.size) + 2;
  }

  function gnTightIdealCells(state) {
    const maxOpts = state.size >= 6 ? 2 : 2;
    return gnIdealEmptyCellList(state).filter(cell => {
      const n = gnPoolOptionsForCell(state, cell.x, cell.y);
      return n > 0 && n <= maxOpts;
    });
  }

  function gnPruneExhaustsTightIdealMoves(state, playerId, moves) {
    if (!isDurissimaGnIdeal(state) || state.size < 5) return moves;
    const tight = gnTightIdealCells(state);
    if (!tight.length) return moves;
    const before = new Map();
    for (const cell of tight) {
      before.set(coordKey(cell.x, cell.y), gnPoolOptionsForCell(state, cell.x, cell.y));
    }
    const kept = moves.filter(move => {
      const frame = gnApplyPlacementInPlace(state, playerId, move);
      if (!frame) return false;
      let bad = false;
      for (const [key, prev] of before) {
        if (prev <= 0) continue;
        const parts = key.split(",");
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (move.x === x && move.y === y) continue;
        if (gnPoolOptionsForCell(state, x, y) === 0) {
          bad = true;
          break;
        }
      }
      gnUndoPlacementInPlace(state, frame);
      return !bad;
    });
    return kept.length ? kept : moves;
  }

  function gnRippleEmptyCells(state) {
    const map = boardMap(state.board);
    const frontier = gnIdealFrontierEmptyCells(state);
    const frontierKeys = new Set(frontier.map(cell => coordKey(cell.x, cell.y)));
    const out = [];
    const seen = new Set();
    for (const cell of frontier) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        const key = coordKey(x, y);
        if (!gnIdealCellInGrid(state, x, y)) continue;
        if (map.has(key) || frontierKeys.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push({ x, y });
      }
    }
    return out;
  }

  function gnProspectiveCardReservations(state) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return new Map();
    const map = new Map();
    const conflicted = new Set();
    const frontier = gnIdealFrontierEmptyCells(state);
    for (const cell of frontier) {
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (fillers.length === 1) {
        gnMergeCardReservation(map, conflicted, cell, fillers[0]);
      } else if (fillers.length === 2) {
        for (const uid of fillers) gnMergeCardReservation(map, conflicted, cell, uid);
      }
    }
    for (const cell of gnRippleEmptyCells(state)) {
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (fillers.length !== 1) continue;
      gnMergeCardReservation(map, conflicted, cell, fillers[0]);
    }
    return map;
  }

  function gnNarrowFrontierCells(state) {
    if (!isDurissimaGnIdeal(state)) return [];
    const cacheKey = state.board.length + "#" + gnFilledCellsInIdealGrid(state);
    if (state._gnNarrowFrontierKey === cacheKey && state._gnNarrowFrontier) {
      return state._gnNarrowFrontier;
    }
    const includeInterior = gnIncludeInteriorTightCells(state);
    const out = [];
    for (const cell of gnIdealFrontierEmptyCells(state)) {
      const boundary = gnIdealCellOnBoundary(state, cell.x, cell.y);
      if (!boundary && !includeInterior) continue;
      const n = gnCellPoolFillers(state, cell.x, cell.y).length;
      if (n >= 1 && n <= 2) out.push({ x: cell.x, y: cell.y, n, boundary });
    }
    out.sort((a, b) => {
      if (a.n !== b.n) return a.n - b.n;
      if (a.boundary !== b.boundary) return a.boundary ? -1 : 1;
      return 0;
    });
    state._gnNarrowFrontierKey = cacheKey;
    state._gnNarrowFrontier = out;
    return out;
  }

  function gnPruneReservedCardMisuse(state, moves) {
    if (!isDurissimaGnIdeal(state)) return moves;
    const reservations = gnCardReservations(state);
    if (!reservations.size) return moves;
    const kept = moves.filter(move => {
      const reserved = reservations.get(move.card.uid);
      if (!reserved) return true;
      return move.x === reserved.x && move.y === reserved.y;
    });
    return kept.length ? kept : moves;
  }

  function gnPoolOptionsForCell(state, x, y) {
    const pool = gnPoolOutlookCards(state);
    const minReq = durissimaMinPlacementRequirement(state, x, y);
    let count = 0;
    for (const card of pool) {
      if (canPlaceCardAt(state, card, x, y, minReq)) count++;
    }
    return count;
  }

  function gnIdealCellOnBoundary(state, x, y) {
    const n = state.size - 1;
    return x === 0 || y === 0 || x === n || y === n;
  }

  function gnBoundaryEmptyRisk(state) {
    if (!isDurissimaGnIdeal(state)) return 0;
    let risk = 0;
    for (const cell of gnIdealEmptyCellList(state)) {
      if (!gnIdealCellOnBoundary(state, cell.x, cell.y)) continue;
      const opts = gnPoolOptionsForCell(state, cell.x, cell.y);
      if (opts <= 0) risk += 200;
      else if (opts === 1) risk += 140;
      else if (opts === 2) risk += 55;
      else if (opts === 3) risk += 18;
    }
    return risk;
  }

  function gnMoveTouchesBoundaryEmpty(state, move) {
    if (gnIdealCellOnBoundary(state, move.x, move.y)) return true;
    for (const cell of gnIdealEmptyCellList(state)) {
      if (!gnIdealCellOnBoundary(state, cell.x, cell.y)) continue;
      const dx = Math.abs(cell.x - move.x);
      const dy = Math.abs(cell.y - move.y);
      if (dx + dy === 1) return true;
    }
    return false;
  }

  function gnMoveSealsIdealCell(state, playerId, move) {
    if (!isDurissimaGnIdeal(state) || state.size < 5) return false;
    if (!gnMoveTouchesBoundaryEmpty(state, move)) return false;
    const before = new Map();
    for (const cell of gnIdealEmptyCellList(state)) {
      if (!gnIdealCellOnBoundary(state, cell.x, cell.y)) continue;
      before.set(coordKey(cell.x, cell.y), gnPoolOptionsForCell(state, cell.x, cell.y));
    }
    if (!before.size) return false;
    const frame = gnApplyPlacementInPlace(state, playerId, move);
    if (!frame) return true;
    let sealed = false;
    for (const [key, prev] of before) {
      const parts = key.split(",");
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (prev > 0 && gnPoolOptionsForCell(state, x, y) === 0) {
        sealed = true;
        break;
      }
    }
    gnUndoPlacementInPlace(state, frame);
    return sealed;
  }

  function gnPruneSealsIdealCellMoves(state, playerId, moves) {
    if (!isDurissimaGnIdeal(state) || state.size < 5) return moves;
    const includeInterior = gnIncludeInteriorTightCells(state);
    const boundaryEmpty = gnIdealEmptyCellList(state).filter(cell =>
      gnIdealCellOnBoundary(state, cell.x, cell.y) || includeInterior
    );
    if (!boundaryEmpty.length) return moves;
    const before = new Map();
    for (const cell of boundaryEmpty) {
      before.set(coordKey(cell.x, cell.y), gnPoolOptionsForCell(state, cell.x, cell.y));
    }
    function moveRelevant(move) {
      for (const cell of boundaryEmpty) {
        if (move.x === cell.x && move.y === cell.y) return true;
        const dx = Math.abs(cell.x - move.x);
        const dy = Math.abs(cell.y - move.y);
        if (dx + dy === 1) return true;
      }
      return false;
    }
    const kept = moves.filter(move => {
      if (!moveRelevant(move)) return true;
      const frame = gnApplyPlacementInPlace(state, playerId, move);
      if (!frame) return false;
      let sealed = false;
      for (const [key, prev] of before) {
        if (prev <= 0) continue;
        const parts = key.split(",");
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (gnPoolOptionsForCell(state, x, y) === 0) {
          sealed = true;
          break;
        }
      }
      gnUndoPlacementInPlace(state, frame);
      return !sealed;
    });
    return kept.length ? kept : moves;
  }

  function gnBranchLimitForSize(size) {
    if (size <= 3) return 24;
    if (size <= 4) return 20;
    if (size <= 5) return 32;
    return 28;
  }

  /** Tetto nodi DFS per partita (G=N). 3x3/4x4: basso, velocita' > copertura totale. */
  function gnMaxNodesForSize(size) {
    if (size <= 3) return 80000;
    if (size <= 4) return 200000;
    if (size <= 5) return 500000;
    if (size <= 6) return 800000;
    if (size <= 7) return 1000000;
    return 1200000;
  }

  /** Tetto nodi per singola decisione del global-planner. */
  function gnPerMoveNodesForSize(size) {
    if (size <= 3) return 15000;
    if (size <= 4) return 20000;
    if (size <= 5) return 35000;
    if (size <= 6) return 60000;
    if (size <= 7) return 80000;
    return 100000;
  }

  /** Memo e budget nodi condivisi per tutta la partita G=N (non per singola mossa). */
  function gnSearchContextForState(state, options) {
    options = options || {};
    if (options.memo) return options;
    if (!state._gnPlannerSearch) {
      state._gnPlannerSearch = {
        branchLimit: gnBranchLimitForSize(state.size),
        maxNodes: gnMaxNodesForSize(state.size),
        useMorphology: options.useMorphology !== false,
        memo: new Map(),
        stats: { nodes: 0, maxDepth: 0, memoHits: 0, memoClears: 0 }
      };
    }
    return state._gnPlannerSearch;
  }

  function gnSearchBudgetLeft(ctx) {
    return Math.max(0, (ctx.maxNodes || 0) - (ctx.stats?.nodes || 0));
  }

  function gnAdaptiveBranchLimit(state, base) {
    const fillRatio = state.board.length / (state.size * state.size);
    if (fillRatio >= 0.84) return base + 10;
    if (fillRatio >= 0.6) return base + 6;
    if (fillRatio >= 0.4) return base + 2;
    return base;
  }

  function gnEndgameReserveNodes(size) {
    if (size <= 4) return 0;
    return Math.floor(gnMaxNodesForSize(size) * 0.36);
  }

  function gnMoveSearchOptions(state, options) {
    const ctx = gnSearchContextForState(state, options);
    const gameLeft = gnSearchBudgetLeft(ctx);
    if (gameLeft <= 0) return null;
    const totalCells = state.size * state.size;
    const empty = totalCells - state.board.length;
    const fillRatio = state.board.length / totalCells;
    const baseMoveLimit = gnPerMoveNodesForSize(state.size);
    let moveLimit = baseMoveLimit;
    const reserve = gnEndgameReserveNodes(state.size);
    const spent = ctx.stats.nodes;
    const endgame = empty <= 10 || fillRatio >= 0.55;
    if (endgame) {
      if (empty <= 4 || fillRatio >= 0.84) {
        moveLimit = Math.max(baseMoveLimit * 3, baseMoveLimit);
      } else if (fillRatio >= 0.6) {
        moveLimit = Math.floor(baseMoveLimit * 1.5);
      }
      if (state.size === 6 && isDurissimaGnIdeal(state) && gnEmptyCellsInIdealGrid(state) <= 8) {
        moveLimit = Math.max(moveLimit, Math.floor(baseMoveLimit * 2.2));
      }
      moveLimit = Math.min(gameLeft, Math.max(moveLimit, Math.floor(gameLeft * 0.22)));
    } else if (reserve > 0 && spent > ctx.maxNodes - reserve) {
      moveLimit = Math.floor(baseMoveLimit * 0.5);
    }
    moveLimit = Math.min(Math.max(4000, moveLimit), gameLeft);
    return {
      branchLimit: gnAdaptiveBranchLimit(state, ctx.branchLimit),
      maxNodes: ctx.maxNodes,
      useMorphology: ctx.useMorphology !== false,
      memo: ctx.memo,
      stats: ctx.stats,
      moveNodeStart: ctx.stats.nodes,
      moveNodeLimit: moveLimit
    };
  }

  function gnMorphAxisIndex(card, axis) {
    if (axis === "value") return VALUES.indexOf(card.value);
    if (axis === "shape") return SHAPES.indexOf(card.shape);
    return COLORS.indexOf(card.color);
  }

  function gnMorphCubeCoord(card) {
    return {
      x: gnMorphAxisIndex(card, "value"),
      y: gnMorphAxisIndex(card, "shape"),
      z: gnMorphAxisIndex(card, "color")
    };
  }

  function gnMorphCubeL1(a, b) {
    const ca = gnMorphCubeCoord(a);
    const cb = gnMorphCubeCoord(b);
    return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y) + Math.abs(ca.z - cb.z);
  }

  function gnMorphShareTraitCount(a, b) {
    let s = 0;
    if (a.value === b.value) s++;
    if (a.shape === b.shape) s++;
    if (a.color === b.color) s++;
    return s;
  }

  function gnMorphExpectedFinalDegree(x, y, size) {
    let d = 0;
    if (x > 0) d++;
    if (x < size - 1) d++;
    if (y > 0) d++;
    if (y < size - 1) d++;
    return d;
  }

  function buildGnMorphologyForSize(size) {
    const deck = simulationDeck().filter(card => Number(card.value) <= size);
    const valueCnt = new Map();
    const shapeCnt = new Map();
    const colorCnt = new Map();
    for (const card of deck) {
      valueCnt.set(card.value, (valueCnt.get(card.value) || 0) + 1);
      shapeCnt.set(card.shape, (shapeCnt.get(card.shape) || 0) + 1);
      colorCnt.set(card.color, (colorCnt.get(card.color) || 0) + 1);
    }
    function axisWeight(count) {
      return 1 / Math.max(1, count);
    }
    function cardMorph(card) {
      const vc = valueCnt.get(card.value) || 1;
      const sc = shapeCnt.get(card.shape) || 1;
      const cc = colorCnt.get(card.color) || 1;
      const rigidity = axisWeight(vc) + axisWeight(sc) + axisWeight(cc);
      const flexibility = vc + sc + cc;
      const coord = gnMorphCubeCoord(card);
      const positionalSum = POSITIONAL_COUNTS[coord.x]
        + POSITIONAL_COUNTS[coord.y]
        + POSITIONAL_COUNTS[coord.z];
      return { rigidity, flexibility, positionalSum, coord };
    }
    return {
      size,
      cardMorph,
      cubeL1: gnMorphCubeL1,
      shareTraitCount: gnMorphShareTraitCount,
      expectedFinalDegree: gnMorphExpectedFinalDegree
    };
  }

  function gnMorphologyForSize(size) {
    if (!GN_MORPH_CACHE.has(size)) GN_MORPH_CACHE.set(size, buildGnMorphologyForSize(size));
    return GN_MORPH_CACHE.get(size);
  }

  function gnMorphMoveScore(morph, state, move) {
    const m = morph.cardMorph(move.card);
    const cellDeg = morph.expectedFinalDegree(move.x, move.y, state.size);
    let slotFit = 0;
    if (cellDeg <= 2) slotFit += m.rigidity * 14;
    else if (cellDeg === 3) slotFit += m.rigidity * 6 - m.flexibility * 0.15;
    else slotFit += m.flexibility * 0.35 - m.rigidity * 2;
    let morphStress = 0;
    const map = boardMap(state.board);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const dir of dirs) {
      const adj = map.get(coordKey(move.x + dir.x, move.y + dir.y));
      if (!adj) continue;
      const traits = morph.shareTraitCount(move.card, adj.card);
      const l1 = morph.cubeL1(move.card, adj.card);
      if (traits === 1) morphStress += l1 * 0.55;
      else if (traits === 2) morphStress += l1 * 0.12;
      else morphStress -= 2;
    }
    return slotFit - morphStress - m.positionalSum * 0.02;
  }

  function gnForkSearchState(state) {
    return {
      size: state.size,
      players: state.players,
      status: state.status,
      currentPlayer: state.currentPlayer,
      turns: state.turns,
      turnPlayed: state.turnPlayed,
      turnDirection: state.turnDirection,
      consecutivePasses: state.consecutivePasses,
      widthAxisFixed: state.widthAxisFixed === true,
      heightAxisFixed: state.heightAxisFixed === true,
      duraMaterClosed: state.duraMaterClosed === true,
      closedByPlayer: state.closedByPlayer,
      firstAxisInversionDone: state.firstAxisInversionDone === true,
      durissimaMater: state.durissimaMater === true,
      initialDrawCount: state.initialDrawCount,
      initialHandSize: state.initialHandSize,
      drawPile: (state.drawPile || []).map(cloneCardSnapshot),
      durissimaReserve: (state.durissimaReserve || []).map(cloneCardSnapshot),
      hands: state.hands.map(hand => (hand || []).map(cloneCardSnapshot)),
      board: state.board.map(entry => ({
        x: entry.x,
        y: entry.y,
        playerId: entry.playerId,
        card: cloneCardSnapshot(entry.card)
      })),
      turnOrder: (state.turnOrder || []).slice(),
      winner: state.winner,
      lastMove: state.lastMove
        ? {
            playerId: state.lastMove.playerId,
            card: cloneCardSnapshot(state.lastMove.card),
            x: state.lastMove.x,
            y: state.lastMove.y,
            matches: state.lastMove.matches,
            requirement: state.lastMove.requirement,
            idea: state.lastMove.idea
          }
        : null,
      turnPlacementStats: state.turnPlacementStats
        ? {
            byCount: state.turnPlacementStats.byCount.slice(),
            maxInTurn: state.turnPlacementStats.maxInTurn,
            ideaOffers: state.turnPlacementStats.ideaOffers || 0
          }
        : null
    };
  }

  function gnCapturePlacementFrame(state, playerId, move) {
    const hand = state.hands[playerId] || [];
    const handIndex = hand.findIndex(entry => entry.uid === move.cardUid);
    if (handIndex < 0) return null;
    return {
      playerId,
      handIndex,
      card: hand[handIndex],
      consecutivePasses: state.consecutivePasses,
      turnPlayed: state.turnPlayed,
      lastMove: state.lastMove,
      status: state.status,
      winner: state.winner,
      widthAxisFixed: state.widthAxisFixed === true,
      heightAxisFixed: state.heightAxisFixed === true,
      duraMaterClosed: state.duraMaterClosed === true,
      closedByPlayer: state.closedByPlayer,
      firstAxisInversionDone: state.firstAxisInversionDone === true,
      turnDirection: state.turnDirection,
      ideaOffers: state.turnPlacementStats ? state.turnPlacementStats.ideaOffers : 0
    };
  }

  function gnApplyPlacementInPlace(state, playerId, move) {
    const frame = gnCapturePlacementFrame(state, playerId, move);
    if (!frame) return null;
    try {
      applyPlacement(state, playerId, move);
    } catch (_err) {
      return null;
    }
    return frame;
  }

  function gnUndoPlacementInPlace(state, frame) {
    state.hands[frame.playerId].splice(frame.handIndex, 0, frame.card);
    state.board.pop();
    state.consecutivePasses = frame.consecutivePasses;
    state.turnPlayed = frame.turnPlayed;
    state.lastMove = frame.lastMove;
    state.status = frame.status;
    state.winner = frame.winner;
    state.widthAxisFixed = frame.widthAxisFixed;
    state.heightAxisFixed = frame.heightAxisFixed;
    state.duraMaterClosed = frame.duraMaterClosed;
    state.closedByPlayer = frame.closedByPlayer;
    state.firstAxisInversionDone = frame.firstAxisInversionDone;
    state.turnDirection = frame.turnDirection;
    if (state.turnPlacementStats) state.turnPlacementStats.ideaOffers = frame.ideaOffers;
  }

  function gnCaptureEndTurnFrame(state) {
    const playerId = state.currentPlayer;
    const hand = state.hands[playerId] || [];
    return {
      turns: state.turns,
      currentPlayer: playerId,
      turnPlayed: state.turnPlayed,
      handLen: hand.length,
      pileLen: (state.drawPile || []).length,
      stats: state.turnPlacementStats
        ? {
            byCount: state.turnPlacementStats.byCount.slice(),
            maxInTurn: state.turnPlacementStats.maxInTurn
          }
        : null
    };
  }

  function gnApplyEndTurnInPlace(state) {
    const frame = gnCaptureEndTurnFrame(state);
    endTurn(state);
    const hand = state.hands[frame.currentPlayer] || [];
    if (hand.length > frame.handLen && (state.drawPile || []).length < frame.pileLen) {
      frame.drawnCard = hand[hand.length - 1];
    }
    return frame;
  }

  function gnUndoEndTurnInPlace(state, frame) {
    if (frame.drawnCard) {
      const hand = state.hands[frame.currentPlayer] || [];
      if (hand.length && hand[hand.length - 1].uid === frame.drawnCard.uid) {
        hand.pop();
        state.drawPile.unshift(frame.drawnCard);
      }
    }
    state.turns = frame.turns;
    state.currentPlayer = frame.currentPlayer;
    state.turnPlayed = frame.turnPlayed;
    if (frame.stats && state.turnPlacementStats) {
      state.turnPlacementStats.byCount = frame.stats.byCount;
      state.turnPlacementStats.maxInTurn = frame.stats.maxInTurn;
    }
  }

  function gnStateKey(state) {
    const board = state.board
      .map(entry => entry.x + "," + entry.y + ":" + entry.card.uid)
      .sort()
      .join(";");
    const hands = state.hands
      .map(hand => (hand || []).map(card => card.uid).sort().join("+"))
      .join("|");
    return [
      board,
      hands,
      state.currentPlayer,
      state.turnPlayed,
      state.turnDirection,
      state.duraMaterClosed ? 1 : 0,
      state.widthAxisFixed ? 1 : 0,
      state.heightAxisFixed ? 1 : 0,
      state.firstAxisInversionDone ? 1 : 0
    ].join("#");
  }

  /** Euristica coop (senza DFS): come team-planner, deterministica. */
  function gnGlobalMoveScore(state, playerId, move) {
    const requirement = placementRequirement(state);
    const random = () => 0;
    return durissimaMoveScore(state, playerId, move, random, 8, requirement, true);
  }

  function gnMoveRank(state, playerId, move, options) {
    options = options || {};
    if (options.useGlobalHeuristic === true) {
      let score = gnGlobalMoveScore(state, playerId, move);
      if (gnFastMoveFatal(state, playerId, move)) score -= 100000;
      if (options.useMorphology !== false) {
        score += gnMorphMoveScore(gnMorphologyForSize(state.size), state, move) * 0.12;
      }
      if (isDurissimaGnIdeal(state) && gnEmptyCellsInIdealGrid(state) <= gnNarrowHeuristicEmptyCap(state.size)) {
        const narrow = options._narrowFrontier || gnNarrowFrontierCells(state);
        for (const cell of narrow) {
          if (move.x === cell.x && move.y === cell.y) {
            score += 40000 + (3 - cell.n) * 5000;
            break;
          }
        }
      }
      return score;
    }
    let score = move.matches * 3 + move.neighbors * 2 - (Number(move.card.value) || 0) * 0.05;
    if (gnFastMoveFatal(state, playerId, move)) score -= 500;
    else score += compatibilityScore(move.card) * 0.2;
    if (options.useMorphology !== false) {
      score += gnMorphMoveScore(gnMorphologyForSize(state.size), state, move);
    }
    return score;
  }

  function gnMemoStore(memo, stats, key, value) {
    if (memo.size >= GN_MEMO_CAP) {
      memo.clear();
      if (stats) stats.memoClears = (stats.memoClears || 0) + 1;
    }
    memo.set(key, value);
  }

  /**
   * Soglia tablebase (ricerca esatta). L<=4: sempre esatto (veloce).
   * L=5: shallow in apertura, esatto con <=10 vuote. L>=6: come prima.
   */
  function gnCriticalEmptyThreshold(size) {
    if (size <= 4) return size * size;
    if (size === 5) return 10;
    return Math.max(22, Math.ceil(size * size * 0.40));
  }

  /** Soglia vuoti per DFS esatto in chiusura (L<=5) o shallow endgame (L>=6). */
  function gnEndgameExactThreshold(size) {
    if (size <= 4) return size * size;
    if (size === 5) return 8;
    if (size === 6) return 12;
    if (size === 7) return 16;
    return 20;
  }

  /** Sotto questa soglia riserviamo coppie su celle di bordo strette. */
  function gnNarrowPairCloseThreshold(size) {
    if (size <= 5) return 4;
    if (size === 6) return 10;
    if (size === 7) return 12;
    return 14;
  }

  function gnNarrowHeuristicEmptyCap(size) {
    return gnEndgameExactThreshold(size) + Math.max(2, Math.floor(size * 0.6));
  }

  function gnShallowMaxDepth(size) {
    if (size <= 5) return 8;
    if (size <= 6) return 6;
    return 5;
  }

  function gnShallowNodesPerMove(size) {
    if (size <= 5) return 6000;
    if (size <= 6) return 4000;
    return 3000;
  }

  function gnEvaluatePosition(state) {
    const total = state.size * state.size;
    const filled = state.board.length;
    let score = filled * 12;
    const empty = total - filled;
    score -= empty * 2;
    if (gnForwardFrontierDead(state)) score -= 800;
    else {
      const frontier = candidateCells(state).length;
      if (frontier > 0) {
        const blocked = durissimaUnreachableFrontier(state, gnPoolOutlookCards(state));
        score -= blocked * 80;
        score += (frontier - blocked) * 5;
      }
    }
    const pool = gnPoolOutlookCards(state);
    score -= Math.max(0, pool.length - empty) * 3;
    return score;
  }

  function gnShallowActionKey(action) {
    if (!action) return "null";
    if (action.type === "stop") return "stop";
    const m = action.move;
    return "move:" + m.cardUid + "@" + m.x + "," + m.y;
  }

  function gnShallowSearchOptions(state, options) {
    const ctx = gnSearchContextForState(state, options);
    const gameLeft = gnSearchBudgetLeft(ctx);
    if (gameLeft <= 0) return null;
    const perMove = gnShallowNodesPerMove(state.size);
    return {
      branchLimit: gnAdaptiveBranchLimit(state, ctx.branchLimit),
      maxNodes: ctx.maxNodes,
      maxDepth: gnShallowMaxDepth(state.size),
      useMorphology: ctx.useMorphology !== false,
      memo: ctx.memo,
      stats: ctx.stats,
      moveNodeStart: ctx.stats.nodes,
      moveNodeLimit: Math.min(Math.max(2000, perMove), gameLeft),
      _shallowScores: null
    };
  }

  function gnIsCriticalPosition(state) {
    const size = state.size;
    if (size <= 5) return true;
    const empty = size * size - state.board.length;
    if (empty <= gnCriticalEmptyThreshold(size)) return true;
    if (gnForwardFrontierDead(state)) return true;
    const pool = gnPoolOutlookCards(state);
    if (empty <= size + 8 && pool.length <= empty + 2) return true;
    return false;
  }

  function gnPoolOutlookCards(state) {
    return durissimaAllKnownCards(state, state.currentPlayer, null);
  }

  function gnForwardFrontierDead(state) {
    const frontier = candidateCells(state).length;
    if (!frontier) return false;
    const blocked = durissimaUnreachableFrontier(state, gnPoolOutlookCards(state));
    return blocked >= frontier;
  }

  function gnFastMoveFatal(state, playerId, move) {
    const frame = gnApplyPlacementInPlace(state, playerId, move);
    if (!frame) return true;
    const frontier = candidateCells(state).length;
    let fatal = false;
    if (frontier > 0) {
      const blocked = durissimaUnreachableFrontier(state, gnPoolOutlookCards(state));
      fatal = blocked >= frontier;
    }
    gnUndoPlacementInPlace(state, frame);
    return fatal;
  }

  function gnPruneFatalMoves(state, playerId, moves) {
    if (!durissimaPreferSafePlays(state)) return moves;
    let kept = moves.filter(move => !gnFastMoveFatal(state, playerId, move));
    if (!kept.length) kept = moves;
    kept = gnPruneUnfillableIdealMoves(state, playerId, kept);
    kept = gnPruneSealsIdealCellMoves(state, playerId, kept);
    kept = gnPruneExhaustsTightIdealMoves(state, playerId, kept);
    return gnPruneReservedCardMisuse(state, kept);
  }

  function gnSingletonForcedKeys(state, moves) {
    const reservations = gnCardReservations(state);
    if (!reservations.size) return new Set();
    const forcedKeys = new Set();
    for (const move of moves) {
      const reserved = reservations.get(move.card.uid);
      if (!reserved) continue;
      if (move.x === reserved.x && move.y === reserved.y) {
        forcedKeys.add(move.cardUid + "@" + move.x + "," + move.y);
      }
    }
    return forcedKeys;
  }

  function gnPickBestForcedSingletonMove(state, moves, forcedKeys) {
    const frontierKeys = new Set(
      gnIdealFrontierEmptyCells(state).map(cell => coordKey(cell.x, cell.y))
    );
    const onFrontier = moves.filter(move => {
      const key = move.cardUid + "@" + move.x + "," + move.y;
      return forcedKeys.has(key) && frontierKeys.has(coordKey(move.x, move.y));
    });
    const candidates = onFrontier.length ? onFrontier : moves.filter(move => {
      const key = move.cardUid + "@" + move.x + "," + move.y;
      return forcedKeys.has(key);
    });
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const sameCell = candidates.every(move => move.x === candidates[0].x && move.y === candidates[0].y);
    if (sameCell) return gnPickSameCellReservedMove(state, candidates);
    candidates.sort((a, b) =>
      gnPoolOptionsForCell(state, a.x, a.y) - gnPoolOptionsForCell(state, b.x, b.y)
    );
    return candidates[0];
  }

  function gnPrioritizeSingletonMoves(state, moves) {
    const forcedKeys = gnSingletonForcedKeys(state, moves);
    if (!forcedKeys.size) return moves;
    const priority = [];
    const rest = [];
    for (const move of moves) {
      const key = move.cardUid + "@" + move.x + "," + move.y;
      if (forcedKeys.has(key)) priority.push(move);
      else rest.push(move);
    }
    return priority.concat(rest);
  }

  function gnApplyPatchMoveFilter(moves, options) {
    const rect = options && options.patchRect;
    if (!rect) return moves;
    const filtered = moves.filter(move =>
      move.x >= rect.ox && move.x < rect.ox + rect.w
      && move.y >= rect.oy && move.y < rect.oy + rect.h
    );
    if (options.patchFilter === "strict") return filtered;
    return filtered.length ? filtered : moves;
  }

  function gnSolverMoveList(state, playerId, branchLimit, options) {
    options = options || {};
    const requirement = placementRequirement(state);
    let moves = legalPlacements(state, playerId, requirement);
    moves = gnFilterIdealGridMoves(state, moves);
    moves = gnPruneFatalMoves(state, playerId, moves);
    moves = gnPrioritizeSingletonMoves(state, moves);
    moves = gnApplyPatchMoveFilter(moves, options);
    return gnOrderedMoves(state, playerId, moves, branchLimit, options);
  }

  function gnOrderedMoves(state, playerId, moves, branchLimit, options) {
    options = options || {};
    if (isDurissimaGnIdeal(state) && gnEmptyCellsInIdealGrid(state) <= gnNarrowHeuristicEmptyCap(state.size)) {
      options._narrowFrontier = gnNarrowFrontierCells(state);
    }
    const forced = gnSingletonForcedKeys(state, moves);
    const ranked = moves
      .map(move => {
        let score = gnMoveRank(state, playerId, move, options);
        const key = move.cardUid + "@" + move.x + "," + move.y;
        if (forced.has(key)
          && (state.turnPlayed > 0 || gnReservedMacroStepViable(state, playerId, move))) {
          score += 50000;
        }
        return { move, score };
      })
      .sort((a, b) => b.score - a.score);
    const cap = Math.max(1, branchLimit || ranked.length);
    return ranked.slice(0, cap).map(entry => entry.move);
  }

  function solveGnStateOutcome(state, options) {
    options = options || {};
    const ctx = gnSearchContextForState(state, options);
    const branchLimit = options.branchLimit || ctx.branchLimit || gnBranchLimitForSize(state.size);
    const maxNodes = options.maxNodes || ctx.maxNodes || gnMaxNodesForSize(state.size);
    const memo = options.memo || ctx.memo || new Map();
    const stats = options.stats || ctx.stats || { nodes: 0, maxDepth: 0, memoHits: 0 };
    const trackAction = options.trackAction === true;
    let foundAction = null;

    function dfs(gameState, depth, rootAction) {
      if (stats.nodes >= maxNodes) return "budget";
      if (
        options.moveNodeLimit != null
        && stats.nodes - (options.moveNodeStart || 0) >= options.moveNodeLimit
      ) return "budget";
      stats.nodes++;
      if (depth > stats.maxDepth) stats.maxDepth = depth;

      if (options.maxDepth != null && depth >= options.maxDepth) {
        if (trackAction && rootAction) {
          const ev = gnEvaluatePosition(gameState);
          if (!options._shallowScores) options._shallowScores = new Map();
          const sk = gnShallowActionKey(rootAction);
          const prev = options._shallowScores.get(sk);
          if (!prev || ev > prev.eval) {
            options._shallowScores.set(sk, { eval: ev, action: rootAction });
          }
        }
        return "cutoff";
      }

      if (options.patchCompleteTarget && gnIsPatchComplete(gameState, options.patchCompleteTarget)) {
        return "solved";
      }

      if (gameState.status === "success" || isBoardComplete(gameState)) {
        gameState.status = "success";
        return "solved";
      }
      if (gameState.status !== "playing") return "dead";

      const key = gnStateKey(gameState);
      if (memo.has(key) && !(trackAction && depth === 0)) {
        stats.memoHits++;
        const cached = memo.get(key);
        return cached === "solved" ? "solved" : (cached === "unsolved" ? "unsolved" : "budget");
      }
      if (gnForwardFrontierDead(gameState)) {
        gnMemoStore(memo, stats, key, "unsolved");
        return "unsolved";
      }

      const playerId = gameState.currentPlayer;
      const moves = gnSolverMoveList(gameState, playerId, branchLimit, options);

      for (const move of moves) {
        const nextRoot = depth === 0 ? { type: "move", move } : rootAction;
        const placeFrame = gnApplyPlacementInPlace(gameState, playerId, move);
        if (!placeFrame) continue;
        if (gameState.status === "success"
          || (options.patchCompleteTarget && gnIsPatchComplete(gameState, options.patchCompleteTarget))) {
          if (trackAction && depth === 0) foundAction = nextRoot;
          gnMemoStore(memo, stats, key, "solved");
          gnUndoPlacementInPlace(gameState, placeFrame);
          return "solved";
        }
        if (gameState.status !== "playing") {
          gnUndoPlacementInPlace(gameState, placeFrame);
          continue;
        }
        let endFrame = null;
        if (gameState.turnPlayed >= 5) endFrame = gnApplyEndTurnInPlace(gameState);
        const outcome = dfs(gameState, depth + 1, nextRoot);
        if (endFrame) gnUndoEndTurnInPlace(gameState, endFrame);
        gnUndoPlacementInPlace(gameState, placeFrame);
        if (outcome === "solved") {
          if (trackAction && nextRoot) foundAction = nextRoot;
          gnMemoStore(memo, stats, key, "solved");
          return "solved";
        }
        if (outcome === "budget") return "budget";
        if (outcome === "cutoff" && trackAction && nextRoot && options._shallowScores) {
          const sk = gnShallowActionKey(nextRoot);
          if (!options._shallowScores.has(sk)) {
            options._shallowScores.set(sk, {
              eval: gnEvaluatePosition(gameState),
              action: nextRoot
            });
          }
        }
      }

      if (gameState.turnPlayed > 0 && gameState.turnPlayed < 5) {
        const stopRoot = depth === 0 ? { type: "stop" } : rootAction;
        const endFrame = gnApplyEndTurnInPlace(gameState);
        if (gameState.status === "playing") {
          const outcome = dfs(gameState, depth + 1, stopRoot);
          gnUndoEndTurnInPlace(gameState, endFrame);
          if (outcome === "solved") {
            if (trackAction && stopRoot) foundAction = stopRoot;
            gnMemoStore(memo, stats, key, "solved");
            return "solved";
          }
          if (outcome === "budget") return "budget";
        } else {
          gnUndoEndTurnInPlace(gameState, endFrame);
        }
      }

      gnMemoStore(memo, stats, key, "unsolved");
      return "unsolved";
    }

    const gameState = options._gnInPlace ? state : gnForkSearchState(state);
    const result = dfs(gameState, 0, null);
    return { result, stats, action: foundAction };
  }

  function solveGnBestAction(state, options) {
    options = options || {};
    const searchOpts = gnMoveSearchOptions(state, options);
    if (!searchOpts) return null;

    const fork = gnForkSearchState(state);

    if (fork.turnPlayed > 0 && fork.turnPlayed < 5) {
      const endFrame = gnApplyEndTurnInPlace(fork);
      if (fork.status === "playing") {
        const endOutcome = solveGnStateOutcome(fork, { ...searchOpts, _gnInPlace: true });
        gnUndoEndTurnInPlace(fork, endFrame);
        if (endOutcome.result === "solved") return { type: "stop" };
      } else {
        gnUndoEndTurnInPlace(fork, endFrame);
      }
    }

    const playerId = fork.currentPlayer;
    const moves = gnSolverMoveList(fork, playerId, searchOpts.branchLimit, searchOpts);
    if (moves.length === 1 && fork.turnPlayed === 0 && !gnFastMoveFatal(fork, playerId, moves[0])) {
      return { type: "move", move: moves[0] };
    }

    const outcome = solveGnStateOutcome(fork, {
      ...searchOpts,
      _gnInPlace: true,
      trackAction: true
    });
    if (outcome.result === "solved" && outcome.action) return outcome.action;
    return null;
  }

  function solveGnShallowBestAction(state, options) {
    options = options || {};
    const searchOpts = gnShallowSearchOptions(state, options);
    if (!searchOpts) return null;
    searchOpts._shallowScores = new Map();

    const fork = gnForkSearchState(state);

    if (fork.turnPlayed > 0 && fork.turnPlayed < 5) {
      const endFrame = gnApplyEndTurnInPlace(fork);
      if (fork.status === "playing") {
        const endOutcome = solveGnStateOutcome(fork, { ...searchOpts, _gnInPlace: true });
        gnUndoEndTurnInPlace(fork, endFrame);
        if (endOutcome.result === "solved") return { type: "stop" };
      } else {
        gnUndoEndTurnInPlace(fork, endFrame);
      }
    }

    const playerId = fork.currentPlayer;
    const moves = gnSolverMoveList(fork, playerId, searchOpts.branchLimit, searchOpts);
    if (moves.length === 1 && fork.turnPlayed === 0 && !gnFastMoveFatal(fork, playerId, moves[0])) {
      return { type: "move", move: moves[0] };
    }

    const outcome = solveGnStateOutcome(fork, {
      ...searchOpts,
      _gnInPlace: true,
      trackAction: true
    });
    if (outcome.result === "solved" && outcome.action) return outcome.action;

    let bestAction = null;
    let bestEval = -Infinity;
    for (const entry of searchOpts._shallowScores.values()) {
      if (entry.eval > bestEval) {
        bestEval = entry.eval;
        bestAction = entry.action;
      }
    }
    return bestAction;
  }

  function gnPatchRectKey(rect) {
    return rect.w + "@" + rect.ox + "," + rect.oy;
  }

  function gnEnumeratePatchCandidates(size) {
    if (size < 5) return [];
    const widths = size === 5 ? [3, 4] : [3, 4];
    const rects = [];
    for (const w of widths) {
      for (let oy = 0; oy <= size - w; oy++) {
        for (let ox = 0; ox <= size - w; ox++) {
          rects.push({ ox, oy, w, h: w });
        }
      }
    }
    return rects;
  }

  function gn5x5Corner3() {
    return { ox: 0, oy: 0, w: 3, h: 3 };
  }

  function gn5x5Corner4() {
    return { ox: 0, oy: 0, w: 4, h: 4 };
  }

  function gnSecondary3x3Candidates(size) {
    const m = size - 3;
    const rects = [];
    const push = (ox, oy) => {
      if (ox === 0 && oy === 0) return;
      if (ox < 0 || oy < 0 || ox + 3 > size || oy + 3 > size) return;
      rects.push({ ox, oy, w: 3, h: 3 });
    };
    push(m, 0);
    push(0, m);
    push(m, m);
    return rects;
  }

  function gn5x5Secondary3x3Candidates() {
    return gnSecondary3x3Candidates(5);
  }

  /** Celle vuote sotto cui il 5x5 passa al DFS esatto (chiusura). */
  function gn5x5EndgameEmptyThreshold() {
    return gnEndgameExactThreshold(5);
  }

  /**
   * G=N a fasi (L>=5): 3x3 angolo -> altri 3x3 adiacenti -> 4x4 fallback -> altri 3x3 (L>=6).
   */
  function gnSelectBestPatchGoalPhased(state) {
    const size = state.size;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty <= gnEndgameExactThreshold(size)) {
      state._gnPlannerPatchGoal = null;
      return null;
    }

    const active = state._gnPlannerPatchGoal;
    if (active && !gnIsPatchComplete(state, active) && gnScorePatchGoal(state, active) > -Infinity) {
      return active;
    }

    const corner3 = gn5x5Corner3();
    if (!gnIsPatchComplete(state, corner3)) {
      state._gnPlannerPatchGoal = corner3;
      return corner3;
    }

    let best = null;
    let bestScore = -Infinity;
    for (const rect of gnSecondary3x3Candidates(size)) {
      if (gnIsPatchComplete(state, rect)) continue;
      const patchScore = gnScorePatchGoal(state, rect);
      if (patchScore > bestScore) {
        bestScore = patchScore;
        best = rect;
      }
    }
    if (best) {
      state._gnPlannerPatchGoal = best;
      return best;
    }

    const corner4 = gn5x5Corner4();
    if (!gnIsPatchComplete(state, corner4)) {
      state._gnPlannerPatchGoal = corner4;
      return corner4;
    }

    if (size >= 6) {
      let fallback = null;
      let fallbackScore = -Infinity;
      for (const rect of gnEnumeratePatchCandidates(size)) {
        if (rect.w !== 3 || gnIsPatchComplete(state, rect)) continue;
        const patchScore = gnScorePatchGoal(state, rect);
        if (patchScore > fallbackScore) {
          fallbackScore = patchScore;
          fallback = rect;
        }
      }
      if (fallback) {
        state._gnPlannerPatchGoal = fallback;
        return fallback;
      }
    }

    state._gnPlannerPatchGoal = null;
    return null;
  }

  function gnSelectBestPatchGoal5x5(state) {
    return gnSelectBestPatchGoalPhased(state);
  }

  function gnDeferPatchForNarrowPair(state) {
    if (!isDurissimaGnIdeal(state) || state.size < 5) return false;
    return gnNarrowFrontierCells(state).some(cell => cell.n === 1 || cell.n === 2);
  }

  function gnUsePatchFirstStrategy(state) {
    if (state.size < 5 || state.size > 8) return false;
    if (gnDeferPatchForNarrowPair(state)) return false;
    if (gnEmptyCellsInIdealGrid(state) <= gnEndgameExactThreshold(state.size)) return false;
    if (state.size >= 6 && gnIsCriticalPosition(state)) return false;
    return gnSelectBestPatchGoal(state) != null;
  }

  function gnPatchEmptyCells(state, rect) {
    const map = boardMap(state.board);
    const out = [];
    for (let y = rect.oy; y < rect.oy + rect.h; y++) {
      for (let x = rect.ox; x < rect.ox + rect.w; x++) {
        if (!gnIdealCellInGrid(state, x, y)) continue;
        if (!map.has(coordKey(x, y))) out.push({ x, y });
      }
    }
    return out;
  }

  function gnPatchFilledCount(state, rect) {
    return rect.w * rect.h - gnPatchEmptyCells(state, rect).length;
  }

  function gnIsPatchComplete(state, rect) {
    return gnPatchEmptyCells(state, rect).length === 0;
  }

  function gnPatchTouchesPlay(state, rect) {
    const map = boardMap(state.board);
    for (let y = rect.oy; y < rect.oy + rect.h; y++) {
      for (let x = rect.ox; x < rect.ox + rect.w; x++) {
        if (map.has(coordKey(x, y))) return true;
      }
    }
    const candidates = candidateCells(state);
    for (const cell of candidates) {
      if (cell.x >= rect.ox && cell.x < rect.ox + rect.w
        && cell.y >= rect.oy && cell.y < rect.oy + rect.h) {
        return true;
      }
    }
    return false;
  }

  function gnPatchLocalDegree(rect, x, y) {
    let degree = 0;
    const lx = x - rect.ox;
    const ly = y - rect.oy;
    if (lx > 0) degree++;
    if (lx < rect.w - 1) degree++;
    if (ly > 0) degree++;
    if (ly < rect.h - 1) degree++;
    return degree;
  }

  function gnScorePatchGoal(state, rect) {
    if (isDurissimaGnIdeal(state) && !gnIdealFillMatchingPossible(state)) return -Infinity;
    if (!gnPatchTouchesPlay(state, rect)) return -Infinity;
    const total = rect.w * rect.h;
    const filled = gnPatchFilledCount(state, rect);
    const empty = total - filled;
    if (empty === 0) return -Infinity;

    const emptyCells = gnPatchEmptyCells(state, rect);
    const candidateSet = new Set(candidateCells(state).map(cell => coordKey(cell.x, cell.y)));
    let reachableEmpty = 0;
    for (const cell of emptyCells) {
      if (candidateSet.has(coordKey(cell.x, cell.y))) reachableEmpty++;
    }
    if (reachableEmpty === 0 && filled === 0) return -Infinity;

    let score = filled * 8 + reachableEmpty * 12;
    if (filled > 0 && empty > 0) score += 40;
    if (rect.w === 3) score += 15;

    const pool = gnPoolOutlookCards(state);
    const morph = gnMorphologyForSize(state.size);
    let awkwardFit = 0;
    for (const cell of emptyCells) {
      if (!candidateSet.has(coordKey(cell.x, cell.y))) continue;
      if (gnPatchLocalDegree(rect, cell.x, cell.y) > 2) continue;
      for (const card of pool) {
        awkwardFit += morph.cardMorph(card).rigidity;
      }
    }
    score += awkwardFit * 0.8;
    if (filled === 0) score -= 25;
    if (state.board.length === 0 && rect.ox === 0 && rect.oy === 0 && rect.w === 3) {
      score += 80;
    }
    if (state.size >= 5 && rect.w === 3 && gnIsPatchComplete(state, gn5x5Corner3())) {
      score += state.size >= 6 ? 28 : 35;
    }
    if (rect.w === 4 && empty > 5) {
      score -= state.size >= 6 ? 15 : 20;
    }
    score -= gnBoundaryEmptyRisk(state) * 0.3;
    for (const cell of emptyCells) {
      if (!gnIdealCellOnBoundary(state, cell.x, cell.y)) continue;
      const opts = gnPoolOptionsForCell(state, cell.x, cell.y);
      if (opts <= 1) score -= 45;
      else if (opts <= 2) score -= 15;
    }
    return score;
  }

  function gnSelectBestPatchGoal(state) {
    if (state.size < 5) return null;
    return gnSelectBestPatchGoalPhased(state);
  }

  function gnPatchMoveScore(state, playerId, move, rect, morph) {
    const map = boardMap(state.board);
    if (map.has(coordKey(move.x, move.y))) return -Infinity;
    const inPatch = move.x >= rect.ox && move.x < rect.ox + rect.w
      && move.y >= rect.oy && move.y < rect.oy + rect.h;
    if (!inPatch) return gnGlobalMoveScore(state, playerId, move) * 0.25;
    let score = 600;
    const cardMorph = morph.cardMorph(move.card);
    const degree = gnPatchLocalDegree(rect, move.x, move.y);
    if (degree <= 2) score += cardMorph.rigidity * 30;
    else score += cardMorph.flexibility * 0.4;
    score += gnMorphMoveScore(morph, state, move) * 0.18;
    if (gnFastMoveFatal(state, playerId, move)) score -= 100000;
    return score;
  }

  function solveGnPatchBestAction(state, rect) {
    const emptyCount = gnPatchEmptyCells(state, rect).length;
    const emptyCap = rect.w === 4 ? 8 : 6;
    if (!emptyCount || emptyCount > emptyCap || rect.w > 4) return null;

    const searchOpts = gnMoveSearchOptions(state);
    if (!searchOpts) return null;
    const patchOpts = {
      ...searchOpts,
      maxNodes: Math.min(searchOpts.maxNodes, gnMaxNodesForSize(rect.w)),
      moveNodeLimit: gnPerMoveNodesForSize(rect.w),
      branchLimit: gnBranchLimitForSize(rect.w),
      patchRect: rect,
      patchFilter: "strict",
      patchCompleteTarget: rect
    };

    const fork = gnForkSearchState(state);
    if (fork.turnPlayed > 0 && fork.turnPlayed < 5) {
      const endFrame = gnApplyEndTurnInPlace(fork);
      if (fork.status === "playing") {
        const endOutcome = solveGnStateOutcome(fork, { ...patchOpts, _gnInPlace: true });
        gnUndoEndTurnInPlace(fork, endFrame);
        if (endOutcome.result === "solved") return { type: "stop" };
      } else {
        gnUndoEndTurnInPlace(fork, endFrame);
      }
    }

    const playerId = fork.currentPlayer;
    const moves = gnSolverMoveList(fork, playerId, patchOpts.branchLimit, patchOpts);
    if (moves.length === 1 && fork.turnPlayed === 0 && !gnFastMoveFatal(fork, playerId, moves[0])) {
      return { type: "move", move: moves[0] };
    }

    const outcome = solveGnStateOutcome(fork, {
      ...patchOpts,
      _gnInPlace: true,
      trackAction: true
    });
    if (outcome.result === "solved" && outcome.action) return outcome.action;
    return null;
  }

  function gnTryPatchGuidedAction(state, playerId) {
    if (!gnUsePatchFirstStrategy(state)) return null;
    const rect = gnSelectBestPatchGoal(state);
    if (!rect) return null;

    const patchAction = solveGnPatchBestAction(state, rect);
    if (patchAction) return patchAction;

    const requirement = placementRequirement(state);
    let moves = legalPlacements(state, playerId, requirement);
    moves = gnFilterIdealGridMoves(state, moves);
    moves = gnPruneFatalMoves(state, playerId, moves);
    if (!moves.length) return null;

    const morph = gnMorphologyForSize(state.size);
    const ranked = moves
      .map(move => ({ move, score: gnPatchMoveScore(state, playerId, move, rect, morph) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length || ranked[0].score < -50000) return null;
    return { type: "move", move: ranked[0].move };
  }

  function chooseDurissimaGlobalBestHeuristicMove(state, playerId) {
    const ctx = gnSearchContextForState(state);
    const branchLimit = gnAdaptiveBranchLimit(state, ctx.branchLimit);
    const moves = gnSolverMoveList(state, playerId, branchLimit, {
      useMorphology: true,
      useGlobalHeuristic: true
    });
    return moves.length ? moves[0] : null;
  }

  /** Mosse obbligate (singleton / unica legale): sempre, senza DFS. */
  function gnTryNarrowBoundaryMove(state, playerId) {
    const narrow = gnNarrowFrontierCells(state);
    if (!narrow.length) return null;
    const requirement = placementRequirement(state);
    let moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    moves = gnFilterIdealGridMoves(state, moves);
    moves = gnPruneFatalMoves(state, playerId, moves);
    for (const pass of [1, 2]) {
      for (const cell of narrow) {
        if (cell.n !== pass) continue;
        const fill = moves.filter(move => move.x === cell.x && move.y === cell.y);
        if (fill.length === 1) return fill[0];
        if (fill.length > 1) {
          fill.sort((a, b) =>
            gnPoolOptionsForCell(state, a.x, a.y) - gnPoolOptionsForCell(state, b.x, b.y)
          );
          return fill[0];
        }
      }
    }
    return null;
  }

  function gnEndgameCornerCloseActive(state) {
    return isDurissimaGnIdeal(state) && state.size >= 6
      && gnEmptyCellsInIdealGrid(state) <= 4;
  }

  function gnReservedLegalMoves(state, playerId, moves) {
    const reservations = gnCardReservations(state);
    if (!reservations.size) return [];
    const reserved = moves.filter(move => {
      const cell = reservations.get(move.card.uid);
      return cell && move.x === cell.x && move.y === cell.y;
    });
    if (gnEndgameCornerCloseActive(state)) {
      const edge = state.size - 1;
      const seen = new Set(reserved.map(move => move.cardUid + "@" + move.x + "," + move.y));
      for (const move of moves) {
        if (!gnIsGridCorner(state, move.x, move.y)) continue;
        if (move.x !== edge && move.y !== edge) continue;
        const cell = reservations.get(move.card.uid);
        if (!cell || (cell.x === move.x && cell.y === move.y)) continue;
        if (cell.x !== edge && cell.y !== edge) continue;
        const key = move.cardUid + "@" + move.x + "," + move.y;
        if (!seen.has(key)) {
          seen.add(key);
          reserved.push(move);
        }
      }
    }
    return reserved;
  }

  function gnIdealBottomRowEmpty(state) {
    const row = state.size - 1;
    return gnIdealEmptyCellList(state).filter(cell => cell.y === row);
  }

  function gnIdealRightColEmpty(state) {
    const col = state.size - 1;
    return gnIdealEmptyCellList(state).filter(cell => cell.x === col);
  }

  function gnIsGridCorner(state, x, y) {
    const n = state.size - 1;
    return (x === 0 || x === n) && (y === 0 || y === n);
  }

  function gnClosingEdgeSweepActive(state) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return false;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty > 6) return false;
    return gnIdealBottomRowEmpty(state).length >= 2 || gnIdealRightColEmpty(state).length >= 2;
  }

  function gnClosingEdgeDelegateActive(state) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return false;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty > 12) return false;
    const edge = state.size - 1;
    const edgeEmpty = gnIdealEmptyCellList(state).filter(cell => cell.x === edge || cell.y === edge);
    return edgeEmpty.length >= 2;
  }

  function gnBottomRowSweepActive(state) {
    return gnClosingEdgeSweepActive(state);
  }

  /** Cella di bordo chiusura con 1-2 carte tutte sullo stesso giocatore. */
  function gnClosingEdgeDelegateWindows(state) {
    if (!gnClosingEdgeDelegateActive(state)) return [];
    const edge = state.size - 1;
    const out = [];
    for (const cell of gnIdealEmptyCellList(state)) {
      if (cell.x !== edge && cell.y !== edge) continue;
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (fillers.length < 1 || fillers.length > 2) continue;
      const holders = new Set();
      for (const uid of fillers) {
        for (let p = 0; p < state.players; p++) {
          if ((state.hands[p] || []).some(c => c.uid === uid)) holders.add(p);
        }
      }
      if (holders.size !== 1) continue;
      out.push({
        x: cell.x,
        y: cell.y,
        fillers,
        holder: holders.values().next().value,
        n: fillers.length
      });
    }
    out.sort((a, b) => a.n - b.n);
    return out;
  }

  function gnClosingEdgeDelegateHolderCanPlay(state, win) {
    const savedPlayer = state.currentPlayer;
    const savedTurn = state.turnPlayed;
    state.currentPlayer = win.holder;
    state.turnPlayed = 0;
    const legal = legalPlacements(state, win.holder, placementRequirement(state));
    state.currentPlayer = savedPlayer;
    state.turnPlayed = savedTurn;
    const fillerSet = new Set(win.fillers);
    return legal.some(move =>
      move.x === win.x && move.y === win.y && fillerSet.has(move.card.uid)
    );
  }

  /** Due riserve sulla stessa cella delegate: singleton prima, altrimenti la piu' flessibile. */
  function gnPickSameCellReservedMove(state, reserved) {
    if (!reserved.length) return null;
    if (reserved.length === 1) return reserved[0];
    return reserved
      .slice()
      .sort((a, b) => {
        const ca = gnCardIdealPlacementCount(state, a.card.uid);
        const cb = gnCardIdealPlacementCount(state, b.card.uid);
        if (ca === 1 && cb !== 1) return -1;
        if (cb === 1 && ca !== 1) return 1;
        return cb - ca;
      })[0];
  }

  function gnPickDelegateCellMove(state, moves, win) {
    const fillerSet = new Set(win.fillers);
    const candidates = moves.filter(move =>
      move.x === win.x && move.y === win.y && fillerSet.has(move.card.uid)
    );
    if (!candidates.length) return null;
    const reservations = gnCardReservations(state);
    const reserved = candidates.filter(move => {
      const cell = reservations.get(move.card.uid);
      return cell && cell.x === win.x && cell.y === win.y;
    });
    if (reserved.length === 1) return reserved[0];
    if (reserved.length > 1) return gnPickBestReservedMove(state, reserved);
    if (candidates.length === 1) return candidates[0];
    return candidates
      .sort((a, b) =>
        gnCardIdealPlacementCount(state, a.card.uid) - gnCardIdealPlacementCount(state, b.card.uid)
      )[0];
  }

  function gnTryClosingEdgeDelegateMove(state, playerId) {
    if (!gnClosingEdgeDelegateActive(state)) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    for (const win of gnClosingEdgeDelegateWindows(state)) {
      if (win.holder !== playerId) continue;
      const hit = gnPickDelegateCellMove(state, moves, win);
      if (hit) return hit;
    }
    return null;
  }

  function gnShouldYieldForClosingEdgeDelegate(state, playerId) {
    if (!gnClosingEdgeDelegateActive(state)) return false;
    for (const win of gnClosingEdgeDelegateWindows(state)) {
      if (win.holder === playerId) continue;
      if (gnClosingEdgeDelegateHolderCanPlay(state, win)) return true;
    }
    return false;
  }

  function gnShouldYieldForClosingEdgeSingletonDelegate(state, playerId) {
    if (!gnClosingEdgeDelegateActive(state)) return false;
    for (const win of gnClosingEdgeDelegateWindows(state)) {
      if (win.n !== 1 || win.holder === playerId) continue;
      if (gnClosingEdgeDelegateHolderCanPlay(state, win)) return true;
    }
    return false;
  }

  function gnTryClosingEdgeSingletonDelegateMove(state, playerId) {
    if (!gnClosingEdgeDelegateActive(state)) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    for (const win of gnClosingEdgeDelegateWindows(state)) {
      if (win.n !== 1 || win.holder !== playerId) continue;
      const hit = gnPickDelegateCellMove(state, moves, win);
      if (hit) return hit;
    }
    return null;
  }

  function gnEdgeGapCenter(cells, axis) {
    if (!cells.length) return 0;
    if (axis === "x") return cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length;
    return cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length;
  }

  function gnPreCloseEdgeBandActive(state) {
    return isDurissimaGnIdeal(state) && state.size >= 6
      && gnEmptyCellsInIdealGrid(state) >= 12
      && gnEmptyCellsInIdealGrid(state) <= 14;
  }

  function gnRankPreCloseEdgeMove(state, move) {
    const edge = state.size - 1;
    let score = 0;
    const fillers = gnCellPoolFillers(state, move.x, move.y).length;
    if (fillers === 1) score += 700;
    else if (fillers === 2) score += 400;
    if (move.x === edge) {
      score += 14000;
      const center = gnEdgeGapCenter(gnIdealRightColEmpty(state), "y");
      score -= Math.abs(move.y - center) * 80;
      score -= gnPoolOptionsForCell(state, move.x, move.y) * 15;
    } else if (move.y === edge) {
      score += 9000;
      const center = gnEdgeGapCenter(gnIdealBottomRowEmpty(state), "x");
      score -= Math.abs(move.x - center) * 80;
      score -= gnPoolOptionsForCell(state, move.x, move.y) * 100;
    } else {
      score -= gnPoolOptionsForCell(state, move.x, move.y) * 100;
    }
    const reserved = gnCardReservations(state).get(move.card.uid);
    if (reserved && reserved.x === move.x && reserved.y === move.y) {
      score += 5000;
    } else if (gnIsGridCorner(state, move.x, move.y)) {
      score -= 1800;
    }
    score -= gnCardIdealPlacementCount(state, move.card.uid) * 50;
    return score;
  }

  function gnRankReservedMove(state, move) {
    const edge = state.size - 1;
    let score = 0;
    if (gnClosingEdgeSweepActive(state)) {
      const fillers = gnCellPoolFillers(state, move.x, move.y).length;
      if (fillers === 1) score += 700;
      else if (fillers === 2) score += 400;
      if (move.y === edge) {
        score += 10000;
        const center = gnEdgeGapCenter(gnIdealBottomRowEmpty(state), "x");
        score -= Math.abs(move.x - center) * 80;
      }
      if (move.x === edge) {
        score += 9500;
        const center = gnEdgeGapCenter(gnIdealRightColEmpty(state), "y");
        score -= Math.abs(move.y - center) * 80;
      }
      const reserved = gnCardReservations(state).get(move.card.uid);
      if (reserved && reserved.x === move.x && reserved.y === move.y) {
        score += 5000;
      } else if (gnIsGridCorner(state, move.x, move.y)) {
        score += gnEndgameCornerCloseActive(state) ? 2500 : -1800;
      }
    }
    if (gnIdealCellOnBoundary(state, move.x, move.y)) score += 500;
    const narrow = gnNarrowFrontierCells(state).some(cell => cell.x === move.x && cell.y === move.y);
    if (narrow) score += 250;
    score -= gnPoolOptionsForCell(state, move.x, move.y) * 100;
    score -= gnCardIdealPlacementCount(state, move.card.uid) * 50;
    return score;
  }

  function gnPickBestReservedMove(state, reserved) {
    if (!reserved.length) return null;
    if (reserved.length === 1) return reserved[0];
    const sameCell = reserved.every(move => move.x === reserved[0].x && move.y === reserved[0].y);
    if (sameCell) return gnPickSameCellReservedMove(state, reserved);
    return reserved
      .map(move => ({ move, score: gnRankReservedMove(state, move) }))
      .sort((a, b) => b.score - a.score)[0].move;
  }

  function gnClosingEdgeTightActive(state) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return false;
    const empty = gnEmptyCellsInIdealGrid(state);
    return empty > 6 && empty <= 11;
  }

  /** Pre-sweep (7-11 vuoti): gioca sul bordo nella cella piu' stretta a req=1. */
  function gnTryClosingEdgeTightMove(state, playerId) {
    if (!gnClosingEdgeTightActive(state)) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const edge = state.size - 1;
    let best = null;
    let bestScore = -1;
    for (const cell of gnIdealEmptyCellList(state)) {
      const onEdge = cell.y === edge || cell.x === edge || cell.y === 0;
      if (!onEdge) continue;
      const fillers = gnCellLegalFillersAtReq(state, cell.x, cell.y, 1);
      if (!fillers.size || fillers.size > 4) continue;
      const held = moves.filter(move => move.x === cell.x && move.y === cell.y);
      if (!held.length) continue;
      let score = (5 - fillers.size) * 120;
      if (cell.y === edge) score += 200;
      if (cell.y === 0 && cell.x === edge) score += 250;
      if (gnIsGridCorner(state, cell.x, cell.y) && gnEmptyCellsInIdealGrid(state) <= 10) score += 150;
      for (const move of held) {
        let moveScore = score;
        const reserved = gnCardReservations(state).get(move.card.uid);
        if (reserved && (reserved.x !== move.x || reserved.y !== move.y)) moveScore -= 80;
        if (moveScore > bestScore) {
          bestScore = moveScore;
          best = move;
        }
      }
    }
    return best;
  }

  /** Chiusura bordo finale: priorita a vuoti stretti su ultima fila/colonna. */
  function gnTryBottomRowSweepMove(state, playerId) {
    if (!gnClosingEdgeSweepActive(state) && !gnClosingEdgeDelegateActive(state)) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const edge = state.size - 1;
    const cells = gnIdealEmptyCellList(state).filter(cell =>
      cell.y === edge || cell.x === edge
    );
    let best = null;
    let bestScore = -1;
    for (const cell of cells) {
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (!fillers.length || fillers.length > 2) continue;
      const held = fillers.filter(uid => (state.hands[playerId] || []).some(c => c.uid === uid));
      if (!held.length) continue;
      let score = (fillers.length === 1 ? 400 : 200) + held.length * 60
        - gnPoolOptionsForCell(state, cell.x, cell.y) * 10;
      if (gnIsGridCorner(state, cell.x, cell.y)) score -= 200;
      for (const move of moves) {
        if (move.x !== cell.x || move.y !== cell.y || !held.includes(move.card.uid)) continue;
        if (score > bestScore) {
          bestScore = score;
          best = move;
        }
      }
    }
    return best;
  }

  /** Coppia n=2 con due carte su due giocatori diversi: serve coordinazione. */
  function gnDistributedPairWindows(state) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return [];
    const windows = [];
    for (const cell of gnNarrowFrontierCells(state)) {
      if (cell.n !== 2) continue;
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (fillers.length !== 2) continue;
      const holderByUid = new Map();
      for (const uid of fillers) {
        for (let p = 0; p < state.players; p++) {
          if ((state.hands[p] || []).some(c => c.uid === uid)) {
            holderByUid.set(uid, p);
            break;
          }
        }
      }
      if (holderByUid.size !== 2) continue;
      const players = new Set(holderByUid.values());
      if (players.size !== 2) continue;
      windows.push({ x: cell.x, y: cell.y, fillers, holderByUid });
    }
    return windows;
  }

  function gnPlayerHoldsPairFiller(state, playerId, window) {
    for (const uid of window.fillers) {
      if ((state.hands[playerId] || []).some(c => c.uid === uid)) return true;
    }
    return false;
  }

  function gnTryDistributedPairHolderMove(state, playerId) {
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    for (const win of gnDistributedPairWindows(state)) {
      if (!gnPlayerHoldsPairFiller(state, playerId, win)) continue;
      const fillerSet = new Set(win.fillers);
      const hit = moves.find(move =>
        move.x === win.x && move.y === win.y && fillerSet.has(move.card.uid)
      );
      if (hit) return hit;
    }
    return null;
  }

  function gnShouldYieldForDistributedPair(state, playerId) {
    const windows = gnDistributedPairWindows(state);
    if (!windows.length) return false;
    for (const win of windows) {
      if (!gnPlayerHoldsPairFiller(state, playerId, win)) return true;
    }
    return false;
  }

  /** 6x6: fascia 12-14 vuoti, avanza su bordo prima della stretta held. */
  function gnTryPreCloseEdgeMove(state, playerId) {
    if (!gnPreCloseEdgeBandActive(state) || state.turnPlayed !== 0) return null;
    const requirement = placementRequirement(state);
    let moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    moves = moves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
    const edge = state.size - 1;
    const edgeMoves = moves.filter(move =>
      gnIdealEmptyCellList(state).some(cell =>
        (cell.x === edge || cell.y === edge) && cell.x === move.x && cell.y === move.y
      )
    );
    if (!edgeMoves.length) return null;
    if (edgeMoves.length === 1) return edgeMoves[0];
    return edgeMoves
      .map(move => ({ move, score: gnRankPreCloseEdgeMove(state, move) }))
      .sort((a, b) => b.score - a.score)[0].move;
  }

  /** L>=6: se il giocatore ha carte del pool su cella di bordo stretta, gioca li. */
  function gnTryHeldTightBoundaryMove(state, playerId) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return null;
    if (gnPreCloseEdgeBandActive(state)) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    let best = null;
    let bestScore = -1;
    for (const cell of gnIdealEmptyCellList(state)) {
      if (!gnIdealCellOnBoundary(state, cell.x, cell.y)) continue;
      const fillers = gnCellPoolFillers(state, cell.x, cell.y);
      if (fillers.length < 1 || fillers.length > 3) continue;
      const held = fillers.filter(uid => (state.hands[playerId] || []).some(c => c.uid === uid));
      if (!held.length) continue;
      const score = held.length * 100 + (4 - fillers.length) * 25;
      for (const move of moves) {
        if (move.x !== cell.x || move.y !== cell.y || !held.includes(move.card.uid)) continue;
        if (score > bestScore) {
          bestScore = score;
          best = move;
        }
      }
    }
    return best;
  }

  function gnReservedLegalAtTurnPlayed(state, playerId, uid, x, y, turnPlayed) {
    const prev = state.turnPlayed;
    state.turnPlayed = turnPlayed;
    const req = placementRequirement(state);
    const legal = legalPlacements(state, playerId, req);
    state.turnPlayed = prev;
    return legal.some(move => move.card.uid === uid && move.x === x && move.y === y);
  }

  function gnReservedSurvivesFirstPlay(state, playerId, reservedMove, otherMove) {
    const frame = gnApplyPlacementInPlace(state, playerId, otherMove);
    if (!frame) return false;
    const ok = gnReservedLegalAtTurnPlayed(
      state, playerId, reservedMove.card.uid, reservedMove.x, reservedMove.y, state.turnPlayed
    );
    gnUndoPlacementInPlace(state, frame);
    return ok;
  }

  /** Colonna destra: filler unico su (x,y) non deve bloccare il vuoto sotto ancora copribile dal pool. */
  function gnSoleEdgeBlocksOpenColNeighbor(state, cell) {
    const edge = state.size - 1;
    if (cell.x !== edge || cell.y >= edge) return false;
    const below = { x: edge, y: cell.y + 1 };
    if (!gnIdealEmptyCellList(state).some(c => c.x === below.x && c.y === below.y)) return false;
    return gnCellPoolFillers(state, below.x, below.y).length > 0;
  }

  /** Detentore filler unico su bordo: gioca subito (es. 666@(5,2)). */
  function gnTrySoleEdgeFillerMove(state, playerId) {
    if (!isDurissimaGnIdeal(state) || state.size < 6 || state.turnPlayed !== 0) return null;
    if (gnEmptyCellsInIdealGrid(state) > 11) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const edge = state.size - 1;
    let best = null;
    let bestScore = -1;
    for (const cell of gnIdealEmptyCellList(state)) {
      if (cell.y !== edge && cell.x !== edge) continue;
      const uids = gnCellLegalFillersAtReq(state, cell.x, cell.y, 1);
      if (uids.size !== 1) continue;
      const uid = [...uids][0];
      if (!(state.hands[playerId] || []).some(card => card.uid === uid)) continue;
      const hit = moves.find(move => move.x === cell.x && move.y === cell.y && move.card.uid === uid);
      if (!hit) continue;
      let score = 500;
      if (cell.x === edge) score += 200;
      if (cell.y === edge) score += 150;
      const safe = !gnMoveBreaksIdealFillPlan(state, playerId, hit);
      if (safe) score += 400;
      if (score > bestScore) {
        bestScore = score;
        best = hit;
      }
    }
    return best;
  }

  /** Riserva legale solo ora: qualsiasi altra prima mossa la fa perdere al req+1. */
  /** Bordo req=1 condiviso: gioca la propria carta per non consumare il filler dell'altro (es. 336 su (1,5)). */
  function gnShouldYieldForSoleEdgeFiller(state, playerId) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return false;
    if (gnEmptyCellsInIdealGrid(state) > 11) return false;
    const edge = state.size - 1;
    for (const cell of gnIdealEmptyCellList(state)) {
      if (cell.y !== edge && cell.x !== edge) continue;
      const uids = gnCellLegalFillersAtReq(state, cell.x, cell.y, 1);
      if (uids.size !== 1) continue;
      if (gnSoleEdgeBlocksOpenColNeighbor(state, cell)) continue;
      const uid = [...uids][0];
      let holder = -1;
      for (let p = 0; p < state.players; p++) {
        if ((state.hands[p] || []).some(card => card.uid === uid)) holder = p;
      }
      if (holder >= 0 && holder !== playerId) return true;
    }
    return false;
  }

  function gnTrySharedEdgeRelayMove(state, playerId) {
    if (!isDurissimaGnIdeal(state) || state.size < 6) return null;
    if (gnEmptyCellsInIdealGrid(state) > 12) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const edge = state.size - 1;
    const edgeCells = gnIdealEmptyCellList(state)
      .filter(cell => cell.y === edge || cell.x === edge)
      .map(cell => ({
        cell,
        fillers: gnCellLegalFillersAtReq(state, cell.x, cell.y, 1)
      }))
      .filter(entry => entry.fillers.size === 2)
      .sort((a, b) => gnPoolOptionsForCell(state, a.cell.x, a.cell.y)
        - gnPoolOptionsForCell(state, b.cell.x, b.cell.y));
    for (const entry of edgeCells) {
      const cell = entry.cell;
      const fillers = entry.fillers;
      for (const move of moves) {
        if (move.x !== cell.x || move.y !== cell.y) continue;
        for (const uid of fillers) {
          if (uid === move.card.uid) continue;
          let holder = -1;
          for (let p = 0; p < state.players; p++) {
            if ((state.hands[p] || []).some(card => card.uid === uid)) holder = p;
          }
          if (holder < 0 || holder === playerId) continue;
          if (gnCardIdealPlacementCount(state, uid) > 4) continue;
          return move;
        }
      }
    }
    return null;
  }

  function gnTryFragileReservedMove(state, playerId) {
    if (!isDurissimaGnIdeal(state) || state.size < 6 || state.turnPlayed !== 0) return null;
    if (state.size === 6 && gnEmptyCellsInIdealGrid(state) <= 8) return null;
    if (state.size === 5 && gnEmptyCellsInIdealGrid(state) <= gnEndgameExactThreshold(5)) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const reserved = gnReservedLegalMoves(state, playerId, moves);
    const edge = state.size - 1;
    for (const rm of reserved) {
      const others = moves.filter(move =>
        move.cardUid !== rm.cardUid || move.x !== rm.x || move.y !== rm.y
      );
      if (!others.length) continue;
      const fragile = others.every(other => !gnReservedSurvivesFirstPlay(state, playerId, rm, other));
      if (!fragile || !gnReservedMacroStepViable(state, playerId, rm)) continue;
      if (gnClosingEdgeSweepActive(state)) {
        const colAlts = moves.filter(move =>
          move.card.uid === rm.card.uid && move.x === edge && move.y > 0 && move.y < edge
          && !gnMoveBreaksIdealFillPlan(state, playerId, move)
        );
        if (colAlts.length) {
          return colAlts
            .map(move => ({ move, score: gnRankReservedMove(state, move) }))
            .sort((a, b) => b.score - a.score)[0].move;
        }
      }
      return rm;
    }
    return null;
  }

  /** Riserva legale al prossimo req: prima mossa che la mantiene disponibile. */
  function gnTryPreserveReservedSetupMove(state, playerId) {
    if (!isDurissimaGnIdeal(state) || state.size < 6 || state.turnPlayed !== 0) return null;
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const reservations = gnCardReservations(state);
    const deferred = [];
    for (const [uid, cell] of reservations) {
      if (!(state.hands[playerId] || []).some(card => card.uid === uid)) continue;
      const now = gnReservedLegalAtTurnPlayed(state, playerId, uid, cell.x, cell.y, state.turnPlayed);
      const next = gnReservedLegalAtTurnPlayed(state, playerId, uid, cell.x, cell.y, state.turnPlayed + 1);
      if (!now && next) deferred.push({ uid, x: cell.x, y: cell.y });
    }
    if (!deferred.length) return null;
    const preserving = moves.filter(move => {
      const frame = gnApplyPlacementInPlace(state, playerId, move);
      if (!frame) return false;
      let ok = true;
      for (const target of deferred) {
        if (!gnReservedLegalAtTurnPlayed(state, playerId, target.uid, target.x, target.y, state.turnPlayed)) {
          ok = false;
          break;
        }
      }
      gnUndoPlacementInPlace(state, frame);
      return ok;
    });
    if (!preserving.length) return null;
    const safe = preserving.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
    const pool = safe.length ? safe : preserving;
    if (pool.length === 1) return pool[0];
    return gnPickBestReservedMove(state, pool) || pool[0];
  }

  function gnPlayerHeldReservations(state, playerId) {
    const map = gnCardReservations(state);
    const out = [];
    for (const [uid, cell] of map) {
      if ((state.hands[playerId] || []).some(card => card.uid === uid)) {
        out.push({ uid, x: cell.x, y: cell.y });
      }
    }
    return out;
  }

  function gnMoveMisusesHeldReservation(state, playerId, move) {
    const reserved = gnCardReservations(state).get(move.card.uid);
    if (!reserved) return false;
    if (!(state.hands[playerId] || []).some(card => card.uid === move.card.uid)) return false;
    return move.x !== reserved.x || move.y !== reserved.y;
  }

  function gnHasNonMisuseLegalMove(state, playerId) {
    const moves = legalPlacements(state, playerId, placementRequirement(state));
    return moves.some(move => !gnMoveMisusesHeldReservation(state, playerId, move));
  }

  function gnReservedMacroStepViable(state, playerId, move) {
    const heldBefore = gnPlayerHeldReservations(state, playerId);
    const frame = gnApplyPlacementInPlace(state, playerId, move);
    if (!frame) return false;
    const handLeft = (state.hands[playerId] || []).length;
    let viable = true;
    if (handLeft > 0 && state.turnPlayed < 5) {
      for (const target of heldBefore) {
        if (!(state.hands[playerId] || []).some(card => card.uid === target.uid)) continue;
        const atCell = gnReservedLegalAtTurnPlayed(
          state, playerId, target.uid, target.x, target.y, state.turnPlayed
        );
        if (!atCell) {
          viable = false;
          break;
        }
        const req = placementRequirement(state);
        const legal = legalPlacements(state, playerId, req);
        const atReserved = legal.find(m =>
          m.card.uid === target.uid && m.x === target.x && m.y === target.y
        );
        if (atReserved && gnMoveBreaksIdealFillPlan(state, playerId, atReserved)) {
          viable = false;
          break;
        }
      }
    }
    gnUndoPlacementInPlace(state, frame);
    return viable;
  }

  function gnPickReservedPool(state, playerId, reserved) {
    let pool = reserved;
    if (state.turnPlayed === 0 && pool.length > 1) {
      const viable = pool.filter(move => gnReservedMacroStepViable(state, playerId, move));
      if (viable.length) pool = viable;
    }
    if (pool.length === 1) return pool[0];
    const sameCell = pool.every(move => move.x === pool[0].x && move.y === pool[0].y);
    if (sameCell) return gnPickSameCellReservedMove(state, pool);
    if (gnClosingEdgeSweepActive(state) || gnEndgameCornerCloseActive(state)) {
      const sweepPick = gnPickBestReservedMove(state, pool);
      if (sweepPick) return sweepPick;
    }
    const forcedKeys = new Set(pool.map(move => move.cardUid + "@" + move.x + "," + move.y));
    return gnPickBestForcedSingletonMove(state, pool, forcedKeys);
  }

  function gnPickReservedCellBypassMove(state, playerId, reserved, moves) {
    if (reserved.length !== 2) return null;
    if (reserved[0].x === reserved[1].x && reserved[0].y === reserved[1].y) return null;
    if (state.board.length < 8 || state.board.length > 10 || gnEmptyCellsInIdealGrid(state) > 28) return null;
    const reservations = gnCardReservations(state);
    const reservedCells = new Set(reserved.map(move => coordKey(move.x, move.y)));
    const bypass = moves.filter(move => {
      if (!reservedCells.has(coordKey(move.x, move.y))) return false;
      const cell = reservations.get(move.card.uid);
      return !cell || cell.x !== move.x || cell.y !== move.y;
    });
    if (!bypass.length) return null;
    if (bypass.length === 1) return bypass[0];
    return bypass
      .slice()
      .sort((a, b) => {
        const ca = gnCardIdealPlacementCount(state, a.card.uid);
        const cb = gnCardIdealPlacementCount(state, b.card.uid);
        if (ca !== cb) return ca - cb;
        const pa = gnPoolOptionsForCell(state, a.x, a.y);
        const pb = gnPoolOptionsForCell(state, b.x, b.y);
        if (pa !== pb) return pb - pa;
        return gnMoveRank(state, playerId, a, {}) - gnMoveRank(state, playerId, b, {});
      })[0];
  }

  function gnTryForcedMove(state, playerId) {
    const requirement = placementRequirement(state);
    let moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    if (state.size >= 6) {
      let reserved = gnReservedLegalMoves(state, playerId, moves);
      if (state.turnPlayed > 0) {
        const safe = reserved.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
        if (safe.length) reserved = safe;
        else if (reserved.length) return null;
      }
      if (reserved.length === 1) {
        if (state.turnPlayed === 0 && !gnReservedMacroStepViable(state, playerId, reserved[0])) return null;
        return reserved[0];
      }
      if (reserved.length > 1) {
        if (state.turnPlayed === 0) {
          const safe = moves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
          const viable = reserved.filter(move => gnReservedMacroStepViable(state, playerId, move));
          if (!viable.length) {
            const bypass = gnPickReservedCellBypassMove(state, playerId, reserved, safe);
            if (bypass) return bypass;
          } else {
            return gnPickReservedPool(state, playerId, viable);
          }
        }
        return gnPickReservedPool(state, playerId, reserved);
      }
    }
    moves = gnPruneFatalMoves(state, playerId, moves);
    if (state.turnPlayed === 0) {
      const pruned = gnPruneUnfillableIdealMoves(state, playerId, moves);
      if (pruned.length) moves = pruned;
    }
    if (moves.length === 1) return moves[0];
    const forced = gnSingletonForcedKeys(state, moves);
    if (!forced.size) return null;
    return gnPickBestForcedSingletonMove(state, moves, forced);
  }

  function gnTryEndgameSolverAction(state) {
    if (!isDurissimaGnIdeal(state) || state.turnPlayed !== 0) return null;
    const emptyCells = gnEmptyCellsInIdealGrid(state);
    if (emptyCells > gnEndgameExactThreshold(state.size)) return null;
    state._gnPlannerPatchGoal = null;
    if (state.size <= 5 || (state.size === 6 && emptyCells <= 8)) {
      const exact = solveGnBestAction(state);
      if (exact) return exact;
    } else if (state.size <= 8) {
      const shallow = solveGnShallowBestAction(state);
      if (shallow) return shallow;
    }
    return null;
  }

  /** Relay non deve superare il solver quando la chiusura e' critica (6x6, <=8 vuoti). */
  function gnTryRelayOrEndgameAction(state, playerId) {
    if (isDurissimaGnIdeal(state) && state.turnPlayed === 0) {
      const empty = gnEmptyCellsInIdealGrid(state);
      const useExact = state.size === 6 && empty <= 8;
      if (useExact) {
        const exact = solveGnBestAction(state);
        if (exact) {
          if (exact.type !== "move") return exact;
          const relay = gnTrySharedEdgeRelayMove(state, playerId);
          const solverBreaks = gnMoveBreaksIdealFillPlan(state, playerId, exact.move);
          const relayBreaks = relay
            ? gnMoveBreaksIdealFillPlan(state, playerId, relay)
            : true;
          if (!solverBreaks && relayBreaks) return { type: "move", move: exact.move };
          if (gnReservedMacroStepViable(state, playerId, exact.move)) {
            return { type: "move", move: exact.move };
          }
        }
      }
    }
    const relay = gnTrySharedEdgeRelayMove(state, playerId);
    return relay ? { type: "move", move: relay } : null;
  }

  function chooseDurissimaGlobalAction(state, playerId, random) {
    if (state.turnPlayed >= 5) return { type: "stop" };
    const requirement = placementRequirement(state);
    if (state.turnPlayed >= 4 && requirement > 4) return { type: "stop" };
    if (state.turnPlayed < 4 && requirement > 4) return { type: "stop" };

    if (state.turnPlayed > 0 && isDurissimaGnIdeal(state)) {
      const reqMoves = legalPlacements(state, playerId, requirement);
      let safeTurn = reqMoves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
      if (state.size >= 6 && gnEmptyCellsInIdealGrid(state) <= 14 && safeTurn.length) {
        const noMisuse = safeTurn.filter(move => !gnMoveMisusesHeldReservation(state, playerId, move));
        if (noMisuse.length) safeTurn = noMisuse;
      }
      if (reqMoves.length && !safeTurn.length) return { type: "stop" };
    }

    const fragileReserved = gnTryFragileReservedMove(state, playerId);
    if (fragileReserved) return { type: "move", move: fragileReserved };

    const preserveSetup = gnTryPreserveReservedSetupMove(state, playerId);
    if (preserveSetup) return { type: "move", move: preserveSetup };

    const relayAction = gnTryRelayOrEndgameAction(state, playerId);
    if (relayAction) return relayAction;

    const soleFillerMove = gnTrySoleEdgeFillerMove(state, playerId);
    if (soleFillerMove) return { type: "move", move: soleFillerMove };

    if (gnShouldYieldForSoleEdgeFiller(state, playerId)) {
      return { type: "stop" };
    }

    const forced = gnTryForcedMove(state, playerId);
    if (forced) return { type: "move", move: forced };

    if (gnShouldYieldForClosingEdgeSingletonDelegate(state, playerId)) {
      return { type: "stop" };
    }
    const singletonDelegate = gnTryClosingEdgeSingletonDelegateMove(state, playerId);
    if (singletonDelegate) return { type: "move", move: singletonDelegate };

    const edgeTightMove = gnTryClosingEdgeTightMove(state, playerId);
    if (edgeTightMove) return { type: "move", move: edgeTightMove };

    if (state.size >= 6 && isDurissimaGnIdeal(state)) {
      const reqMoves = legalPlacements(state, playerId, placementRequirement(state));
      if (reqMoves.length) {
        const nonMisuse = reqMoves.filter(move => !gnMoveMisusesHeldReservation(state, playerId, move));
        if (gnPlayerHeldReservations(state, playerId).length && !nonMisuse.length) {
          return { type: "stop" };
        }
        if (state.turnPlayed > 0) {
          const safeReq = nonMisuse.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
          if (!safeReq.length) return { type: "stop" };
        }
      }
    }

    if (gnShouldYieldForClosingEdgeDelegate(state, playerId)
      || gnShouldYieldForDistributedPair(state, playerId)) {
      return { type: "stop" };
    }

    const delegateMove = gnTryClosingEdgeDelegateMove(state, playerId);
    if (delegateMove) return { type: "move", move: delegateMove };

    const bottomSweepMove = gnTryBottomRowSweepMove(state, playerId);
    if (bottomSweepMove) return { type: "move", move: bottomSweepMove };

    const pairHolderMove = gnTryDistributedPairHolderMove(state, playerId);
    if (pairHolderMove) return { type: "move", move: pairHolderMove };

    const preCloseEdgeMove = gnTryPreCloseEdgeMove(state, playerId);
    if (preCloseEdgeMove) return { type: "move", move: preCloseEdgeMove };

    const tightBoundaryMove = gnTryHeldTightBoundaryMove(state, playerId);
    if (tightBoundaryMove) return { type: "move", move: tightBoundaryMove };

    const narrowMove = gnTryNarrowBoundaryMove(state, playerId);
    if (narrowMove) return { type: "move", move: narrowMove };

    const emptyCells = gnEmptyCellsInIdealGrid(state);
    if (isDurissimaGnIdeal(state) && emptyCells <= gnEndgameExactThreshold(state.size)) {
      const endgameRetry = gnTryEndgameSolverAction(state);
      if (endgameRetry) return endgameRetry;
      const endgameFallback = chooseDurissimaGlobalBestHeuristicMove(state, playerId);
      if (endgameFallback) return { type: "move", move: endgameFallback };
    }

    if (gnDeferPatchForNarrowPair(state)) {
      const deferMove = chooseDurissimaGlobalBestHeuristicMove(state, playerId);
      if (deferMove) return { type: "move", move: deferMove };
    }

    if (gnUsePatchFirstStrategy(state)) {
      const patchAction = gnTryPatchGuidedAction(state, playerId);
      if (patchAction) return patchAction;
    }

    if (!gnIsCriticalPosition(state)) {
      const shallowAction = solveGnShallowBestAction(state);
      if (shallowAction) return shallowAction;
      const move = chooseDurissimaGlobalBestHeuristicMove(state, playerId);
      if (move) return { type: "move", move };
      return { type: "stop" };
    }

    if (state.size >= 6) {
      const shallowCritical = solveGnShallowBestAction(state);
      if (shallowCritical) return shallowCritical;
    }

    const solverAction = solveGnBestAction(state);
    if (solverAction) return solverAction;

    const move = chooseDurissimaGlobalBestHeuristicMove(state, playerId);
    if (move) return { type: "move", move };
    return { type: "stop" };
  }

  function isDurissimaPlannerStrategy(strategy) {
    return strategy === "durissima-planner" || strategy === "durissima-team-planner";
  }

  function useDurissimaStrategicVita(state) {
    return isDurissimaMater(state)
      && state.durissimaVitaExtraEnabled === true
      && state.durissimaStrategicVitaExtra !== false;
  }

  /**
   * Pesca libera coop: finche' non si rischia il monte (G-1 pass consecutivi), passare
   * a inizio turno per pescare prima di valutare la posa.
   */
  function shouldDurissimaFreeDrawPassAtTurnStart(state) {
    if (!durissimaUsesCompetitiveDraw(state)) return false;
    if (state.players <= 1) return false;
    if (state.drawPile.length === 0) return false;
    return state.consecutivePasses < state.players - 1;
  }

  /**
   * Inizio turno (strategico): come il planner normale, ma con un reshuffle volontario
   * (1 per decisione) se la migliore mossa e' fatale in fase non di chiusura.
   * Senza mosse legali, catena reshuffle come il modo reattivo (salvataggio da blocco).
   */
  function chooseDurissimaTurnStartAction(state, playerId, strategy, random) {
    const teamMode = strategy === "durissima-team-planner";
    const branchLimit = PLANNER_BRANCH_LIMIT + 2;
    const requirement = placementRequirement(state);
    const hasLegal = legalPlacements(state, playerId, requirement).length > 0;

    if (hasLegal && shouldDurissimaFreeDrawPassAtTurnStart(state)) {
      return { type: "stop" };
    }

    if (!hasLegal) {
      const used = spendDurissimaVitaExtraUntilPlayable(state, playerId, random, { strategy });
      if (used > 0 && hasLegalPlacementsNow(state, playerId)) {
        const move = choosePlacementDurissima(
          state, playerId, placementRequirement(state), random, branchLimit, teamMode
        );
        if (move) return { type: "move", move };
      }
      return { type: "stop" };
    }

    const preferSafe = durissimaPreferSafePlays(state);
    function pickBest() {
      return choosePlacementDurissima(
        state, playerId, placementRequirement(state), random, branchLimit, teamMode
      );
    }
    function okToPlay(move) {
      if (!move) return false;
      if (!preferSafe) return true;
      return !durissimaMoveIsFatal(state, playerId, move);
    }

    let bestMove = pickBest();
    if (okToPlay(bestMove)) return { type: "move", move: bestMove };

    if (canUseDurissimaVitaExtra(state, playerId)) {
      tryDurissimaVitaExtraBot(state, playerId, random, strategy);
      bestMove = pickBest();
      if (okToPlay(bestMove)) return { type: "move", move: bestMove };
    }

    if (bestMove) return { type: "move", move: bestMove };
    return { type: "stop" };
  }

  function placementStrategyForTurn(state, playerId, strategy) {
    const handSize = (state.hands[playerId] || []).length;
    if (strategy === "planner" || strategy === "chain-max" || strategy === "durissima-planner"
      || strategy === "durissima-team-planner" || strategy === "durissima-global-planner") return strategy;
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
    if (placementStrategy === "durissima-planner") {
      return choosePlacementDurissima(state, playerId, requirement, random, PLANNER_BRANCH_LIMIT + 2, false);
    }
    if (placementStrategy === "durissima-team-planner"
      || placementStrategy === "durissima-global-planner") {
      return choosePlacementDurissima(state, playerId, requirement, random, PLANNER_BRANCH_LIMIT + 2, true);
    }
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
    if (strategy === "durissima-global-planner") {
      if (isDurissimaGnIdeal(state)) {
        return chooseDurissimaGlobalAction(state, playerId, random);
      }
      strategy = "durissima-team-planner";
    }
    if (
      useDurissimaStrategicVita(state) &&
      state.turnPlayed === 0 &&
      isDurissimaPlannerStrategy(strategy)
    ) {
      return chooseDurissimaTurnStartAction(state, playerId, strategy, random);
    }
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
    if (state.turnPlayed === 4) {
      const hasHand = (state.hands[playerId] || []).length > 0;
      const hasReserve = isDurissimaReserveEnabled(state) && state.durissimaReserve.length > 0;
      if (!hasHand && !hasReserve) {
        throw new Error("Nessuna carta disponibile per realizzare l'idea.");
      }
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

  /** Pesca come competitiva (anche su pass); opzionale tetto mano con durissimaHandDrawCap. */
  function durissimaUsesCompetitiveDraw(state) {
    if (!isDurissimaMater(state)) return false;
    return state.durissimaCompetitiveDraw === true || state.durissimaHandDrawCap === true;
  }

  function durissimaHandDrawCapLimit(state) {
    if (typeof state.durissimaHandDrawCapMax === "number") {
      return Math.max(1, Math.floor(state.durissimaHandDrawCapMax));
    }
    const factor = state.durissimaHandDrawCapFactor;
    if (factor !== undefined && factor !== null) {
      const f = Number(factor);
      if (Number.isFinite(f) && f > 0) {
        return Math.max(1, Math.floor(f * state.size));
      }
    }
    return state.initialHandSize || state.size;
  }

  function durissimaHandBelowDrawCap(state, playerId) {
    if (!isDurissimaMater(state) || state.durissimaHandDrawCap !== true) return true;
    return (state.hands[playerId] || []).length < durissimaHandDrawCapLimit(state);
  }

  function isBoardComplete(state) {
    if (isDurissimaGnIdeal(state)) {
      return gnFilledCellsInIdealGrid(state) >= state.size * state.size;
    }
    return state.board.length >= state.size * state.size;
  }

  function maybeCompleteDurissima(state) {
    if (!isDurissimaMater(state) || state.status !== "playing" || !isBoardComplete(state)) return false;
    state.status = "success";
    state.winner = state.players === 1 ? 0 : null;
    return true;
  }

  function durissimaEmergencyBudgetOpen(state) {
    if (state.durissimaEmergencyDrawsLeft === null || state.durissimaEmergencyDrawsLeft === undefined) {
      return true;
    }
    return state.durissimaEmergencyDrawsLeft > 0;
  }

  function durissimaAfterPlayBudgetOpen(state) {
    if (state.durissimaAfterPlayDrawsLeft === null || state.durissimaAfterPlayDrawsLeft === undefined) {
      return true;
    }
    return state.durissimaAfterPlayDrawsLeft > 0;
  }

  function tryDurissimaEmergencyDraw(state, playerId) {
    if (!isDurissimaMater(state) || state.players !== 1 || state.drawPile.length === 0) return false;
    if (!durissimaEmergencyBudgetOpen(state)) return false;
    if (!drawForPlayer(state, playerId)) return false;
    if (state.durissimaEmergencyDrawsLeft !== null && state.durissimaEmergencyDrawsLeft !== undefined) {
      state.durissimaEmergencyDrawsLeft--;
    }
    state.durissimaEmergencyDrawsUsed = (state.durissimaEmergencyDrawsUsed || 0) + 1;
    return true;
  }

  function tryDurissimaAfterPlayDraw(state, playerId) {
    if (!isDurissimaMater(state) || state.drawPile.length === 0) return false;
    if (!durissimaAfterPlayBudgetOpen(state)) return false;
    if (!drawForPlayer(state, playerId)) return false;
    if (state.durissimaAfterPlayDrawsLeft !== null && state.durissimaAfterPlayDrawsLeft !== undefined) {
      state.durissimaAfterPlayDrawsLeft--;
    }
    state.durissimaAfterPlayDrawsUsed = (state.durissimaAfterPlayDrawsUsed || 0) + 1;
    return true;
  }

  /** Variante di riferimento Durissima: «N reshuffle» attivo salvo opt-out esplicito. */
  function defaultDurissimaVitaExtraEnabled(options) {
    if (options.durissimaMater !== true) return false;
    if (options.durissimaVitaExtraEnabled === false) return false;
    return true;
  }

  function defaultDurissimaReserveEnabled(options) {
    return options.durissimaMater === true && options.durissimaReserveEnabled === true;
  }

  function defaultDurissimaVitaExtraPool(size, options) {
    if (!defaultDurissimaVitaExtraEnabled(options)) return 0;
    if (options.durissimaVitaExtraBudget !== undefined) {
      return Math.max(0, Math.floor(Number(options.durissimaVitaExtraBudget)));
    }
    return size;
  }

  function durissimaVitaExtraPoolLeft(state) {
    if (typeof state.durissimaVitaExtraPool === "number") return state.durissimaVitaExtraPool;
    const legacy = state.durissimaVitaExtraLeft;
    if (Array.isArray(legacy)) return legacy.reduce((sum, n) => sum + (n || 0), 0);
    return 0;
  }

  function setupDurissimaReserve(drawPile, size, options) {
    if (!defaultDurissimaReserveEnabled(options)) {
      return { drawPile: drawPile.slice(), durissimaReserve: [] };
    }
    const reserveSize = options.durissimaReserveSize !== undefined
      ? Math.floor(Number(options.durissimaReserveSize))
      : size;
    const pile = drawPile.slice();
    const n = Math.max(0, Math.min(reserveSize, pile.length));
    return { drawPile: pile.slice(n), durissimaReserve: pile.slice(0, n) };
  }

  function defaultDurissimaEmergencyBudget(size, players, options) {
    if (options.durissimaMater !== true) return null;
    if (options.durissimaEmergencyDrawBudget !== undefined) {
      return normalizeDurissimaDrawBudget(options.durissimaEmergencyDrawBudget);
    }
    if (defaultDurissimaVitaExtraEnabled(options)) return 0;
    if (defaultDurissimaReserveEnabled(options)) return 0;
    return 0;
  }

  function isDurissimaVitaExtraEnabled(state) {
    return isDurissimaMater(state) && state.durissimaVitaExtraEnabled === true;
  }

  function canUseDurissimaVitaExtra(state, playerId) {
    if (!isDurissimaVitaExtraEnabled(state) || state.status !== "playing") return false;
    if (state.turnPlayed !== 0) return false;
    if (durissimaVitaExtraPoolLeft(state) <= 0) return false;
    const hand = state.hands[playerId] || [];
    return hand.length > 0 || state.drawPile.length > 0;
  }

  function durissimaVitaKeepUidMasks(hand) {
    const masks = [];
    const n = hand.length;
    if (!n) {
      masks.push(0);
      return masks;
    }
    const allKept = (1 << n) - 1;
    for (let mask = 0; mask < (1 << n); mask++) {
      if (mask === allKept) continue;
      masks.push(mask);
    }
    return masks;
  }

  function durissimaKeepUidsFromMask(hand, mask) {
    const keepUids = [];
    for (let i = 0; i < hand.length; i++) {
      if (mask & (1 << i)) keepUids.push(hand[i].uid);
    }
    return keepUids;
  }

  function cloneDurissimaWorkState(state) {
    return {
      size: state.size,
      players: state.players,
      status: state.status,
      currentPlayer: state.currentPlayer,
      turns: state.turns,
      turnPlayed: state.turnPlayed,
      initialHandSize: state.initialHandSize,
      durissimaMater: state.durissimaMater,
      durissimaVitaExtraEnabled: state.durissimaVitaExtraEnabled,
      durissimaVitaExtraPool: state.durissimaVitaExtraPool,
      durissimaSelectiveReshuffle: state.durissimaSelectiveReshuffle,
      board: state.board.map(entry => ({
        x: entry.x,
        y: entry.y,
        playerId: entry.playerId,
        card: cloneCardSnapshot(entry.card)
      })),
      hands: state.hands.map(hand => (hand || []).map(cloneCardSnapshot)),
      drawPile: (state.drawPile || []).map(cloneCardSnapshot),
      durissimaReserve: (state.durissimaReserve || []).map(cloneCardSnapshot),
      durissimaVitaExtraUsed: state.durissimaVitaExtraUsed
        ? state.durissimaVitaExtraUsed.slice()
        : Array.from({ length: state.players }, () => 0)
    };
  }

  function useDurissimaSelectiveReshuffle(state, strategy) {
    return isDurissimaVitaExtraEnabled(state)
      && state.durissimaSelectiveReshuffle !== false
      && isDurissimaPlannerStrategy(strategy);
  }

  function scoreDurissimaPostReshuffle(state, playerId, strategy, random) {
    const teamMode = strategy === "durissima-team-planner";
    const branchLimit = PLANNER_BRANCH_LIMIT + 2;
    const requirement = placementRequirement(state);
    const legal = legalPlacements(state, playerId, requirement).length;
    if (!legal) return -1200;
    const move = choosePlacementDurissima(
      state, playerId, requirement, random, branchLimit, teamMode
    );
    if (!move) return -800;
    let score = durissimaMoveScore(
      state, playerId, move, random, branchLimit, requirement, teamMode
    );
    if (durissimaPreferSafePlays(state) && durissimaMoveIsFatal(state, playerId, move)) {
      score -= 180;
    }
    score += legal * 6;
    return score;
  }

  function durissimaHandPlayableUids(state, playerId) {
    const requirement = placementRequirement(state);
    const uids = new Set();
    for (const move of legalPlacements(state, playerId, requirement)) {
      uids.add(move.cardUid);
    }
    return uids;
  }

  /**
   * Rischio «inquinamento tallone»: carte rigide / senza uscita che conviene tenere in mano
   * invece di rimescolarle nel mazzo (idea: non far girare carte difficili o impossibili piu' avanti).
   */
  function durissimaCardDeckPollutionRisk(state, playerId, card) {
    const playable = durissimaHandPlayableUids(state, playerId);
    const requirement = placementRequirement(state);
    let risk = durissimaCardRigidity(card) * 1.15;
    if (DURISSIMA_SCARCE_VALUES.has(card.value)) risk += 9;
    if (!playable.has(card.uid)) {
      risk += 32;
    } else {
      let anyNonFatal = false;
      for (const move of legalPlacements(state, playerId, requirement)) {
        if (move.cardUid !== card.uid) continue;
        if (!durissimaMoveIsFatal(state, playerId, move)) {
          anyNonFatal = true;
          break;
        }
      }
      risk += anyNonFatal ? -14 : 24;
    }
    risk -= compatibilityScore(card) * 0.3;
    return risk;
  }

  function durissimaMaskKeepAlignment(state, playerId, hand, mask) {
    let alignment = 0;
    for (let i = 0; i < hand.length; i++) {
      const risk = durissimaCardDeckPollutionRisk(state, playerId, hand[i]);
      if (mask & (1 << i)) alignment += risk;
      else alignment -= risk * 0.4;
    }
    return alignment;
  }

  function chooseDurissimaVitaKeepUids(state, playerId, random, strategy) {
    const hand = state.hands[playerId] || [];
    if (!hand.length) return [];
    const masks = durissimaVitaKeepUidMasks(hand);
    const sampleCount = hand.length >= 5 ? 3 : 2;
    let bestScore = -Infinity;
    let bestKeep = [];
    for (const mask of masks) {
      const keepUids = durissimaKeepUidsFromMask(hand, mask);
      let total = 0;
      let samples = 0;
      for (let s = 0; s < sampleCount; s++) {
        const sim = cloneDurissimaWorkState(state);
        const rng = mulberry32(hashSeed(
          "sel-vita:" + state.turns + ":" + playerId + ":" + mask + ":" + s + ":" + state.board.length
        ));
        if (!tryDurissimaVitaExtra(sim, playerId, rng, { keepUids, simulate: true })) continue;
        total += scoreDurissimaPostReshuffle(sim, playerId, strategy, random);
        samples++;
      }
      if (!samples) continue;
      const avg = (total / samples) + durissimaMaskKeepAlignment(state, playerId, hand, mask) * 0.5;
      if (avg > bestScore) {
        bestScore = avg;
        bestKeep = keepUids;
      }
    }
    return bestKeep;
  }

  function tryDurissimaVitaExtra(state, playerId, random, options) {
    options = options || {};
    if (!canUseDurissimaVitaExtra(state, playerId)) return false;
    const hand = state.hands[playerId] || [];
    const target = state.initialHandSize || state.size;
    const keepUidSet = new Set(options.keepUids || []);
    const keep = [];
    const release = [];
    for (const card of hand) {
      if (keepUidSet.has(card.uid)) keep.push(card);
      else release.push(card);
    }
    if (hand.length > 0 && release.length === 0) return false;

    state.hands[playerId] = keep.slice();
    state.drawPile = release.concat(state.drawPile || []);
    const rng = random || mulberry32(hashSeed(
      "vita:" + state.turns + ":" + playerId + ":" + state.board.length + ":" + state.drawPile.length
    ));
    state.drawPile = shuffle(state.drawPile, rng);
    const need = Math.max(0, target - state.hands[playerId].length);
    const deal = Math.min(need, state.drawPile.length);
    for (let i = 0; i < deal; i++) {
      state.hands[playerId].push(state.drawPile.shift());
    }

    if (options.simulate === true) return true;

    if (typeof state.durissimaVitaExtraPool !== "number") {
      state.durissimaVitaExtraPool = durissimaVitaExtraPoolLeft(state);
    }
    state.durissimaVitaExtraPool--;
    if (!state.durissimaVitaExtraUsed) {
      state.durissimaVitaExtraUsed = Array.from({ length: state.players }, () => 0);
    }
    state.durissimaVitaExtraUsed[playerId]++;
    return true;
  }

  function tryDurissimaVitaExtraBot(state, playerId, random, strategy) {
    if (!useDurissimaSelectiveReshuffle(state, strategy)) {
      return tryDurissimaVitaExtra(state, playerId, random);
    }
    const keepUids = chooseDurissimaVitaKeepUids(state, playerId, random, strategy);
    return tryDurissimaVitaExtra(state, playerId, random, { keepUids });
  }

  function spendDurissimaVitaExtraUntilPlayable(state, playerId, random, options) {
    options = options || {};
    let used = 0;
    while (canUseDurissimaVitaExtra(state, playerId) && !hasLegalPlacementsNow(state, playerId)) {
      const strategy = options.strategy;
      const ok = strategy && useDurissimaSelectiveReshuffle(state, strategy)
        ? tryDurissimaVitaExtraBot(state, playerId, random, strategy)
        : tryDurissimaVitaExtra(state, playerId, random);
      if (!ok) break;
      used++;
    }
    return used;
  }

  function hasLegalPlacementsNow(state, playerId) {
    const requirement = placementRequirement(state);
    if (requirement === null || (requirement > 4 && requirement !== 1)) return false;
    return legalPlacements(state, playerId, requirement).length > 0;
  }

  function resolveDurissimaStuck(state, random, options) {
    options = options || {};
    const playerId = state.currentPlayer;
    const wantVita = options.useVitaExtra === true
      || (options.useVitaExtra !== false && state.players === 1);
    if (wantVita) {
      const strategy = options.strategy;
      const used = spendDurissimaVitaExtraUntilPlayable(state, playerId, random, { strategy });
      if (used > 0) {
        if (hasLegalPlacementsNow(state, playerId)) return "vita_extra";
        if (state.players === 1) {
          const drew = tryDurissimaEmergencyDraw(state, playerId);
          if (drew) return "drew";
          state.status = "stalled";
          return "lost";
        }
        passTurn(state);
        return "passed";
      }
    }
    if (state.players === 1) {
      const drew = tryDurissimaEmergencyDraw(state, playerId);
      if (drew) return "drew";
      state.status = "stalled";
      return "lost";
    }
    passTurn(state);
    return "passed";
  }

  function applyPlacement(state, playerId, move) {
    const legalMove = validatePlacement(state, playerId, move);
    let card;
    if (legalMove.fromReserve) {
      const reserve = state.durissimaReserve || [];
      const cardIndex = reserve.findIndex(entry => entry.uid === legalMove.cardUid);
      if (cardIndex < 0) throw new Error("Carta non presente nella riserva.");
      card = reserve.splice(cardIndex, 1)[0];
    } else {
      const hand = state.hands[playerId];
      const cardIndex = hand.findIndex(entry => entry.uid === legalMove.cardUid);
      if (cardIndex < 0) throw new Error("Carta non presente nella mano.");
      card = hand.splice(cardIndex, 1)[0];
    }
    const hand = state.hands[playerId];
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
    } else if (isTournamentMode(state)) {
      if (hand.length === 0) {
        tournamentMarkFinished(state, playerId);
      } else if (state.turnPlayed === 4) {
        tournamentAddPoints(state, playerId, 1);
      }
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

  /** Solitario Durissima: pass vietato (buffer o sconfitta). Multi: regole normali. */
  function canPassTurnVoluntarily(state) {
    if (!state || state.status !== "playing") return false;
    if (isDurissimaMater(state) && state.players === 1 && state.turnPlayed === 0) return false;
    return true;
  }

  function durissimaWhenStuckWithoutPlay(state, random, options) {
    return resolveDurissimaStuck(state, random, options);
  }

  function shouldDrawOnPass(state) {
    if (state.drawOnlyAfterPlacement === true) return false;
    if (durissimaUsesCompetitiveDraw(state)) return true;
    if (isDurissimaMater(state) && state.players > 1) return false;
    return true;
  }

  function passTurn(state) {
    if (isDurissimaMater(state) && state.turnPlayed === 0 && state.players === 1) {
      throw new Error(
        "Durissima Mater solitario: senza mosse legali e senza vita extra la partita e' persa."
      );
    }
    if (shouldDrawOnPass(state)) {
      drawForPlayer(state, state.currentPlayer);
    }
    state.consecutivePasses++;
    const canStall = !isDurissimaMater(state) || !isBoardComplete(state);
    if (canStall && state.consecutivePasses >= state.players) {
      if (isTournamentMode(state)) {
        tournamentCompleteHand(state, "monte");
        return;
      }
      state.status = "stalled";
    }
    endTurn(state);
  }

  function drawForPlayer(state, playerId) {
    if (state.drawPile.length === 0) return false;
    if (!durissimaHandBelowDrawCap(state, playerId)) return false;
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
    if (state.status === "playing" && state.turnPlayed > 0 && !handEmpty) {
      if (isDurissimaMater(state) && state.players === 1 && !durissimaUsesCompetitiveDraw(state)) {
        tryDurissimaAfterPlayDraw(state, playerId);
      } else {
        drawForPlayer(state, playerId);
      }
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

  /**
   * Minimo giocatori consigliato (sotto-G): in genere ceil(N/2), eccezione 7x7 -> 3.
   * Vedi RULES.md «Formati consigliati».
   */
  function recommendedMinPlayers(size) {
    if (!Number.isInteger(size) || size < 3 || size > 8) return 0;
    if (size === 7) return 3;
    return Math.max(2, Math.ceil(size / 2));
  }

  function isRecommendedSetup(size, players) {
    return (
      isPlayableSetup(size, players) &&
      players >= recommendedMinPlayers(size) &&
      players <= recommendedMaxPlayers(size)
    );
  }

  /** Sweep/audit di default: legale e G >= G_min (esclude sotto-G sconsigliato). */
  function isDefaultSweepSetup(size, players) {
    return isPlayableSetup(size, players) && players >= recommendedMinPlayers(size);
  }

  /** Durissima: nessun G_min competitivo; solitario e sotto-G ammessi se legali. */
  function durissimaMinPlayers() {
    return 1;
  }

  function isDurissimaSweepSetup(size, players) {
    return isPlayableSetup(size, players) && players >= durissimaMinPlayers();
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
        "Troppi giocatori per " + size + " x " + size + ": servono almeno " + MIN_INITIAL_HAND + " carte a testa."
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
    const reserveSetup = setupDurissimaReserve(shuffled, size, options);
    const tournamentMode = options.tournamentMode === true && options.durissimaMater !== true;
    const randomizeTurnOrder = tournamentMode ? false : options.randomizeTurnOrder !== false;
    const turnOrder = tournamentMode
      ? tournamentTurnOrder(players, 0)
      : randomizeTurnOrder
        ? randomInitialTurnOrder(players, random)
        : defaultTurnOrder(players);
    const initialTurnOrder = turnOrder.slice();
    return {
      size,
      players,
      hands,
      drawPile: reserveSetup.drawPile,
      durissimaReserve: reserveSetup.durissimaReserve,
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
      durissimaCompetitiveDraw: options.durissimaCompetitiveDraw === true,
      durissimaHandDrawCap: options.durissimaHandDrawCap === true,
      durissimaHandDrawCapFactor: options.durissimaHandDrawCapFactor,
      durissimaHandDrawCapMax: options.durissimaHandDrawCapMax,
      drawOnlyAfterPlacement: options.drawOnlyAfterPlacement === true,
      tournamentMode,
      tournamentScores: tournamentMode ? Array.from({ length: players }, () => 0) : null,
      tournamentHandScores: tournamentMode ? Array.from({ length: players }, () => 0) : null,
      tournamentExited: tournamentMode ? Array.from({ length: players }, () => false) : null,
      tournamentHandIndex: tournamentMode ? 0 : null,
      tournamentLastHandReason: tournamentMode ? null : null,
      tournamentMonteLog: tournamentMode ? [] : null,
      tournamentHandLog: tournamentMode ? [] : null,
      tournamentFinishOrder: tournamentMode ? [] : null,
      durissimaEmergencyDrawsLeft: defaultDurissimaEmergencyBudget(size, players, options),
      durissimaAfterPlayDrawsLeft: options.durissimaMater === true
        ? normalizeDurissimaDrawBudget(options.durissimaAfterPlayDrawBudget)
        : null,
      durissimaEmergencyDrawsUsed: 0,
      durissimaAfterPlayDrawsUsed: 0,
      durissimaVitaExtraEnabled: defaultDurissimaVitaExtraEnabled(options),
      durissimaStrategicVitaExtra: options.durissimaStrategicVitaExtra !== false,
      durissimaSelectiveReshuffle: options.durissimaSelectiveReshuffle !== false,
      durissimaVitaExtraPool: defaultDurissimaVitaExtraPool(size, options),
      durissimaVitaExtraUsed: Array.from({ length: players }, () => 0),
      randomizeTurnOrder,
      turnOrder: initialTurnOrder.slice(),
      turnPlacementStats: emptyTurnPlacementStats(),
      initialHandSize: deal.cardsPerPlayer,
      initialDrawCount: deal.drawCount,
      overcrowdedDeal: deal.overcrowded
    };
  }

  /** null/undefined = illimitato; intero >= 0 = tetto per partita. */
  function normalizeDurissimaDrawBudget(value) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
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
    const playerId = state.currentPlayer;
    const playerStrategy = Array.isArray(strategies) ? strategies[playerId] : strategies;
    const action = chooseAction(state, playerId, playerStrategy, random);
    if (action.type === "stop") {
      if (state.turnPlayed === 0) {
        if (isDurissimaMater(state)) {
          if (!useDurissimaStrategicVita(state)) {
            const stuck = durissimaWhenStuckWithoutPlay(state, random, {
              useVitaExtra: true,
              strategy: playerStrategy
            });
            if (stuck === "vita_extra") {
              const retry = chooseAction(state, playerId, playerStrategy, random);
              if (retry.type === "move") {
                applyPlacement(state, playerId, retry.move);
                if (state.status !== "playing") return { played: true, move: retry.move, vitaExtra: true };
                if (state.turnPlayed >= 5) endTurn(state);
                return { played: true, move: retry.move, vitaExtra: true };
              }
            }
            return {
              played: false,
              passed: stuck === "passed",
              drew: stuck === "drew",
              lost: stuck === "lost"
            };
          }
          if (state.players === 1) {
            state.status = "stalled";
            return { played: false, lost: true };
          }
          passTurn(state);
          return { played: false, passed: true };
        }
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
    if (result.status === "success" || result.status === "tournament_complete") {
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

  function simulateTournament(deck, options) {
    const random = options.random;
    const players = options.players;
    if (!Number.isInteger(players) || players < 2) {
      throw new Error("Il torneo richiede almeno 2 giocatori.");
    }
    let strategies = resolveStrategies(options.strategies, players, random);
    if (options.shuffleStrategiesAmongSeats) {
      strategies = shuffle(strategies.slice(), random);
    }
    const state = setupGame(deck, {
      ...options,
      tournamentMode: true,
      randomizeTurnOrder: false
    });
    const stepFactor = 16;
    const maxStepsPerHand = options.size * options.size * players * stepFactor;
    const maxTotalSteps = maxStepsPerHand * players * 2;
    let steps = 0;
    let monteHands = 0;
    let totalTurns = 0;
    while (state.tournamentHandIndex < players && steps < maxTotalSteps) {
      let handSteps = 0;
      while (state.status === "playing" && handSteps < maxStepsPerHand && steps < maxTotalSteps) {
        botStep(state, strategies, random);
        handSteps++;
        steps++;
      }
      totalTurns += state.turns;
      if (state.status === "hand_over") {
        if (state.tournamentLastHandReason === "monte") monteHands++;
        beginNextTournamentHand(state, deck, random);
      } else if (state.status === "tournament_complete") {
        if (state.tournamentLastHandReason === "monte") monteHands++;
        break;
      } else {
        state.status = "stalled";
        break;
      }
    }
    if (state.status === "playing") state.status = "stalled";
    const placementStats = state.turnPlacementStats || emptyTurnPlacementStats();
    const participation = summarizeParticipation(
      state.board,
      state.players,
      state.initialHandSize,
      state.winner
    );
    return {
      status: state.status,
      tournamentMode: true,
      winner: state.winner,
      tournamentScores: (state.tournamentScores || []).slice(),
      tournamentHandsPlayed: state.tournamentHandIndex || 0,
      tournamentMonteHands: monteHands,
      tournamentMonteLog: (state.tournamentMonteLog || []).slice(),
      tournamentHandLog: (state.tournamentHandLog || []).slice(),
      tournamentComplete: state.status === "tournament_complete",
      turns: totalTurns,
      strategies,
      startingPlayer: state.startingPlayer,
      initialTurnOrder: state.initialTurnOrder.slice(),
      duraMaterClosed: state.duraMaterClosed,
      closedByPlayer: state.closedByPlayer,
      durissimaMater: false,
      maxPlacementsInTurn: placementStats.maxInTurn,
      fourCardTurns: placementStats.byCount[4],
      hadFourCardTurn: placementStats.maxInTurn >= 4,
      ideaOffers: placementStats.ideaOffers || 0,
      fiveCardTurns: placementStats.byCount[5],
      hadFiveCardTurn: placementStats.maxInTurn >= 5,
      initialHandSize: state.initialHandSize,
      initialDrawCount: state.initialDrawCount,
      overcrowdedDeal: state.overcrowdedDeal === true,
      ...participation
    };
  }

  function simulateGame(deck, options) {
    if (options.tournamentMode === true && options.durissimaMater !== true) {
      return simulateTournament(deck, options);
    }
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
      durissimaEmergencyDrawsUsed: state.durissimaEmergencyDrawsUsed || 0,
      durissimaAfterPlayDrawsUsed: state.durissimaAfterPlayDrawsUsed || 0,
      durissimaReserveRemaining: (state.durissimaReserve || []).length,
      durissimaVitaExtraUsed: (state.durissimaVitaExtraUsed || []).reduce((sum, n) => sum + n, 0),
      durissimaVitaExtraPoolRemaining: durissimaVitaExtraPoolLeft(state),
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
    isDurissimaGnIdeal,
    gnMaxNodesForSize,
    gnPerMoveNodesForSize,
    gnBranchLimitForSize,
    gnCriticalEmptyThreshold,
    gnEndgameExactThreshold,
    gnNarrowPairCloseThreshold,
    gnIsCriticalPosition,
    gnSelectBestPatchGoal,
    gnIsPatchComplete,
    gnEnumeratePatchCandidates,
    gnUsePatchFirstStrategy,
    gnSelectBestPatchGoal5x5,
    gnTryPatchGuidedAction,
    gnEmptyCellsInIdealGrid,
    gnFilledCellsInIdealGrid,
    gnIdealFillMatchingPossible,
    gnFirstUnfillableIdealCell,
    gnSingletonReservations,
    gnCardReservations,
    gnNarrowFrontierCells,
    gnPruneReservedCardMisuse,
    gnMoveBreaksIdealFillPlan,
    gnShallowMaxDepth,
    gnShallowNodesPerMove,
    solveGnBestAction,
    solveGnShallowBestAction,
    solveGnStateOutcome,
    durissimaUsesCompetitiveDraw,
    durissimaHandDrawCapLimit,
    durissimaHandBelowDrawCap,
    isBoardComplete,
    maybeCompleteDurissima,
    durissimaMoveIsFatal,
    tryDurissimaEmergencyDraw,
    tryDurissimaAfterPlayDraw,
    isDurissimaVitaExtraEnabled,
    durissimaVitaExtraPoolLeft,
    canUseDurissimaVitaExtra,
    tryDurissimaVitaExtra,
    spendDurissimaVitaExtraUntilPlayable,
    hasLegalPlacementsNow,
    resolveDurissimaStuck,
    canPassTurnVoluntarily,
    passTurn,
    drawForPlayer,
    endTurn,
    computeInitialDeal,
    maxPlayersForSize,
    recommendedMaxPlayers,
    recommendedMinPlayers,
    durissimaMinPlayers,
    isRecommendedSetup,
    isDefaultSweepSetup,
    isDurissimaSweepSetup,
    isPlayableSetup,
    setupGame,
    resolveStrategies,
    botStep,
    summarizeParticipation,
    isTournamentMode,
    tournamentTurnOrder,
    tournamentAddPoints,
    tournamentApplyMontePenalties,
    tournamentMarkFinished,
    tournamentCompleteHand,
    beginNextTournamentHand,
    simulateTournament,
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
