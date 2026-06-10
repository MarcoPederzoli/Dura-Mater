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
    ["random", "R - Casuale legale", "R"],
    ["auto", "Auto a partita", "Auto"]
  ];
  const STRATEGY_KEYS = [
    "random", "greedy", "adjacent", "draw-random-finish-random", "low-value", "high-value", "compatibility",
    "planner", "hand-planner", "prudent", "chain-max", "durissima-planner", "durissima-team-planner"
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

  /** Grado finale atteso nella matrice N×N: angolo 2, bordo 3, interno 4. */
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

  function durissimaUnreachableFrontier(sim, outlookCards) {
    const cells = candidateCells(sim);
    if (!cells.length) return 0;
    let blocked = 0;
    for (const cell of cells) {
      let reachable = false;
      for (const card of outlookCards) {
        if (canPlaceCardAt(sim, card, cell.x, cell.y, 1)) {
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

  function choosePlacementDurissima(state, playerId, requirement, random, branchLimit, teamMode) {
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const sample = moves.length > branchLimit ? shuffle(moves, random).slice(0, branchLimit) : moves;
    let bestScore = -Infinity;
    let bestMoves = [];
    for (const move of sample) {
      const score = durissimaMoveScore(state, playerId, move, random, branchLimit, requirement, teamMode === true);
      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }
    if (!bestMoves.length) return moves[Math.floor(random() * moves.length)];
    return bestMoves[Math.floor(random() * bestMoves.length)];
  }

  function placementStrategyForTurn(state, playerId, strategy) {
    const handSize = (state.hands[playerId] || []).length;
    if (strategy === "planner" || strategy === "chain-max" || strategy === "durissima-planner"
      || strategy === "durissima-team-planner") return strategy;
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
    if (placementStrategy === "durissima-team-planner") {
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

  function isBoardComplete(state) {
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

  function defaultDurissimaVitaExtraEnabled(options) {
    if (options.durissimaMater !== true) return false;
    return options.durissimaVitaExtraEnabled === true;
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

  function tryDurissimaVitaExtra(state, playerId, random) {
    if (!canUseDurissimaVitaExtra(state, playerId)) return false;
    const hand = state.hands[playerId] || [];
    const target = state.initialHandSize || state.size;
    state.drawPile = hand.concat(state.drawPile || []);
    state.hands[playerId] = [];
    const rng = random || mulberry32(hashSeed(
      "vita:" + state.turns + ":" + playerId + ":" + state.board.length + ":" + state.drawPile.length
    ));
    state.drawPile = shuffle(state.drawPile, rng);
    const deal = Math.min(target, state.drawPile.length);
    for (let i = 0; i < deal; i++) {
      state.hands[playerId].push(state.drawPile.shift());
    }
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

  function spendDurissimaVitaExtraUntilPlayable(state, playerId, random) {
    let used = 0;
    while (canUseDurissimaVitaExtra(state, playerId) && !hasLegalPlacementsNow(state, playerId)) {
      tryDurissimaVitaExtra(state, playerId, random);
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
      const used = spendDurissimaVitaExtraUntilPlayable(state, playerId, random);
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
      if (isDurissimaMater(state) && state.players === 1) {
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
          const stuck = durissimaWhenStuckWithoutPlay(state, random, { useVitaExtra: true });
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
    isBoardComplete,
    maybeCompleteDurissima,
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
    isRecommendedSetup,
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
