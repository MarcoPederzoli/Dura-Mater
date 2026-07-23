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

  function tournamentTurnOrder(players, gameIndex) {
    const base = defaultTurnOrder(players);
    const offset = ((gameIndex % players) + players) % players;
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
    state.tournamentGameScores[playerId] += delta;
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

  function tournamentCompleteGame(state, reason) {
    if (!state.tournamentGameLog) state.tournamentGameLog = [];
    const finishOrder = (state.tournamentFinishOrder || []).slice();
    const gameEntry = {
      gameIndex: state.tournamentGameIndex,
      starter: state.startingPlayer,
      reason,
      finishOrder,
      firstFinisher: finishOrder.length ? finishOrder[0] : null,
      starterWonGame: finishOrder.length > 0 && finishOrder[0] === state.startingPlayer,
      gameScores: (state.tournamentGameScores || []).slice(),
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
      gameEntry.monte = monteEntry;
      tournamentApplyMontePenalties(state);
    }
    state.tournamentGameLog.push(gameEntry);
    state.tournamentLastGameReason = reason;
    state.tournamentGameIndex++;
    if (state.tournamentGameIndex >= state.players) {
      state.status = "tournament_complete";
      state.winner = tournamentLeaderId(state);
    } else {
      state.status = "game_over";
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
      tournamentCompleteGame(state, "finished");
    } else {
      endTurn(state);
    }
  }

  function resetTournamentGamePlayState(state) {
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
    state.tournamentGameScores = Array.from({ length: state.players }, () => 0);
    state.tournamentFinishOrder = [];
    state.tournamentLastGameReason = null;
    state.status = "playing";
  }

  /** True se la partita del torneo e' finita e si attende la successiva (include status legacy hand_over). */
  function isTournamentGameOverStatus(status) {
    return status === "game_over" || status === "hand_over";
  }

  function beginNextTournamentGame(state, deck, random) {
    if (!isTournamentMode(state) || !isTournamentGameOverStatus(state.status)) {
      throw new Error("Nuova partita del torneo non disponibile.");
    }
    if (state.status === "hand_over") state.status = "game_over";
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
    const turnOrder = tournamentTurnOrder(players, state.tournamentGameIndex);
    state.turnOrder = turnOrder.slice();
    state.initialTurnOrder = turnOrder.slice();
    state.startingPlayer = turnOrder[0];
    state.initialHandSize = deal.cardsPerPlayer;
    state.initialDrawCount = deal.drawCount;
    state.overcrowdedDeal = deal.overcrowded;
    resetTournamentGamePlayState(state);
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
    if (state.board.length === 0) {
      const coordinated = gnUseCoordinatedDurissimaPlanner(state);
      if (coordinated && state._gnFullSequence && state._gnFullSequence.length > 0) {
        // allow the seq to dictate where its first card goes (after we normalized the plan to min=0)
        const firstStep = state._gnFullSequence[0];
        return [{ x: firstStep.x, y: firstStep.y }];
      }
      return [{ x: 0, y: 0 }];
    }
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

  function isIdeaBlindBoardEntry(entry) {
    return entry && entry.ideaBlind === true;
  }

  /** Solitario: carta jolly a faccia in giu' (stesso ruolo geometrico soft dell'Idea). */
  function isWildBlindBoardEntry(entry) {
    return entry && entry.wildBlind === true;
  }

  function isIdeaBlindTurn(state) {
    return state && state.turnPlayed === 4;
  }

  function gnSoloWildUidSet(state) {
    if (!state) return new Set();
    if (Array.isArray(state.durissimaSoloWildUids) && state.durissimaSoloWildUids.length) {
      return new Set(state.durissimaSoloWildUids);
    }
    // legacy singolo uid
    if (state.durissimaSoloWildUid != null && state.durissimaSoloWildUid !== "") {
      return new Set([state.durissimaSoloWildUid]);
    }
    return new Set();
  }

  function isDurissimaSoloWildEnabled(state) {
    return isDurissimaMater(state) && state.players === 1 && gnSoloWildUidSet(state).size > 0;
  }

  function isPlayingSoloWildCard(state, card) {
    if (!card || !isDurissimaSoloWildEnabled(state)) return false;
    return gnSoloWildUidSet(state).has(card.uid);
  }

  function countPhysicalNeighbors(state, x, y) {
    const map = boardMap(state.board);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    let n = 0;
    for (const dir of dirs) {
      if (map.has(coordKey(x + dir.x, y + dir.y))) n++;
    }
    return n;
  }

  function placementScore(state, card, x, y) {
    const map = boardMap(state.board);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    let matches = 0;
    let neighbors = 0;
    let compatibleNeighbors = 0;
    let traitAnchorNeighbors = 0;
    for (const dir of dirs) {
      const adjacent = map.get(coordKey(x + dir.x, y + dir.y));
      if (!adjacent) continue;
      // Wild face-down: conta come vicino sempre compatibile (nessun vincolo di tratto)
      if (isWildBlindBoardEntry(adjacent)) {
        neighbors++;
        compatibleNeighbors++;
        continue;
      }
      // Idea classica: non conta per tratti ne' per grado (comportamento storico)
      if (isIdeaBlindBoardEntry(adjacent)) continue;
      neighbors++;
      const shared = sharedProperties(card, adjacent.card);
      matches += shared;
      if (shared > 0) {
        compatibleNeighbors++;
        traitAnchorNeighbors++;
      }
    }
    return { matches, neighbors, compatibleNeighbors, traitAnchorNeighbors };
  }

  /** Salvo prima carta assoluta e posa Idea cieca: serve almeno un vicino scoperto con tratto in comune. */
  function placementPassesTraitAnchor(state, score) {
    if (!state || state.board.length === 0) return true;
    if (isIdeaBlindTurn(state)) return true;
    if (score && score._soloWildPlacement) return true;
    return score.traitAnchorNeighbors >= 1;
  }

  function placementIsLegal(state, card, x, y, requirement) {
    if (state.board.length === 0) return true;
    // Solitario wild: posa come Idea (connessione fisica, no vincoli di tratto)
    if (isPlayingSoloWildCard(state, card)) {
      return countPhysicalNeighbors(state, x, y) >= 1;
    }
    const score = placementScore(state, card, x, y);
    if (isIdeaBlindTurn(state)) return score.neighbors >= 1 || countPhysicalNeighbors(state, x, y) >= 1;
    if (score.neighbors < requirement) return false;
    if (score.compatibleNeighbors !== score.neighbors) return false;
    return placementPassesTraitAnchor(state, score);
  }

  function isDurissimaReserveEnabled(state) {
    return isDurissimaMater(state) && Array.isArray(state.durissimaReserve);
  }

  /**
   * Free cell (solitario): slot di parcheggio stile Freecell.
   * Carte parcheggiate restano giocabili sulla griglia e NON entrano nel reshuffle vita.
   * Default 0 (core puro); probe: options.durissimaFreeCellSlots = 1..4.
   */
  function isDurissimaFreeCellsEnabled(state) {
    return (
      isDurissimaMater(state) &&
      state.players === 1 &&
      Array.isArray(state.durissimaFreeCells) &&
      state.durissimaFreeCells.length > 0
    );
  }

  function durissimaFreeCellSlotsCount(state) {
    if (!isDurissimaFreeCellsEnabled(state)) return 0;
    return state.durissimaFreeCells.length;
  }

  function durissimaFreeCellEmptyIndex(state) {
    if (!isDurissimaFreeCellsEnabled(state)) return -1;
    for (let i = 0; i < state.durissimaFreeCells.length; i++) {
      if (!state.durissimaFreeCells[i]) return i;
    }
    return -1;
  }

  function durissimaFreeCellOccupiedCount(state) {
    if (!isDurissimaFreeCellsEnabled(state)) return 0;
    let n = 0;
    for (const c of state.durissimaFreeCells) if (c) n++;
    return n;
  }

  function playableCardSources(state, playerId) {
    const sources = [];
    for (const card of (state.hands[playerId] || [])) {
      sources.push({ card, fromReserve: false, fromFreeCell: false });
    }
    if (isDurissimaReserveEnabled(state)) {
      for (const card of state.durissimaReserve) {
        sources.push({ card, fromReserve: true, fromFreeCell: false });
      }
    }
    if (isDurissimaFreeCellsEnabled(state)) {
      for (let i = 0; i < state.durissimaFreeCells.length; i++) {
        const card = state.durissimaFreeCells[i];
        if (card) {
          sources.push({
            card,
            fromReserve: false,
            fromFreeCell: true,
            freeCellIndex: i
          });
        }
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
        const ideaBlind = isIdeaBlindTurn(state);
        const legal = placementIsLegal(state, source.card, cell.x, cell.y, requirement);
        if (legal) {
          const wildPlay = isPlayingSoloWildCard(state, source.card);
          moves.push({
            cardUid: source.card.uid,
            card: source.card,
            fromReserve: source.fromReserve === true,
            fromFreeCell: source.fromFreeCell === true,
            freeCellIndex: source.fromFreeCell ? source.freeCellIndex : undefined,
            x: cell.x,
            y: cell.y,
            matches: score.matches,
            neighbors: wildPlay
              ? countPhysicalNeighbors(state, cell.x, cell.y)
              : score.neighbors,
            compatibleNeighbors: score.compatibleNeighbors,
            ideaBlind: ideaBlind || undefined,
            wildBlind: wildPlay || undefined
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
        card: cloneCardSnapshot(entry.card),
        ideaBlind: entry.ideaBlind === true || undefined
      })),
      hands,
      durissimaReserve: (source.durissimaReserve || []).map(cloneCardSnapshot),
      durissimaFreeCells: Array.isArray(source.durissimaFreeCells)
        ? source.durissimaFreeCells.map(c => (c ? cloneCardSnapshot(c) : null))
        : [],
      durissimaSoloWildUid: source.durissimaSoloWildUid || null,
      durissimaSoloWildUids: Array.isArray(source.durissimaSoloWildUids)
        ? source.durissimaSoloWildUids.slice()
        : source.durissimaSoloWildUid
          ? [source.durissimaSoloWildUid]
          : [],
      turnPlayed: source.turnPlayed
    };
  }

  function applyPlacementSim(sim, playerId, move) {
    let card = null;
    if (move.fromFreeCell === true || (move.freeCellIndex != null && move.freeCellIndex >= 0)) {
      const cells = sim.durissimaFreeCells || [];
      let idx =
        move.freeCellIndex != null && move.freeCellIndex >= 0
          ? move.freeCellIndex
          : cells.findIndex(c => c && c.uid === move.cardUid);
      if (idx < 0 || !cells[idx] || cells[idx].uid !== move.cardUid) {
        idx = cells.findIndex(c => c && c.uid === move.cardUid);
      }
      if (idx < 0 || !cells[idx]) return false;
      card = cells[idx];
      cells[idx] = null;
    } else if (move.fromReserve) {
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
    const ideaBlind = sim.turnPlayed === 4;
    const wildBlind =
      card && gnSoloWildUidSet(sim).has(card.uid);
    sim.board.push({
      x: move.x,
      y: move.y,
      card,
      playerId,
      ideaBlind: ideaBlind || undefined,
      wildBlind: wildBlind || undefined
    });
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
    return placementIsLegal(sim, card, x, y, requirement);
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
      const entry = map.get(coordKey(x + dir.x, y + dir.y));
      if (entry && !isIdeaBlindBoardEntry(entry)) n++;
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
      durissimaIdeaDepthBonus(state, playerId, chainDepth) +
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

  /** Opt-in: in partita reale 1 carta/turno e' spesso migliore; attivo solo per probe/sim. */
  function durissimaPursueIdea(state) {
    return isDurissimaMater(state) && state.durissimaPursueIdea === true;
  }

  /**
   * Opt-in: solitario puo' fare catene mid-game (disabilita turni corti).
   * Default OFF: con o senza refill, mid-game preferisce 1 posa/turno.
   * Probe: options.durissimaSoloAllowMidChains === true o GN_SOLO_MID_CHAINS=1.
   */
  function durissimaSoloAllowMidChains(state) {
    if (!state || state.players !== 1) return false;
    if (state.durissimaSoloAllowMidChains === true) return true;
    if (
      typeof process !== "undefined" &&
      process.env &&
      process.env.GN_SOLO_MID_CHAINS === "1"
    ) {
      return true;
    }
    return false;
  }

  function durissimaHandCards(state, playerId) {
    return (state.hands[playerId] || []).length;
  }

  /** Griglie grandi: serve tabellone abbastanza denso per catene da 2-4 nel turno. */
  function durissimaBoardReadyForIdeaChain(state) {
    if (!state || !state.board.length) return false;
    if (state.size < 6) return true;
    return state.board.length >= Math.ceil(state.size * 1.5);
  }

  function durissimaIdeaSizeScale(state) {
    if (!state || state.size < 6) return 1;
    return 1 + (state.size - 5) * 0.45;
  }

  /** Almeno 4 carte mano+turno per puntare a un turno da 4 (+ Idea opzionale). */
  function durissimaCanPursueIdeaThisTurn(state, playerId) {
    if (!durissimaPursueIdea(state)) return false;
    if (durissimaHandCards(state, playerId) + (state.turnPlayed || 0) < 4) return false;
    return durissimaBoardReadyForIdeaChain(state);
  }

  function durissimaIdeaDepthBonus(state, playerId, chainDepth) {
    if (!durissimaCanPursueIdeaThisTurn(state, playerId)) return 0;
    const played = state.turnPlayed || 0;
    if (chainDepth <= played) return 0;
    let bonus = (chainDepth - played) * 140;
    if (chainDepth >= 4) bonus += 220;
    if (chainDepth >= 5) bonus += 400;
    return bonus * durissimaIdeaSizeScale(state);
  }

  /** Punteggio posa jolly: ponte interno con ancoraggio e lati verso vuoto (buco utile). */
  function durissimaIdeaJollyBridgeScore(state, move) {
    if (!isIdeaBlindTurn(state)) return 0;
    const map = boardMap(state.board);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    let realNeighbors = 0;
    let score = 0;
    for (const dir of dirs) {
      const adj = map.get(coordKey(move.x + dir.x, move.y + dir.y));
      if (!adj) {
        score += 18;
        continue;
      }
      if (!isIdeaBlindBoardEntry(adj)) realNeighbors++;
    }
    if (realNeighbors >= 1 && realNeighbors <= 2) score += 95;
    const bounds = boardBounds(state.board, [{ x: move.x, y: move.y }]);
    const relX = move.x - bounds.minX;
    const relY = move.y - bounds.minY;
    if (relX > 0 && relY > 0 && relX < bounds.width - 1 && relY < bounds.height - 1) {
      score += 55;
    }
    if (state.size >= 6) score += 35;
    return score;
  }

  /** Massimizza profondita' catena (fino a 5 con Idea) quando conviene puntare all'Idea. */
  function chooseDurissimaIdeaPursuitPlacement(state, playerId, random, branchLimit, teamMode) {
    const requirement = placementRequirement(state);
    const moves = legalPlacements(state, playerId, requirement);
    if (!moves.length) return null;
    const preferSafe = durissimaPreferSafePlays(state);
    const sample = moves.length > branchLimit ? shuffle(moves, random).slice(0, branchLimit) : moves;

    if (isIdeaBlindTurn(state)) {
      let bestBridge = -Infinity;
      let bestMoves = [];
      for (const move of sample) {
        const bridge = durissimaIdeaJollyBridgeScore(state, move);
        if (bridge > bestBridge) {
          bestBridge = bridge;
          bestMoves = [move];
        } else if (bridge === bestBridge) {
          bestMoves.push(move);
        }
      }
      if (bestMoves.length) return bestMoves[Math.floor(random() * bestMoves.length)];
    }

    const budget = { count: 0, max: PLANNER_MAX_NODES };
    let bestDepth = -1;
    let bestMoves = [];
    for (const move of sample) {
      const sim = cloneSimState(state, playerId);
      if (!applyPlacementSim(sim, playerId, move)) continue;
      const depth = maxChainPlays(sim, playerId, branchLimit, random, budget);
      const allowFatal = durissimaCanPursueIdeaThisTurn(state, playerId) && depth >= 4;
      if (preferSafe && durissimaMoveIsFatal(state, playerId, move) && !allowFatal) continue;
      if (depth > bestDepth) {
        bestDepth = depth;
        bestMoves = [move];
      } else if (depth === bestDepth) {
        bestMoves.push(move);
      }
    }
    if (!bestMoves.length) return null;
    return bestMoves[Math.floor(random() * bestMoves.length)];
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
  const GN_IDEAL_LAYOUT_RULES_CACHE = new Map();
  const GN_MEMO_CAP = 50000;

  // GN_IDEAL_LAYOUT_RULES_START
  const GN_IDEAL_LAYOUT_RULES_DATA = {"3":{"size":3,"totalSolutions":160,"forbidden":{"118":[[1,1]],"227":[[1,1]],"247":[[1,1]],"356":[[1,1]]},"preferredRole":{},"anchors":{},"exchangeZones":[{"axis":"value","trait":"3","abundance":5},{"axis":"color","trait":"Bianco","abundance":4},{"axis":"value","trait":"2","abundance":3},{"axis":"color","trait":"Viola","abundance":3}]},"4":{"size":4,"totalSolutions":1250416,"forbidden":{},"preferredRole":{},"anchors":{},"exchangeZones":[{"axis":"value","trait":"4","abundance":7},{"axis":"color","trait":"Bianco","abundance":6},{"axis":"value","trait":"3","abundance":5},{"axis":"color","trait":"Viola","abundance":5},{"axis":"color","trait":"Blu","abundance":4},{"axis":"value","trait":"2","abundance":3},{"axis":"shape","trait":"Cuori","abundance":3},{"axis":"shape","trait":"Triangoli","abundance":3},{"axis":"shape","trait":"Quadrati","abundance":3}]}};
  // GN_IDEAL_LAYOUT_RULES_END

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
    const plan = state._gnTargetPlan;
    if (plan && Array.isArray(plan)) {
      for (const p of plan) {
        if (p.card && p.card.uid === move.card.uid && p.x === move.x && p.y === move.y) {
          return false; // piano deal-aware garantisce che questa posa e' parte di sequenza valida
        }
      }
    }
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
    if (size === 6) return 36;
    if (size === 7) return 40;
    return 36;
  }

  /** Tetto nodi DFS per partita (G=N). 3x3/4x4: basso, velocita' > copertura totale. */
  function gnMaxNodesForSize(size) {
    if (size <= 3) return 80000;
    if (size <= 4) return 200000;
    if (size <= 5) return 500000;
    if (size <= 6) return 1200000;
    if (size <= 7) return 2500000;
    return 4000000;
  }

  /** Tetto nodi per singola decisione del global-planner. */
  function gnPerMoveNodesForSize(size) {
    if (size <= 3) return 15000;
    if (size <= 4) return 20000;
    if (size <= 5) return 35000;
    if (size <= 6) return 90000;
    if (size <= 7) return 150000;
    return 200000;
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
    options = options || {};
    const ctx = gnSearchContextForState(state, options);
    const gameLeft = gnSearchBudgetLeft(ctx);
    if (gameLeft <= 0) return null;

    // Auto-attach target plan for G=N global planner (step 2)
    // Per 3x3 lasciamo il comportamento precedente (senza attach automatico) per non rompere test noti.
    if (isDurissimaGnIdeal(state) && state.size >= 4 && !options.targetPlan) {
      if (state._gnTargetPlan) {
        options.targetPlan = state._gnTargetPlan;
      } else if (!state._gnTargetPlanTried) {
        try {
          const ms = dmRequireModule("./scripts/durissima-matrix-solver");
          if (!ms) throw new Error("solver unavailable");
          let plan = null;
          if (state.size >= 4 && state.hands && Array.isArray(state.hands) && state.players === state.size && ms.createPlayerAwarePlanForDeal) {
            plan = ms.createPlayerAwarePlanForDeal(state.size, state.hands, { maxNodesA: 20000000, maxNodes: 1500000 });
          }
          if (!plan) {
            plan = ms.createTargetPlanForSize(state.size, { maxNodesA: 30000000, maxNodesB: 2000000 });
          }
          if (plan) {
            options.targetPlan = plan;
            state._gnTargetPlan = plan;
          }
        } catch (e) {
          // not available
        }
        state._gnTargetPlanTried = true;
      }
    }
    const totalCells = state.size * state.size;
    const empty = totalCells - state.board.length;
    const fillRatio = state.board.length / totalCells;
    const baseMoveLimit = gnPerMoveNodesForSize(state.size);
    let moveLimit = baseMoveLimit;

    // Per perfect-info G=N (una mente) o solitario G=1: più budget al search
    const perfectGN = gnUseCoordinatedTeamPlanner(state) && isDurissimaGnIdeal(state);
    const soloGN = gnUseCoordinatedSoloPlanner(state);
    if (perfectGN) {
      if (state.size === 4) moveLimit = Math.max(moveLimit, 800000);
      else if (state.size <= 5) moveLimit = Math.max(moveLimit, Math.floor(baseMoveLimit * 2));
    } else if (soloGN) {
      if (state.size <= 4) moveLimit = Math.max(moveLimit, 600000);
      else if (state.size <= 6) moveLimit = Math.max(moveLimit, Math.floor(baseMoveLimit * 1.8));
      else moveLimit = Math.max(moveLimit, Math.floor(baseMoveLimit * 1.2));
    }
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

  function gnIdealLayoutRulesEnabled() {
    if (typeof process !== "undefined" && process.env && process.env.GN_SKIP_IDEAL_LAYOUT === "1") {
      return false;
    }
    // Quando abbiamo un piano player-aware sul deal, privilegia quello (layout ideale generico puo' interferire su 4x4)
    const st = (typeof globalThis !== "undefined" && globalThis._gnCurrentStateForLayoutCheck) || null;
    // semplice: se _gnTargetPlan ha holderId, disabilita layout rules (piano deal-aware attivo)
    // ma per evitare dip, controlliamo env o size; per ora su 4x4 layout noto negativo
    return true;
  }

  function gnIdealLayoutCellRole(size, x, y) {
    const last = size - 1;
    const onBorder = x === 0 || x === last || y === 0 || y === last;
    const isCorner = onBorder && (x === 0 || x === last) && (y === 0 || y === last);
    if (isCorner) return "corner";
    if (!onBorder) {
      if (size % 2 === 1) {
        const mid = Math.floor(size / 2);
        if (x === mid && y === mid) return "center";
      }
      return "inner";
    }
    return "edge";
  }

  function gnBuildIdealLayoutRulesFromMorph(size) {
    const morph = gnMorphologyForSize(size);
    const deck = simulationDeck().filter(card => Number(card.value) <= size);
    const traits = { value: {}, shape: {}, color: {} };
    for (const card of deck) {
      traits.value[card.value] = (traits.value[card.value] || 0) + 1;
      traits.shape[card.shape] = (traits.shape[card.shape] || 0) + 1;
      traits.color[card.color] = (traits.color[card.color] || 0) + 1;
    }
    const exchangeZones = [];
    for (const axis of ["value", "shape", "color"]) {
      for (const [trait, abundance] of Object.entries(traits[axis])) {
        if (abundance >= 3) exchangeZones.push({ axis, trait, abundance });
      }
    }
    exchangeZones.sort((a, b) => b.abundance - a.abundance);
    const anchors = {};
    for (const card of deck) {
      const m = morph.cardMorph(card);
      if (m.rigidity < 1.2) continue;
      const code = String(card.code).padStart(3, "0");
      anchors[code] = { preferRole: "corner", strength: Math.round(m.rigidity * 30) };
    }
    return {
      size,
      totalSolutions: null,
      forbidden: {},
      preferredRole: {},
      anchors,
      exchangeZones
    };
  }

  function gnIdealLayoutRulesForSize(size) {
    if (!GN_IDEAL_LAYOUT_RULES_CACHE.has(size)) {
      const baked = GN_IDEAL_LAYOUT_RULES_DATA[String(size)] || GN_IDEAL_LAYOUT_RULES_DATA[size];
      GN_IDEAL_LAYOUT_RULES_CACHE.set(size, baked || gnBuildIdealLayoutRulesFromMorph(size));
    }
    return GN_IDEAL_LAYOUT_RULES_CACHE.get(size);
  }

  function gnIdealLayoutMoveScore(state, move) {
    if (!gnIdealLayoutRulesEnabled() || !isDurissimaGnIdeal(state)) return 0;
    // Per 4x4 il layout ideale generico ha dato probe negativo; il piano player-aware sul deal ha precedenza
    if (state.size === 4) return 0;
    const rules = gnIdealLayoutRulesForSize(state.size);
    if (!rules) return 0;
    const code = String(move.card.code).padStart(3, "0");
    let score = 0;

    const forb = rules.forbidden && rules.forbidden[code];
    if (forb) {
      for (const pair of forb) {
        if (move.x === pair[0] && move.y === pair[1]) return -80000;
      }
    }

    const role = gnIdealLayoutCellRole(state.size, move.x, move.y);
    const pref = rules.preferredRole && rules.preferredRole[code];
    if (pref) {
      if (role === pref) score += 140;
      else if (pref === "corner" && role === "edge") score += 50;
      else if (pref === "edge" && role === "corner") score += 20;
      else if (role === "center" && pref !== "center") score -= 90;
    }

    const anchor = rules.anchors && rules.anchors[code];
    if (anchor) {
      if (role === anchor.preferRole) score += anchor.strength || 40;
      else if (anchor.preferRole === "corner" && role === "edge") score += Math.round((anchor.strength || 40) * 0.35);
      else if (role === "center") score -= Math.round((anchor.strength || 40) * 0.5);
    } else {
      const morph = gnMorphologyForSize(state.size).cardMorph(move.card);
      if (morph.rigidity >= 1.2) {
        if (role === "corner") score += morph.rigidity * 35;
        else if (role === "edge") score += morph.rigidity * 12;
        else if (role === "center") score -= morph.rigidity * 25;
      }
    }

    const map = boardMap(state.board);
    const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
    for (const zone of rules.exchangeZones || []) {
      const trait = move.card[zone.axis];
      if (String(trait) !== String(zone.trait)) continue;
      let sharedNeighbors = 0;
      for (const dir of dirs) {
        const adj = map.get(coordKey(move.x + dir.x, move.y + dir.y));
        if (adj && String(adj.card[zone.axis]) === String(zone.trait)) sharedNeighbors++;
      }
      score += sharedNeighbors * zone.abundance * 10;
      if (sharedNeighbors === 0 && state.board.length > 0) {
        score += zone.abundance * 2;
      }
    }

    return score;
  }

  function gnPruneForbiddenIdealLayoutMoves(state, playerId, moves) {
    if (!gnIdealLayoutRulesEnabled() || !isDurissimaGnIdeal(state) || !moves.length) return moves;
    const kept = moves.filter(move => gnIdealLayoutMoveScore(state, move) > -50000);
    return kept.length ? kept : moves;
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

  /**
   * True se una search DFS puo' usare il drawPile senza oracolo sull'ordine.
   * Se c'e' almeno 1 carta nel tallone, l'ordine e' ignoto al tavolo: vietato
   * far pescare al solver la cima reale (cheat vs umani col foglio).
   * Mani di tutti i giocatori = note (one mind / umani che mostrano le carte): OK.
   */
  function gnSearchMayUseDrawPile(state) {
    return !state || !state.drawPile || state.drawPile.length === 0;
  }

  /** Contatore asserzioni anti-oracolo (test / diagnostica). */
  let _gnDrawOracleBlockEvents = 0;
  function gnDrawOracleBlockCount() {
    return _gnDrawOracleBlockEvents;
  }
  function gnResetDrawOracleBlockCount() {
    _gnDrawOracleBlockEvents = 0;
  }
  function gnRecordDrawOracleBlock(reason) {
    _gnDrawOracleBlockEvents++;
    if (typeof process !== "undefined" && process.env && process.env.GN_DRAW_ORACLE_STRICT === "1") {
      throw new Error("DRAW-ORACLE blocked: " + (reason || "tallone non vuoto"));
    }
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
      durissimaFreeCells: Array.isArray(state.durissimaFreeCells)
        ? state.durissimaFreeCells.map(c => (c ? cloneCardSnapshot(c) : null))
        : [],
      durissimaSoloWildUid: state.durissimaSoloWildUid || null,
      durissimaSoloWildUids: Array.isArray(state.durissimaSoloWildUids)
        ? state.durissimaSoloWildUids.slice()
        : state.durissimaSoloWildUid
          ? [state.durissimaSoloWildUid]
          : [],
      durissimaSoloWildCard: state.durissimaSoloWildCard === true,
      durissimaSoloWildSmartBot: state.durissimaSoloWildSmartBot !== false,
      hands: state.hands.map(hand => (hand || []).map(cloneCardSnapshot)),
      board: state.board.map(entry => ({
        x: entry.x,
        y: entry.y,
        playerId: entry.playerId,
        card: cloneCardSnapshot(entry.card),
        ideaBlind: entry.ideaBlind === true || undefined,
        wildBlind: entry.wildBlind === true || undefined
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

  /**
   * Fork per search: se il tallone non e' vuoto, lo svuota nel fork di ricerca
   * (le carte restano "nel multiset" solo a livello di conoscenza di set via mani/board;
   * non si simula la FIFO reale). Usare solo per DFS che altrimenti barerebbe.
   * Preferire: non lanciare affatto la search se !gnSearchMayUseDrawPile.
   */
  function gnForkSearchStateNoDrawOracle(state) {
    const fork = gnForkSearchState(state);
    if (!gnSearchMayUseDrawPile(fork)) {
      fork.drawPile = [];
    }
    return fork;
  }

  function gnCapturePlacementFrame(state, playerId, move) {
    const base = {
      playerId,
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
      ideaOffers: state.turnPlacementStats ? state.turnPlacementStats.ideaOffers : 0,
      fromReserve: false,
      fromFreeCell: false,
      freeCellIndex: -1,
      reserveIndex: -1,
      handIndex: -1,
      card: null
    };
    if (move.fromFreeCell === true || (move.freeCellIndex != null && move.freeCellIndex >= 0)) {
      const cells = state.durissimaFreeCells || [];
      let idx =
        move.freeCellIndex != null && move.freeCellIndex >= 0
          ? move.freeCellIndex
          : cells.findIndex(c => c && c.uid === move.cardUid);
      if (idx < 0 || !cells[idx] || cells[idx].uid !== move.cardUid) {
        idx = cells.findIndex(c => c && c.uid === move.cardUid);
      }
      if (idx < 0 || !cells[idx]) return null;
      base.fromFreeCell = true;
      base.freeCellIndex = idx;
      base.card = cells[idx];
      return base;
    }
    if (move.fromReserve === true) {
      const reserve = state.durissimaReserve || [];
      const ridx = reserve.findIndex(entry => entry.uid === move.cardUid);
      if (ridx < 0) return null;
      base.fromReserve = true;
      base.reserveIndex = ridx;
      base.card = reserve[ridx];
      return base;
    }
    const hand = state.hands[playerId] || [];
    const handIndex = hand.findIndex(entry => entry.uid === move.cardUid);
    if (handIndex < 0) return null;
    base.handIndex = handIndex;
    base.card = hand[handIndex];
    return base;
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
    if (frame.fromFreeCell) {
      if (!state.durissimaFreeCells) state.durissimaFreeCells = [];
      state.durissimaFreeCells[frame.freeCellIndex] = frame.card;
    } else if (frame.fromReserve) {
      if (!state.durissimaReserve) state.durissimaReserve = [];
      state.durissimaReserve.splice(frame.reserveIndex, 0, frame.card);
    } else {
      state.hands[frame.playerId].splice(frame.handIndex, 0, frame.card);
    }
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
    // Search/sim in-place non deve consumare la FIFO reale se c'e' tallone
    if (
      state &&
      state._gnInCoordinatedDecide &&
      state.drawPile &&
      state.drawPile.length > 0
    ) {
      gnRecordDrawOracleBlock("gnApplyEndTurnInPlace during coordinated decide with tallone");
      if (typeof process !== "undefined" && process.env && process.env.GN_DRAW_ORACLE_STRICT === "1") {
        throw new Error(
          "DRAW-ORACLE: endTurn in-place durante decisione con tallone ordinato"
        );
      }
    }
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

  function gnCapturePassTurnFrame(state) {
    return {
      currentPlayer: state.currentPlayer,
      turns: state.turns,
      turnPlayed: state.turnPlayed,
      consecutivePasses: state.consecutivePasses,
      status: state.status,
      stats: state.turnPlacementStats
        ? {
            byCount: state.turnPlacementStats.byCount.slice(),
            maxInTurn: state.turnPlacementStats.maxInTurn
          }
        : null
    };
  }

  function gnApplyPassTurnInPlace(state) {
    if (!canPassTurnVoluntarily(state) || state.turnPlayed !== 0) return null;
    const frame = gnCapturePassTurnFrame(state);
    passTurn(state);
    frame.resultStatus = state.status;
    return frame;
  }

  function gnUndoPassTurnInPlace(state, frame) {
    state.currentPlayer = frame.currentPlayer;
    state.turns = frame.turns;
    state.turnPlayed = frame.turnPlayed;
    state.consecutivePasses = frame.consecutivePasses;
    state.status = frame.status;
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
      state.consecutivePasses,
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
      score += gnIdealLayoutMoveScore(state, move) * 0.22;
      if (isDurissimaGnIdeal(state) && gnEmptyCellsInIdealGrid(state) <= gnNarrowHeuristicEmptyCap(state.size)) {
        const narrow = options._narrowFrontier || gnNarrowFrontierCells(state);
        for (const cell of narrow) {
          if (move.x === cell.x && move.y === cell.y) {
            score += 40000 + (3 - cell.n) * 5000;
            break;
          }
        }
      }
      // Player-aware plan guidance (strong in global path too)
      if (options.targetPlan && Array.isArray(options.targetPlan)) {
        const plan = options.targetPlan;
        const cardUid = move.card.uid;
        let planIndex = -1;
        for (let i = 0; i < plan.length; i++) {
          if (plan[i].card && plan[i].card.uid === cardUid) { planIndex = i; break; }
        }
        if (planIndex >= 0) {
          const is4 = (state.size === 4);
          const mult = is4 ? 600 : (state.size >= 4 ? 25 : 4);
          const cellB = is4 ? 25000 : (state.size >= 4 ? 1000 : 200);
          score += Math.max(0, (plan.length - planIndex) * mult);
          const targetStep = plan[planIndex];
          if (targetStep.x === move.x && targetStep.y === move.y) {
            score += cellB;
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
    score += gnIdealLayoutMoveScore(state, move) * 0.18;

    // Guida da target globale A+B (oracolo G=N collaborativo)
    // Rinforzata per piano player-aware: bonus grande su carta precoce + cella esatta del piano.
    if (options.targetPlan && Array.isArray(options.targetPlan)) {
      const plan = options.targetPlan;
      const cardUid = move.card.uid;
      let planIndex = -1;
      for (let i = 0; i < plan.length; i++) {
        if (plan[i].card && plan[i].card.uid === cardUid) {
          planIndex = i;
          break;
        }
      }
      if (planIndex >= 0) {
        const is4 = (state.size === 4);
        const mult = is4 ? 500 : (state.size >= 4 ? 20 : 4);
        const cellB = is4 ? 20000 : (state.size >= 4 ? 800 : 200);
        score += Math.max(0, (plan.length - planIndex) * mult);
        const targetStep = plan[planIndex];
        if (targetStep.x === move.x && targetStep.y === move.y) {
          score += cellB;
        }
      }
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

    // In perfect-info coordinated G=N (una mente, tutte le carte visibili), non applicare prunes
    // "intelligenti" pensati per altri scenari (layout ideale, fatal euristici, unfillable generici).
    // Il bot deve poter esplorare tutte le mosse geometricamente legali per il giocatore corrente,
    // usando i passi per portare il titolare giusto. Il piano (se presente) guida l'ordinamento.
    const perfectGN = gnUseCoordinatedTeamPlanner(state) && isDurissimaGnIdeal(state);
    const relaxPrunes = perfectGN && state.size >= 4;  // solo su 4+ per non rompere 3x3 noto buono
    if (!relaxPrunes) {
      moves = gnFilterIdealGridMoves(state, moves);
      moves = gnPruneFatalMoves(state, playerId, moves);
      moves = gnPruneForbiddenIdealLayoutMoves(state, playerId, moves);
      const unfillablePruned = gnPruneUnfillableIdealMoves(state, playerId, moves);
      if (unfillablePruned.length) moves = unfillablePruned;
    }

    // No forcing: for perfect GN the search sees all legal for current (relaxed prunes), ordered/ranked with strong plan bias.
    // The mind has flexibility to choose among current's legal, guided by the plan.


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
          let bonus = 50000;
          if (state.turnPlayed > 0) {
            const reservations = gnCardReservations(state);
            const cell = reservations.get(move.card.uid);
            if (cell && cell.x === move.x && cell.y === move.y) {
              const alt = moves.some(other =>
                other.x === move.x && other.y === move.y && other.card.uid !== move.card.uid
                && !gnMoveBreaksIdealFillPlan(state, playerId, other)
              );
              if (alt) bonus = 0;
            }
          }
          score += bonus;
        }
        return { move, score };
      })
      .sort((a, b) => b.score - a.score);

    // Strong plan bias for G=N oracle: plan-advancing moves first
    if (options.targetPlan && Array.isArray(options.targetPlan)) {
      const plan = options.targetPlan;
      const planUids = new Set(plan.map(p => p.card && p.card.uid).filter(Boolean));
      const planMoves = ranked.filter(e => planUids.has(e.move.cardUid || e.move.card.uid));
      const other = ranked.filter(e => !planUids.has(e.move.cardUid || e.move.card.uid));
      const combined = [...planMoves, ...other];
      const cap = Math.max(1, branchLimit || combined.length);
      return combined.slice(0, cap).map(entry => entry.move);
    }

    const cap = Math.max(1, branchLimit || ranked.length);
    return ranked.slice(0, cap).map(entry => entry.move);
  }

  function solveGnStateOutcome(state, options) {
    options = options || {};
    // HARD BAN: DFS non puo' simulare pesche con ordine reale del tallone.
    // One mind vede le mani; non vede l'ordine del mazzo (come gli umani col foglio).
    if (!gnSearchMayUseDrawPile(state)) {
      gnRecordDrawOracleBlock("solveGnStateOutcome with drawPile.length=" + (state.drawPile || []).length);
      const stats = options.stats || { nodes: 0, maxDepth: 0, memoHits: 0 };
      return { result: "unsolved", stats, action: null, blockedDrawOracle: true };
    }
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

      const coopTurnStartPass = options.coordinatedTeam
        && gnUseCoordinatedTeamPlanner(gameState)
        && gameState.turnPlayed === 0
        && gameState.players > 1;

      if (coopTurnStartPass) {
        const passRoot = depth === 0 ? { type: "stop" } : rootAction;
        const passFrame = gnApplyPassTurnInPlace(gameState);
        if (passFrame && passFrame.resultStatus === "playing") {
          const outcome = dfs(gameState, depth + 1, passRoot);
          gnUndoPassTurnInPlace(gameState, passFrame);
          if (outcome === "solved") {
            if (trackAction && passRoot) foundAction = passRoot;
            gnMemoStore(memo, stats, key, "solved");
            return "solved";
          }
          if (outcome === "budget") return "budget";
        } else if (passFrame) {
          gnUndoPassTurnInPlace(gameState, passFrame);
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
    // Niente DFS con pesca ordinata se c'e' tallone (ordine ignoto al tavolo)
    if (!gnSearchMayUseDrawPile(state)) return null;
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
    if (!gnSearchMayUseDrawPile(state)) return null;
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

  /** 7x7 G=N: nucleo 3x3, quattro 3x3 sui lati, quattro 3x3 agli angoli (no croce). */
  function gn7x7Center3() {
    return { ox: 2, oy: 2, w: 3, h: 3 };
  }

  function gn7x7Side3x3Order() {
    const m = 4;
    return [
      { ox: 2, oy: 0, w: 3, h: 3 },
      { ox: 2, oy: m, w: 3, h: 3 },
      { ox: 0, oy: 2, w: 3, h: 3 },
      { ox: m, oy: 2, w: 3, h: 3 }
    ];
  }

  function gn7x7OuterCorner3x3Order() {
    const m = 4;
    return [
      { ox: 0, oy: 0, w: 3, h: 3 },
      { ox: m, oy: 0, w: 3, h: 3 },
      { ox: 0, oy: m, w: 3, h: 3 },
      { ox: m, oy: m, w: 3, h: 3 }
    ];
  }

  function gn7x7Inner5() {
    return { ox: 1, oy: 1, w: 5, h: 5 };
  }

  function gn7x7Outer7() {
    return { ox: 0, oy: 0, w: 7, h: 7 };
  }

  function gn7x7MorphMode() {
    if (typeof process !== "undefined" && process.env && process.env.GN_7X7_MORPH) {
      return String(process.env.GN_7X7_MORPH);
    }
    return "9patch";
  }

  function gn7x7PatchPhaseOrder() {
    const mode = gn7x7MorphMode();
    if (mode === "frames") {
      return [gn7x7Center3(), gn7x7Inner5(), gn7x7Outer7()];
    }
    if (mode === "corners-first") {
      return [gn7x7Center3(), ...gn7x7OuterCorner3x3Order(), ...gn7x7Side3x3Order()];
    }
    if (mode === "outer-first") {
      return [...gn7x7OuterCorner3x3Order(), gn7x7Center3(), ...gn7x7Side3x3Order()];
    }
    return [gn7x7Center3(), ...gn7x7Side3x3Order(), ...gn7x7OuterCorner3x3Order()];
  }

  function gn7x7Corner3x3Order() {
    return gn7x7PatchPhaseOrder();
  }

  function gn7x7IsCrossCell(x, y) {
    return x === 3 || y === 3;
  }

  function gn7x7AllCornersComplete(state) {
    return gnIsPatchComplete(state, gn7x7Center3());
  }

  function gn7x7PatchPlanComplete(state) {
    for (const phase of gn7x7PatchPhaseOrder()) {
      if (!gnIsPatchComplete(state, phase)) return false;
    }
    return true;
  }

  function gn7x7ActiveCornerRect(state) {
    for (const rect of gn7x7PatchPhaseOrder()) {
      if (!gnIsPatchComplete(state, rect)) return rect;
    }
    return null;
  }

  function gn7x7MoveInRect(move, rect) {
    return move.x >= rect.ox && move.x < rect.ox + rect.w
      && move.y >= rect.oy && move.y < rect.oy + rect.h;
  }

  /** 8x8 G=N: quattro quadranti 4x4 o 9 patch (centro 4x4 + lati/angoli 3x3). */
  function gn8x8Quad4Order() {
    return [
      { ox: 0, oy: 0, w: 4, h: 4 },
      { ox: 4, oy: 0, w: 4, h: 4 },
      { ox: 0, oy: 4, w: 4, h: 4 },
      { ox: 4, oy: 4, w: 4, h: 4 }
    ];
  }

  function gn8x8Center4() {
    return { ox: 2, oy: 2, w: 4, h: 4 };
  }

  function gn8x8Side3x3Order() {
    const m = 5;
    return [
      { ox: 2, oy: 0, w: 3, h: 3 },
      { ox: 2, oy: m, w: 3, h: 3 },
      { ox: 0, oy: 2, w: 3, h: 3 },
      { ox: m, oy: 2, w: 3, h: 3 }
    ];
  }

  function gn8x8OuterCorner3x3Order() {
    const m = 5;
    return [
      { ox: 0, oy: 0, w: 3, h: 3 },
      { ox: m, oy: 0, w: 3, h: 3 },
      { ox: 0, oy: m, w: 3, h: 3 },
      { ox: m, oy: m, w: 3, h: 3 }
    ];
  }

  function gn8x8Inner6() {
    return { ox: 1, oy: 1, w: 6, h: 6 };
  }

  function gn8x8Outer8() {
    return { ox: 0, oy: 0, w: 8, h: 8 };
  }

  function gn8x8MorphMode() {
    if (typeof process !== "undefined" && process.env && process.env.GN_8X8_MORPH) {
      return String(process.env.GN_8X8_MORPH);
    }
    return "4quad";
  }

  function gn8x8PatchPhaseOrder() {
    const mode = gn8x8MorphMode();
    if (mode === "9patch") {
      return [gn8x8Center4(), ...gn8x8Side3x3Order(), ...gn8x8OuterCorner3x3Order()];
    }
    if (mode === "frames") {
      return [gn8x8Center4(), gn8x8Inner6(), gn8x8Outer8()];
    }
    if (mode === "corners-first") {
      return [gn8x8Center4(), ...gn8x8OuterCorner3x3Order(), ...gn8x8Side3x3Order()];
    }
    if (mode === "outer-first") {
      return [...gn8x8OuterCorner3x3Order(), gn8x8Center4(), ...gn8x8Side3x3Order()];
    }
    if (mode === "phased") {
      return null;
    }
    return gn8x8Quad4Order();
  }

  function gn8x8PatchPlanComplete(state) {
    const phases = gn8x8PatchPhaseOrder();
    if (!phases) return true;
    for (const phase of phases) {
      if (!gnIsPatchComplete(state, phase)) return false;
    }
    return true;
  }

  function gn8x8ActivePatchRect(state) {
    const phases = gn8x8PatchPhaseOrder();
    if (!phases) return null;
    for (const rect of phases) {
      if (!gnIsPatchComplete(state, rect)) return rect;
    }
    return null;
  }

  function gn8x8MoveInRect(move, rect) {
    return gn7x7MoveInRect(move, rect);
  }

  function gn8x8PatchPlanPending(state) {
    if (state.size !== 8 || gn8x8PatchPhaseOrder() == null) return false;
    if (gnEmptyCellsInIdealGrid(state) <= 4) return false;
    return !gn8x8PatchPlanComplete(state);
  }

  /** 8x8: morfologia da gn8x8PatchPhaseOrder (default 4 quadranti 4x4). */
  function gnSelectBestPatchGoal8x8(state) {
    const size = state.size;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty <= gnEndgameExactThreshold(size) && gn8x8PatchPlanComplete(state)) {
      state._gnPlannerPatchGoal = null;
      return null;
    }

    if (gn8x8MorphMode() === "phased") {
      return gnSelectBestPatchGoalPhased(state);
    }

    const active = state._gnPlannerPatchGoal;
    if (active && !gnIsPatchComplete(state, active)
      && gnScorePatchGoal(state, active) > -Infinity) {
      return active;
    }

    for (const phase of gn8x8PatchPhaseOrder()) {
      if (!gnIsPatchComplete(state, phase)) {
        state._gnPlannerPatchGoal = phase;
        return phase;
      }
    }

    state._gnPlannerPatchGoal = null;
    return null;
  }

  function gn5x5Secondary3x3Candidates() {
    return gnSecondary3x3Candidates(5);
  }

  /** Celle vuote sotto cui il 5x5 passa al DFS esatto (chiusura). */
  function gn5x5EndgameEmptyThreshold() {
    return gnEndgameExactThreshold(5);
  }

  /** 7x7: morfologia da gn7x7PatchPhaseOrder (default 9 patch 3x3). */
  function gnSelectBestPatchGoal7x7(state) {
    const size = state.size;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty <= gnEndgameExactThreshold(size) && gn7x7PatchPlanComplete(state)) {
      state._gnPlannerPatchGoal = null;
      return null;
    }

    if (gn7x7MorphMode() === "phased") {
      return gnSelectBestPatchGoalPhased(state);
    }

    const active = state._gnPlannerPatchGoal;
    if (active && !gnIsPatchComplete(state, active)
      && gnScorePatchGoal(state, active) > -Infinity) {
      return active;
    }

    for (const phase of gn7x7PatchPhaseOrder()) {
      if (!gnIsPatchComplete(state, phase)) {
        state._gnPlannerPatchGoal = phase;
        return phase;
      }
    }

    state._gnPlannerPatchGoal = null;
    return null;
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
    const cornersPending = (state.size === 7 && !gn7x7PatchPlanComplete(state))
      || gn8x8PatchPlanPending(state);
    if (gnEmptyCellsInIdealGrid(state) <= gnEndgameExactThreshold(state.size) && !cornersPending) {
      return false;
    }
    if (state.size >= 6 && gnIsCriticalPosition(state) && !cornersPending) return false;
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
    if (state.size === 7 && state.board.length === 0 && rect.w === 3
      && rect.ox === 2 && rect.oy === 2) {
      score += 95;
    }
    if (state.size === 8 && state.board.length === 0 && rect.w === 4
      && rect.ox === 2 && rect.oy === 2) {
      score += 95;
    }
    if (state.size === 8 && state.board.length === 0 && rect.w === 4
      && rect.ox === 0 && rect.oy === 0 && gn8x8MorphMode() === "4quad") {
      score += 90;
    }
    if (state.size >= 5 && rect.w === 3 && gnIsPatchComplete(state, gn5x5Corner3())) {
      score += state.size >= 6 ? 28 : 35;
    }
    if (state.size === 7 && rect.w === 3) {
      const phases = gn7x7PatchPhaseOrder();
      const idx = phases.findIndex(r => r.ox === rect.ox && r.oy === rect.oy);
      if (idx >= 0) score += (phases.length - idx) * 5;
      if (idx > 0 && !gnIsPatchComplete(state, phases[idx - 1])) score -= 70;
    }
    if (state.size === 8 && gn8x8MorphMode() !== "phased") {
      const phases = gn8x8PatchPhaseOrder();
      if (phases) {
        const idx = phases.findIndex(r => r.ox === rect.ox && r.oy === rect.oy && r.w === rect.w);
        if (idx >= 0) score += (phases.length - idx) * 5;
        if (idx > 0 && !gnIsPatchComplete(state, phases[idx - 1])) score -= 70;
      }
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
    if (state.size === 7) return gnSelectBestPatchGoal7x7(state);
    if (state.size === 8) return gnSelectBestPatchGoal8x8(state);
    return gnSelectBestPatchGoalPhased(state);
  }

  function gnPatchMoveScore(state, playerId, move, rect, morph) {
    const map = boardMap(state.board);
    if (map.has(coordKey(move.x, move.y))) return -Infinity;
    const inPatch = move.x >= rect.ox && move.x < rect.ox + rect.w
      && move.y >= rect.oy && move.y < rect.oy + rect.h;
    if (!inPatch) {
      if ((state.size === 7 && !gn7x7PatchPlanComplete(state))
        || gn8x8PatchPlanPending(state)) {
        return gnGlobalMoveScore(state, playerId, move) * 0.12;
      }
      return gnGlobalMoveScore(state, playerId, move) * 0.25;
    }
    let score = 600;
    const cardMorph = morph.cardMorph(move.card);
    const degree = gnPatchLocalDegree(rect, move.x, move.y);
    if (degree <= 2) score += cardMorph.rigidity * 30;
    else score += cardMorph.flexibility * 0.4;
    score += gnMorphMoveScore(morph, state, move) * 0.18;
    score += gnIdealLayoutMoveScore(state, move) * 0.25;
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

  function gn7x7UnlockedCrossSpineCells(state) {
    return [];
  }

  function gnTry7x7CrossSpineAction(state, playerId) {
    return null;
  }

  function gnTry7x7CrossMarginAction(state, playerId) {
    return null;
  }

  function gnRepick7x7FromCandidatesRollout(state, playerId, candidates, rolloutKey) {
    const botCap = 85;
    let best = candidates[0];
    let bestFill = -1;
    let bestRank = -Infinity;
    for (const cand of candidates) {
      const fill = gnRollout7x7BotFill(
        state, playerId, cand, rolloutKey + ":" + cand.card.uid, botCap, true
      );
      if (fill < 0) continue;
      const rank = gnMoveRank(state, playerId, cand, { useMorphology: true });
      if (fill > bestFill || (fill === bestFill && rank > bestRank)) {
        bestFill = fill;
        bestRank = rank;
        best = cand;
      }
    }
    return bestFill < 0 ? candidates[0] : best;
  }

  function gnRepick7x7ForcedVsPatch(state, playerId, forced, patchMove) {
    const empty = gnEmptyCellsInIdealGrid(state);
    const patchRank = gnMoveRank(state, playerId, patchMove, { useMorphology: true });
    const forcedRank = gnMoveRank(state, playerId, forced, { useMorphology: true });
    if (empty >= 22 && empty <= 24) {
      if (patchRank > forcedRank + 14) return patchMove;
      return forced;
    }
    if (typeof process !== "undefined" && process.env && process.env.GN_SKIP_ROLLOUT7) return forced;
    if (forced.x === patchMove.x && forced.y === patchMove.y
      && forced.card.uid === patchMove.card.uid) {
      return forced;
    }
    if (empty < 20 || empty > 30) return forced;
    const seen = new Set();
    const candidates = [];
    const push = m => {
      const k = m.x + "," + m.y + ":" + m.card.uid;
      if (seen.has(k)) return;
      seen.add(k);
      candidates.push(m);
    };
    push(forced);
    push(patchMove);
    const requirement = placementRequirement(state);
    const safe = legalPlacements(state, playerId, requirement)
      .filter(m => !gnMoveBreaksIdealFillPlan(state, playerId, m));
    for (const alt of safe) {
      if (alt.x === patchMove.x && alt.y === patchMove.y) push(alt);
    }
    return gnRepick7x7FromCandidatesRollout(
      state, playerId, candidates,
      "gn-forced-patch:" + state.board.length + ":" + playerId
    );
  }

  /** 7x7 midgame: se patch e globale divergono, rollout deterministico su poche candidate. */
  function gnRepick7x7MidgameCandidatesRollout(state, playerId, pick) {
    if (typeof process !== "undefined" && process.env && process.env.GN_SKIP_ROLLOUT7) return pick;
    if (!pick || state.size !== 7 || state._gnInRollout7) return pick;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty < 21 || empty > 30 || state.board.length > 27) return pick;

    const requirement = placementRequirement(state);
    const safe = legalPlacements(state, playerId, requirement)
      .filter(m => !gnMoveBreaksIdealFillPlan(state, playerId, m));
    if (safe.length < 6) return pick;

    const ranked = safe
      .map(m => ({ move: m, score: gnMoveRank(state, playerId, m, { useMorphology: true }) }))
      .sort((a, b) => b.score - a.score);
    const globalBest = ranked[0].move;
    const pickRank = gnMoveRank(state, playerId, pick, { useMorphology: true });
    const rect = state._gnPlannerPatchGoal || gn7x7ActiveCornerRect(state);
    const pickInPatch = rect && gn7x7MoveInRect(pick, rect);
    const globalInPatch = rect && gn7x7MoveInRect(globalBest, rect);
    if (pickInPatch && globalInPatch) return pick;
    if (globalBest.x === pick.x && globalBest.y === pick.y
      && globalBest.card.uid === pick.card.uid) {
      return pick;
    }
    if (ranked[0].score - pickRank < 10) return pick;

    const seen = new Set();
    const candidates = [];
    const push = m => {
      const k = m.x + "," + m.y + ":" + m.card.uid;
      if (seen.has(k)) return;
      seen.add(k);
      candidates.push(m);
    };
    push(pick);
    push(globalBest);
    for (const alt of safe) {
      if (alt.x === globalBest.x && alt.y === globalBest.y) push(alt);
    }

    return gnRepick7x7FromCandidatesRollout(
      state, playerId, candidates, "gn-mid7:" + state.board.length + ":" + playerId
    );
  }

  /** 8x8 midgame: rollout tra patch e globale quando divergono (come 7x7). */
  function gnRepick8x8MidgameCandidatesRollout(state, playerId, pick) {
    if (typeof process !== "undefined" && process.env && process.env.GN_SKIP_ROLLOUT7) return pick;
    if (!pick || state.size !== 8 || state._gnInRollout7) return pick;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty < 15 || empty > 35 || state.board.length > 50) return pick;

    const requirement = placementRequirement(state);
    const safe = legalPlacements(state, playerId, requirement)
      .filter(m => !gnMoveBreaksIdealFillPlan(state, playerId, m));
    if (safe.length < 4) return pick;

    const ranked = safe
      .map(m => ({ move: m, score: gnMoveRank(state, playerId, m, { useMorphology: true }) }))
      .sort((a, b) => b.score - a.score);
    const globalBest = ranked[0].move;
    const pickRank = gnMoveRank(state, playerId, pick, { useMorphology: true });
    const rect = state._gnPlannerPatchGoal || gn8x8ActivePatchRect(state);
    const pickInPatch = rect && gn8x8MoveInRect(pick, rect);
    const globalInPatch = rect && gn8x8MoveInRect(globalBest, rect);
    if (pickInPatch && globalInPatch) return pick;
    if (globalBest.x === pick.x && globalBest.y === pick.y
      && globalBest.card.uid === pick.card.uid) {
      return pick;
    }
    if (ranked[0].score - pickRank < 8) return pick;

    const seen = new Set();
    const candidates = [];
    const push = m => {
      const k = m.x + "," + m.y + ":" + m.card.uid;
      if (seen.has(k)) return;
      seen.add(k);
      candidates.push(m);
    };
    push(pick);
    push(globalBest);
    for (const alt of safe) {
      if (alt.x === globalBest.x && alt.y === globalBest.y) push(alt);
    }

    return gnRepick7x7FromCandidatesRollout(
      state, playerId, candidates, "gn-mid8:" + state.board.length + ":" + playerId
    );
  }

  function gnSafeIdealMovesForPlayer(state, playerId) {
    const requirement = placementRequirement(state);
    let candidates = legalPlacements(state, playerId, requirement);
    candidates = gnFilterIdealGridMoves(state, candidates);
    candidates = gnPruneFatalMoves(state, playerId, candidates);
    return candidates.filter(m => !gnMoveBreaksIdealFillPlan(state, playerId, m));
  }

  /** 8x8: rollout deterministico tra mosse safe (sceglie max fill bot). */
  function gnRepick8x8SafeByRollout(state, playerId, pool, keyPrefix) {
    if (state.size !== 8 || pool.length <= 1 || state._gnInRollout7) return pool[0];
    let best = pool[0];
    let bestFill = -1;
    for (const cand of pool.slice(0, 8)) {
      const fill = gnRollout7x7BotFill(
        state, playerId, cand,
        keyPrefix + ":" + cand.x + "," + cand.y + ":" + cand.card.uid,
        100, true
      );
      if (fill > bestFill) {
        bestFill = fill;
        best = cand;
      }
    }
    return best;
  }

  /** Ripesca tra mosse safe se la proposta rompe il matching ideale. */
  function gnRepickGlobalMoveIfBreaksMatching(state, playerId, move, rect) {
    if (!move || !isDurissimaGnIdeal(state)) return move;
    if (!gnMoveBreaksIdealFillPlan(state, playerId, move)) return move;

    const safe = gnSafeIdealMovesForPlayer(state, playerId);
    if (!safe.length) return move;

    let pool = safe;
    if (rect && state.size !== 8) {
      const inPatch = safe.filter(m => m.x >= rect.ox && m.x < rect.ox + rect.w
        && m.y >= rect.oy && m.y < rect.oy + rect.h);
      if (inPatch.length) pool = inPatch;
    }

    if (state.size === 8 && pool.length > 1) {
      const empty = gnEmptyCellsInIdealGrid(state);
      if (empty >= 15 && empty <= 32) {
        return gnRepick8x8SafeByRollout(
          state, playerId, pool, "gn-8-safe:" + state.board.length + ":" + playerId
        );
      }
    }

    if (rect) {
      const morph = gnMorphologyForSize(state.size);
      pool.sort((a, b) => gnPatchMoveScore(state, playerId, b, rect, morph)
        - gnPatchMoveScore(state, playerId, a, rect, morph));
    } else {
      pool.sort((a, b) => gnMoveRank(state, playerId, b, { useMorphology: true })
        - gnMoveRank(state, playerId, a, { useMorphology: true }));
    }
    return pool[0];
  }

  /** Se il solver patch propone una mossa BREAK, ripesca tra le safe (stessa patch se possibile). */
  function gnRepickPatchMoveIfBreaksMatching(state, playerId, move, rect) {
    return gnRepickGlobalMoveIfBreaksMatching(state, playerId, move, rect);
  }

  function gnTryPatchGuidedAction(state, playerId) {
    if (!gnUsePatchFirstStrategy(state)) return null;
    const rect = gnSelectBestPatchGoal(state);
    if (!rect) return null;

    const patchAction = solveGnPatchBestAction(state, rect);
    if (patchAction) {
      if (patchAction.type === "move" && patchAction.move) {
        let move = gnRepickPatchMoveIfBreaksMatching(state, playerId, patchAction.move, rect);
        if (state.size === 7) {
          const repick = gnRepick7x7MidgameCandidatesRollout(state, playerId, move);
          if (repick !== move) move = repick;
        }
        if (state.size === 8) {
          const repick = gnRepick8x8MidgameCandidatesRollout(state, playerId, move);
          if (repick !== move) move = repick;
        }
        return { type: "move", move };
      }
      return patchAction;
    }

    const requirement = placementRequirement(state);
    let moves = legalPlacements(state, playerId, requirement);
    moves = gnFilterIdealGridMoves(state, moves);
    moves = gnPruneFatalMoves(state, playerId, moves);
    const pruned = gnPruneUnfillableIdealMoves(state, playerId, moves);
    if (pruned.length) moves = pruned;
    if (!moves.length) return null;

    const morph = gnMorphologyForSize(state.size);
    const ranked = moves
      .map(move => ({ move, score: gnPatchMoveScore(state, playerId, move, rect, morph) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length || ranked[0].score < -50000) return null;
    let pick = gnRepickSameCardPreferCross7x7(state, playerId, ranked[0].move);
    pick = gnRepickPatchMoveIfBreaksMatching(state, playerId, pick, rect);
    if (state.size === 7) {
      pick = gnRepick7x7MidgameCandidatesRollout(state, playerId, pick);
    }
    if (state.size === 8) {
      pick = gnRepick8x8MidgameCandidatesRollout(state, playerId, pick);
    }
    return { type: "move", move: pick };
  }

  /**
   * Coppia sicura stessa cella, rank locale ravvicinato: preferisci la seconda
   * (evita overfit euristico globale su scelte equivalenti in apertura media).
   */
  function gnTrySameCellAmbiguousPairMove(state, playerId, topMove) {
    if (!topMove || !isDurissimaGnIdeal(state) || state.turnPlayed === 0) return null;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty < 18 || empty > 24 || state.board.length > 17) return null;
    const requirement = placementRequirement(state);
    const safe = legalPlacements(state, playerId, requirement)
      .filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
    const pair = safe.filter(move => move.x === topMove.x && move.y === topMove.y);
    if (pair.length !== 2) return null;
    const ranked = pair
      .map(move => ({ move, score: gnMoveRank(state, playerId, move, { useMorphology: true }) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0].score - ranked[1].score < 2.5) return ranked[1].move;
    return null;
  }

  function gnRepickSameCardPreferCross7x7(state, playerId, move) {
    if (!move || state.size !== 7 || !isDurissimaGnIdeal(state)) return move;
    if (gn7x7PatchPlanComplete(state)) return move;
    const active = state._gnPlannerPatchGoal || gn7x7ActiveCornerRect(state);
    if (!active) return move;
    const requirement = placementRequirement(state);
    const safe = legalPlacements(state, playerId, requirement)
      .filter(m => !gnMoveBreaksIdealFillPlan(state, playerId, m));
    const group = safe.filter(m => m.card.uid === move.card.uid);
    if (group.length < 2) return move;
    const inPhase = group.filter(m => gn7x7MoveInRect(m, active));
    const outPhase = group.filter(m => !gn7x7MoveInRect(m, active));
    if (!inPhase.length || !outPhase.length) return move;
    if (gn7x7MoveInRect(move, active)) return move;
    inPhase.sort((a, b) => {
      const pa = gnPoolOptionsForCell(state, a.x, a.y);
      const pb = gnPoolOptionsForCell(state, b.x, b.y);
      if (pa !== pb) return pa - pb;
      return gnMoveRank(state, playerId, a, {}) - gnMoveRank(state, playerId, b, {});
    });
    return inPhase[0];
  }

  const gnRollout7x7Cache = new Map();
  const gnRollout7x7CacheMax = 4096;

  function gnRollout7x7BoardKey(state, playerId, cand) {
    const cells = state.board.map(e => e.x + "," + e.y + ":" + e.card.uid).sort().join("|");
    return state.board.length + ";" + playerId + ";" + state.turnPlayed + ";" + cells
      + ";" + cand.x + "," + cand.y + ";" + cand.card.uid;
  }

  function gnRollout7x7BotFill(state, playerId, cand, rolloutKey, botCap, deterministic) {
    const cacheKey = gnRollout7x7BoardKey(state, playerId, cand)
      + (deterministic ? ":det" : "");
    if (gnRollout7x7Cache.has(cacheKey)) return gnRollout7x7Cache.get(cacheKey);

    const strategies = Array.from({ length: state.players }, () => "durissima-global-planner");
    const fork = gnForkSearchState(state);
    fork._gnInRollout7 = true;
    if (state._gnPlannerPatchGoal) {
      fork._gnPlannerPatchGoal = { ...state._gnPlannerPatchGoal };
    }
    const frame = gnApplyPlacementInPlace(fork, playerId, cand);
    if (!frame) return -1;
    if (fork.turnPlayed >= 5) endTurn(fork);
    const random = deterministic
      ? () => 0
      : mulberry32(hashSeed(rolloutKey + ":" + cand.card.uid));
    let n = 0;
    while (fork.status === "playing" && n++ < botCap) {
      botStep(fork, strategies, random);
    }
    const fill = fork.board.length;
    if (gnRollout7x7Cache.size >= gnRollout7x7CacheMax) {
      const drop = gnRollout7x7Cache.keys().next().value;
      gnRollout7x7Cache.delete(drop);
    }
    gnRollout7x7Cache.set(cacheKey, fill);
    return fill;
  }

  function gnRepickSameCellCrossPairRollout7x7(state, playerId, move) {
    if (typeof process !== "undefined" && process.env && process.env.GN_SKIP_ROLLOUT7) return move;
    if (!move || state.size !== 7 || !isDurissimaGnIdeal(state)) return move;
    if (state._gnInRollout7) return move;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty < 18 || empty > 38 || state.board.length > 28) return move;

    const requirement = placementRequirement(state);
    const safe = legalPlacements(state, playerId, requirement)
      .filter(m => !gnMoveBreaksIdealFillPlan(state, playerId, m));
    const pair = safe.filter(m => m.x === move.x && m.y === move.y);
    if (pair.length !== 2) return move;

    const rolloutKey = "gn-rollout7:"
      + state.board.length + ":" + playerId + ":" + move.x + "," + move.y;
    const botCap = 80;
    let best = move;
    let bestFill = -1;
    let bestRank = -Infinity;
    for (const cand of pair) {
      const fill = gnRollout7x7BotFill(state, playerId, cand, rolloutKey, botCap);
      if (fill < 0) continue;
      const rank = gnMoveRank(state, playerId, cand, { useMorphology: true });
      if (fill > bestFill || (fill === bestFill && rank > bestRank)) {
        bestFill = fill;
        bestRank = rank;
        best = cand;
      }
    }
    return bestFill < 0 ? move : best;
  }

  /** Stessa carta, piu celle sicure: unica opzione su ultima riga ideale. */
  function gnRepickSameCardSingleBottomRow(state, playerId, move) {
    if (!move || !isDurissimaGnIdeal(state) || state.turnPlayed !== 0) return move;
    const empty = gnEmptyCellsInIdealGrid(state);
    if (empty < 12 || empty > 20) return move;
    const edge = state.size - 1;
    const requirement = placementRequirement(state);
    const safe = legalPlacements(state, playerId, requirement)
      .filter(m => !gnMoveBreaksIdealFillPlan(state, playerId, m));
    const group = safe.filter(m => m.card.uid === move.card.uid);
    if (group.length < 2) return move;
    const bottom = group.filter(m => m.y === edge && m.x === edge - 1);
    if (bottom.length !== 1 || move.y === edge) return move;
    return bottom[0];
  }

  function gnFinalizeGlobalMoveAction(state, playerId, action) {
    if (!action || action.type !== "move" || !action.move) return action;
    // Durante follow strict di una seq precomputata per perfect GN, non ripichiamo la mossa:
    // la mente ha scelto l'ordine e la cella esatta una volta; finalize altererebbe il piano.
    if (state && state._gnFullSequence) {
      const seq = state._gnFullSequence;
      const hasCards = seq.length > 0 && seq[0].card !== undefined;
      if (!hasCards) return action;
      const m = action.move;
      for (let i = 0; i < seq.length; i++) {
        const step = seq[i];
        if (state.board.some(b => b.x === step.x && b.y === step.y)) continue; // already done
        if (m.x === step.x && m.y === step.y && m.card && step.card && m.card.uid === step.card.uid) {
          return action;
        }
      }
    }
    const patchRect = gnSelectBestPatchGoal(state);
    let repick = gnRepickGlobalMoveIfBreaksMatching(state, playerId, action.move, patchRect);
    repick = gnRepickSameCardSingleBottomRow(state, playerId, repick);
    repick = gnRepickSameCellCrossPairRollout7x7(state, playerId, repick);
    if (repick.x === action.move.x && repick.y === action.move.y
      && repick.card.uid === action.move.card.uid) {
      return action;
    }
    return { type: "move", move: repick };
  }

  function chooseDurissimaGlobalBestHeuristicMove(state, playerId) {
    const ctx = gnSearchContextForState(state);
    const branchLimit = gnAdaptiveBranchLimit(state, ctx.branchLimit);
    const moves = gnSolverMoveList(state, playerId, branchLimit, {
      useMorphology: true,
      useGlobalHeuristic: true
    });
    if (!moves.length) return null;
    const ambiguous = gnTrySameCellAmbiguousPairMove(state, playerId, moves[0]);
    if (ambiguous) return ambiguous;
    return moves[0];
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
    const relayCandidates = [];
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
          relayCandidates.push(move);
        }
      }
    }
    if (!relayCandidates.length) return null;
    const safeRelay = relayCandidates.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
    if (safeRelay.length) return safeRelay[0];
    const safeAny = moves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
    if (safeAny.length) return null;
    return relayCandidates[0];
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
      if (gnMoveBreaksIdealFillPlan(state, playerId, rm)) {
        const safeAny = moves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
        if (safeAny.length) return null;
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
    if (!reserved.length) return null;
    if (reserved.length === 1) {
      const rm = reserved[0];
      if (!gnMoveBreaksIdealFillPlan(state, playerId, rm)) return null;
      const reservations = gnCardReservations(state);
      const cellKey = coordKey(rm.x, rm.y);
      const bypass = moves.filter(move => {
        if (coordKey(move.x, move.y) !== cellKey) return false;
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
        if (state.turnPlayed === 0 && gnMoveBreaksIdealFillPlan(state, playerId, reserved[0])) {
          const safe = moves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
          const bypass = gnPickReservedCellBypassMove(state, playerId, reserved, safe);
          if (bypass) return bypass;
          if (safe.length) return null;
        }
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
    if (!isDurissimaGnIdeal(state)) return null;
    const emptyCells = gnEmptyCellsInIdealGrid(state);
    if (emptyCells > gnEndgameExactThreshold(state.size)) return null;
    const turnStart = state.turnPlayed === 0;
    const lastCells = (state.size === 7 && emptyCells <= 8)
      || (state.size === 8 && emptyCells <= 4);
    if (!turnStart && !lastCells) return null;
    state._gnPlannerPatchGoal = null;
    if (state.size <= 5 || (state.size === 6 && emptyCells <= 8)
      || (state.size === 7 && emptyCells <= 12)
      || (state.size === 8 && emptyCells <= 4)) {
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
      const useExact = (state.size === 6 && empty <= 8)
        || (state.size === 7 && empty <= 10)
        || (state.size === 8 && empty <= 4);
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
          if (!solverBreaks && gnReservedMacroStepViable(state, playerId, exact.move)) {
            return { type: "move", move: exact.move };
          }
        }
      }
    }
    const relay = gnTrySharedEdgeRelayMove(state, playerId);
    return relay ? { type: "move", move: relay } : null;
  }

  /** Carica solver/oracolo in Node (require) o in browser (globalThis). */
  function dmRequireModule(modulePath) {
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    if (modulePath.indexOf("durissima-matrix-solver") >= 0 && g.DurissimaMatrixSolver) {
      return g.DurissimaMatrixSolver;
    }
    if (modulePath.indexOf("durissima-gn-decoupled-oracle") >= 0 && g.DurissimaGnDecoupledOracle) {
      return g.DurissimaGnDecoupledOracle;
    }
    if (typeof require !== "undefined") return require(modulePath);
    return null;
  }

  /**
   * Durissima coop: un solo pianificatore per la squadra (carte scoperte).
   * I G giocatori sono solo vincoli di proprieta' sulla carta da posare.
   */
  function gnUseCoordinatedTeamPlanner(state) {
    if (typeof process !== "undefined" && process.env && process.env.GN_LEGACY_PER_PLAYER === "1") {
      return false;
    }
    if (!isDurissimaMater(state) || state.players <= 1) return false;
    if (durissimaUsesCompetitiveDraw(state)) return false;
    if (isDurissimaScartiNReshuffle(state)) return false;
    return true;
  }

  /** Durissima solitario G=1: pool noto (mano + tallone), pesca dopo posata, no pass. */
  function gnUseCoordinatedSoloPlanner(state) {
    if (typeof process !== "undefined" && process.env && process.env.GN_LEGACY_PER_PLAYER === "1") {
      return false;
    }
    if (!isDurissimaMater(state) || state.players !== 1) return false;
    if (durissimaUsesCompetitiveDraw(state)) return false;
    if (isDurissimaScartiNReshuffle(state)) return false;
    return true;
  }

  /** Coordinatore una mente: coop G>=2 oppure solitario G=1 (senza reshuffle competitivo). */
  function gnUseCoordinatedDurissimaPlanner(state) {
    return gnUseCoordinatedTeamPlanner(state) || gnUseCoordinatedSoloPlanner(state);
  }

  /**
   * Solo "virtual multi": stesso regime di pianificazione del coop undercrowded
   * (partial, prefisso owned = tutta la mano, follow 1 carta/stop).
   * Default prodotto: ON solo se size >= 6 (su 3–5 regrediva vs path solo fullKnown).
   * Override: durissimaSoloVirtualMulti true/false esplicito.
   */
  function isDurissimaSoloVirtualMulti(state) {
    return (
      isDurissimaMater(state) &&
      (state.players || 1) === 1 &&
      state.durissimaSoloVirtualMulti === true
    );
  }

  /** Carta giocabile ora (mano, riserva o free cell) per uid. */
  function gnFindPlayableForUid(state, playerId, uid) {
    if (!uid) return null;
    const hand = state.hands[playerId] || [];
    const inHand = hand.find(c => c.uid === uid);
    if (inHand) return { card: inHand, fromReserve: false, fromFreeCell: false };
    if (isDurissimaReserveEnabled(state) && state.durissimaReserve) {
      const inRes = state.durissimaReserve.find(c => c.uid === uid);
      if (inRes) return { card: inRes, fromReserve: true, fromFreeCell: false };
    }
    if (isDurissimaFreeCellsEnabled(state)) {
      for (let i = 0; i < state.durissimaFreeCells.length; i++) {
        const c = state.durissimaFreeCells[i];
        if (c && c.uid === uid) {
          return { card: c, fromReserve: false, fromFreeCell: true, freeCellIndex: i };
        }
      }
    }
    return null;
  }

  /** True se la carta e' ancora da qualche parte giocabile/pescabile. */
  function gnCardStillSomewhere(state, uid) {
    if (gnFindPlayableForUid(state, state.currentPlayer != null ? state.currentPlayer : 0, uid)) return true;
    for (let p = 0; p < (state.hands || []).length; p++) {
      if ((state.hands[p] || []).some(c => c.uid === uid)) return true;
    }
    if (state.durissimaReserve && state.durissimaReserve.some(c => c.uid === uid)) return true;
    if (isDurissimaFreeCellsEnabled(state)) {
      for (const c of state.durissimaFreeCells) {
        if (c && c.uid === uid) return true;
      }
    }
    if ((state.drawPile || []).some(c => c.uid === uid)) return true;
    return false;
  }

  function gnBoardHasCell(state, x, y) {
    return state.board.some(entry => entry.x === x && entry.y === y);
  }

  /**
   * Solitario equo: carte in mano + riserva + free cell (giocabili ora). Non include il tallone.
   */
  function gnSoloOwnedPlayableCards(state) {
    const out = [];
    const hand = (state.hands && state.hands[0]) || [];
    for (const c of hand) out.push(c);
    if (isDurissimaReserveEnabled(state) && state.durissimaReserve) {
      for (const c of state.durissimaReserve) out.push(c);
    }
    if (isDurissimaFreeCellsEnabled(state)) {
      for (const c of state.durissimaFreeCells) {
        if (c) out.push(c);
      }
    }
    return out;
  }

  /**
   * Solitario equo: multiset delle carte ancora nel tallone (insieme noto per esclusione).
   * L'ORDINE dell'array non deve guidare decisioni — solo membership/conteggi.
   */
  function gnSoloTalloneMultiset(state) {
    const owned = new Set(gnSoloOwnedPlayableCards(state).map(c => c.uid));
    const boardUids = new Set((state.board || []).map(b => b.card && b.card.uid).filter(Boolean));
    const multi = [];
    for (const c of state.drawPile || []) {
      if (!owned.has(c.uid) && !boardUids.has(c.uid)) multi.push(c);
    }
    return multi;
  }

  /**
   * Statistiche del multiset residuo (mano+tallone+non ancora usate): validi per ogni N.
   * Su 8x8 valore/colore/forma hanno la stessa distribuzione marginale (1,3,...,15):
   * la rigidita' vera e' negli INCROCI (asso-cerchi-bianco = unici su 2 assi;
   * un 8 rosso e' scarso sul colore ma fungibile sul valore/forma abbondanti).
   */
  function gnSoloBuildResidStats(cards) {
    const byV = {};
    const byS = {};
    const byC = {};
    let n = 0;
    for (const c of cards || []) {
      if (!c) continue;
      n++;
      const v = c.value;
      const s = c.shape;
      const col = c.color;
      byV[v] = (byV[v] || 0) + 1;
      byS[s] = (byS[s] || 0) + 1;
      byC[col] = (byC[col] || 0) + 1;
    }
    let maxV = 1;
    let maxS = 1;
    let maxC = 1;
    Object.keys(byV).forEach(k => {
      if (byV[k] > maxV) maxV = byV[k];
    });
    Object.keys(byS).forEach(k => {
      if (byS[k] > maxS) maxS = byS[k];
    });
    Object.keys(byC).forEach(k => {
      if (byC[k] > maxC) maxC = byC[k];
    });
    return { byV, byS, byC, maxV, maxS, maxC, n };
  }

  /** Profilo assi di una carta nel residuo (scarsita' / fungibilita' / colli di bottiglia). */
  function gnSoloCardAxisProfile(card, stats) {
    if (!card || !stats) {
      return {
        scarceAxes: 0,
        multiUnique: false,
        bottleneck: 1,
        flex: 0.5,
        rigid: 0.5,
        relV: 1,
        relS: 1,
        relC: 1,
        cv: 1,
        cs: 1,
        cc: 1
      };
    }
    const cv = stats.byV[card.value] || 1;
    const cs = stats.byS[card.shape] || 1;
    const cc = stats.byC[card.color] || 1;
    const scarceAxes = (cv === 1 ? 1 : 0) + (cs === 1 ? 1 : 0) + (cc === 1 ? 1 : 0);
    const relV = cv / Math.max(1, stats.maxV);
    const relS = cs / Math.max(1, stats.maxS);
    const relC = cc / Math.max(1, stats.maxC);
    const bottleneck = Math.min(relV, relS, relC);
    // Fungibilita' primaria sul valore (i N si scambiano); pesata con media assi
    const valShare = (cv - 1) / Math.max(1, stats.maxV - 1);
    const flex = valShare * 0.55 + ((relV + relS + relC) / 3) * 0.45;
    // Rigidita' da INCROCI, non solo da un asse scarso:
    // - multiUnique (asso+cerchi): rigidissima
    // - unico valore (asso): molto rigida
    // - unico colore ma valore abbondante (8 rosso su 8x8): moderata (ancora fungibile come 8)
    let rigid;
    if (scarceAxes >= 2 || cv === 1) {
      rigid = 0.55 + scarceAxes * 0.25 + (1 - bottleneck) * 0.2;
    } else if (scarceAxes === 1) {
      rigid = 0.15 + (1 - bottleneck) * 0.25 * (1 - valShare);
    } else {
      rigid = (1 - flex) * 0.35;
    }
    return {
      scarceAxes,
      multiUnique: scarceAxes >= 2,
      bottleneck,
      flex,
      rigid,
      relV,
      relS,
      relC,
      cv,
      cs,
      cc
    };
  }

  /** Grado geometrico cella su griglia fissa 0..N-1 (2 angolo, 3 bordo, 4 interno). */
  function gnSoloCellGeoDegree(x, y, size) {
    let d = 0;
    if (x > 0) d++;
    if (x < size - 1) d++;
    if (y > 0) d++;
    if (y < size - 1) d++;
    return d;
  }

  /**
   * Fase early solitario: i primi ~30% delle posate (cap 5..20).
   * Qui si condanna spesso la partita (errori topologici irreversibili),
   * NON la frazione mano/mazzo (smentita: 4x4=25% ok, 8x8 con mano 16=25% no).
   */
  function gnSoloIsEarlyPhase(boardLen, size) {
    const total = size * size;
    const thr = Math.min(20, Math.max(5, Math.floor(total * 0.3)));
    return (boardLen || 0) < thr;
  }

  function gnSoloProfileIsHard(prof) {
    if (!prof) return false;
    // Multi-unico (asso-cerchi-bianco) o 2+ assi unici
    if (prof.multiUnique === true || prof.scarceAxes >= 2) return true;
    // Unico su un asse (asso; unico rosso; unica forma scarsa): va su basso grado
    if (prof.cv === 1 || prof.cs === 1 || prof.cc === 1) return true;
    if (prof.scarceAxes === 1 && prof.rigid >= 0.5) return true;
    return prof.rigid >= 0.75;
  }

  /** Quanti pezzi hard restano nel residuo (escluso excludeUid). */
  function gnSoloCountHardInResid(cards, residStats, excludeUid) {
    let n = 0;
    for (const c of cards || []) {
      if (!c || c.uid === excludeUid) continue;
      if (gnSoloProfileIsHard(gnSoloCardAxisProfile(c, residStats))) n++;
    }
    return n;
  }

  /**
   * Score early-game (additivo) per una posa.
   *
   * Principi (2026-07-17, corretti dopo controprova utente):
   * 1) Non e' "mano = 1/N del mazzo" la causa principale del collasso 8x8.
   * 2) I pezzi unici scendono in % con N (asso-cerchi-bianco: 1/9 vs 1/64; bianchi fino a 15):
   *    meno "letalita' statistica", ma restano colli di bottiglia di matching.
   * 3) Angolo = 2 vincoli in meno, bordo = 1: i pezzi hard vanno li'; i flessibili non devono
   *    bruciare quegli slot se nel residuo (foglio) restano pezzi hard.
   * 4) Errori early determinano spesso l'impossibilita' di chiudere.
   *
   * Usa grado finale atteso (board a coordinate libere), non solo geo su 0..N-1.
   */
  function gnSoloEarlyPlacementScore(state, card, x, y, residStats, residualCards) {
    if (!state || !card) return 0;
    const board = state.board || [];
    const size = state.size;
    if (!gnSoloIsEarlyPhase(board.length, size)) return 0;

    const prof = gnSoloCardAxisProfile(card, residStats);
    const hardOthers = gnSoloCountHardInResid(residualCards, residStats, card.uid);
    const thisHard = gnSoloProfileIsHard(prof);
    let sc = 0;

    // Apertura: la cella e' fissa (0,0) e il grado finale non e' ancora definito.
    // Conta SOLO quale carta (non aprire col pezzo piu' rigido del mazzo).
    if (board.length === 0) {
      if (prof.multiUnique) sc -= 40;
      else if (thisHard) sc -= 18;
      if (!thisHard && prof.flex > 0.35 && prof.flex < 0.95) sc += 20;
      const val = Number(card.value) || 0;
      if (val >= 2 && val <= size - 1 && !thisHard) sc += 8;
      // Preferisci non aprire con unico-asse se hai alternative flessibili
      if (thisHard && hardOthers >= 0) sc -= 5;
      return sc;
    }

    const expDeg = durissimaExpectedFinalDegree({ board, size }, x, y);

    if (thisHard) {
      // Hard: angolo/bordo early; interno early = errore tipico
      if (expDeg <= 2.25) sc += 52;
      else if (expDeg <= 3.25) sc += 22;
      else sc -= 65;
    } else {
      // Flessibile/abbondante: non bruciare slot a basso grado se servono ai hard residui
      if (expDeg <= 2.25) {
        if (hardOthers > 0) sc -= 48;
        else sc -= 12;
      } else if (expDeg <= 3.25 && hardOthers >= 2) {
        sc -= 10;
      } else if (expDeg >= 3.75) {
        sc += 8;
      }
    }

    // Con pochi pezzi gia' posati: evita di spingere hard verso l'interno del footprint
    if (board.length < size && thisHard && expDeg >= 3.5) {
      sc -= 20;
    }

    return sc;
  }

  /**
   * Set-fillability (anti-buco): esiste un riempimento delle celle vuote con le carte del pool
   * (mano+tallone come multiset), ignorando l'ordine di pesca? Se no, la posizione e' morta
   * topologicamente rispetto al residuo noto (foglio), indipendentemente dalla FIFO.
   * Backtrack MRV con budget nodi; false = "quasi certo morto" / non trovato entro budget.
   */
  /**
   * Ritorna true / false / null.
   * true = trovato riempimento; false = provato morto (cella con 0 opzioni);
   * null = budget esaurito (sconosciuto — NON trattare come morto).
   */
  function gnSoloSetFillable(board, size, poolCards, maxNodes) {
    maxNodes = maxNodes == null ? 8000 : maxNodes;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const base = (board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
    const empties = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!base.some(b => b.x === x && b.y === y)) empties.push({ x, y });
      }
    }
    if (empties.length === 0) return true;
    if (!poolCards || poolCards.length < empties.length) return false;
    // Early game: check completo troppo costoso/rumoroso — salta (null = non penalizzare)
    if (empties.length > 14) return null;
    const pool = poolCards.map(c => ({ ...c }));
    let nodes = 0;
    let exhausted = false;
    const keyOf = (x, y) => x + "," + y;

    function frontier(boardNow) {
      const filled = new Set(boardNow.map(b => keyOf(b.x, b.y)));
      const fr = [];
      for (const cell of empties) {
        if (filled.has(keyOf(cell.x, cell.y))) continue;
        let adj = boardNow.length === 0;
        for (const d of dirs) {
          if (filled.has(keyOf(cell.x + d[0], cell.y + d[1]))) adj = true;
        }
        if (adj) fr.push(cell);
      }
      return fr;
    }

    function dfs(boardNow, used) {
      nodes++;
      if (nodes > maxNodes) {
        exhausted = true;
        return false;
      }
      if (used.size === empties.length) return true;
      const fr = frontier(boardNow);
      if (!fr.length) return false;
      let bestCell = null;
      let bestOpts = null;
      let minO = Infinity;
      for (const cell of fr) {
        const opts = [];
        const sim = { board: boardNow, size, turnPlayed: 0 };
        for (const c of pool) {
          if (used.has(c.uid)) continue;
          if (canPlaceCardAt(sim, c, cell.x, cell.y, 1)) opts.push(c);
        }
        if (!opts.length) return false; // morto provato
        if (opts.length < minO) {
          minO = opts.length;
          bestCell = cell;
          bestOpts = opts;
          if (minO === 1) break;
        }
      }
      if (!bestCell) return false;
      const lim = Math.min(bestOpts.length, minO <= 2 ? 6 : 4);
      for (let i = 0; i < lim; i++) {
        const c = bestOpts[i];
        used.add(c.uid);
        boardNow.push({ x: bestCell.x, y: bestCell.y, card: c });
        if (dfs(boardNow, used)) return true;
        boardNow.pop();
        used.delete(c.uid);
        if (exhausted) return false;
      }
      return false;
    }

    const ok = dfs(base.slice(), new Set());
    if (ok) return true;
    if (exhausted) return null;
    return false;
  }

  /**
   * Celle di frontiera su board a coordinate libere (non solo 0..N-1).
   * Esclude posate che esploderebbero l'ingombro oltre NxN.
   */
  function gnSoloFrontierCells(board, size) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const list = board || [];
    if (!list.length) return [];
    const filled = new Set(list.map(b => b.x + "," + b.y));
    const out = new Map();
    for (const b of list) {
      for (const d of dirs) {
        const x = b.x + d[0];
        const y = b.y + d[1];
        const key = x + "," + y;
        if (filled.has(key) || out.has(key)) continue;
        const bounds = boardBounds(list, [{ x, y }]);
        if (bounds.width > size || bounds.height > size) continue;
        out.set(key, { x, y });
      }
    }
    return Array.from(out.values());
  }

  function gnSoloCellAdjCount(board, x, y) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const filled = new Set((board || []).map(b => b.x + "," + b.y));
    let adj = 0;
    for (const d of dirs) {
      if (filled.has(x + d[0] + "," + (y + d[1]))) adj++;
    }
    return adj;
  }

  function gnSoloCellFillerCount(board, size, poolCards, x, y) {
    const sim = { board: board || [], size, turnPlayed: 0 };
    let n = 0;
    for (const c of poolCards || []) {
      if (canPlaceCardAt(sim, c, x, y, 1)) n++;
    }
    return n;
  }

  /**
   * Analisi tasche/frontiera (diagnosi 8x8: morte tipica = adj>=3 e 0 filler).
   *
   * Importante: adj=1 con 0 filler NON e' morte (espansione opzionale in una direzione).
   * Morte certa = cella "chiusa" (adj>=3) senza filler nel residuo.
   * adj=2 con 0 filler = rischio alto (corridoio) ma non sempre fatale se si espande altrove.
   */
  function gnSoloAnalyzePockets(board, size, poolCards) {
    const fr = gnSoloFrontierCells(board, size);
    let dead = 0;
    let deadHigh = 0;
    let tight = 0;
    let risk = 0;
    const deadCells = [];
    for (const cell of fr) {
      const adj = gnSoloCellAdjCount(board, cell.x, cell.y);
      const fillers = gnSoloCellFillerCount(board, size, poolCards, cell.x, cell.y);
      if (fillers === 0 && adj >= 3) {
        // Taschia chiusa morta (il caso seed 16: adj4 fillers0)
        dead++;
        deadHigh++;
        deadCells.push({ x: cell.x, y: cell.y, adj });
        risk += adj >= 4 ? 600 : 450;
      } else if (fillers === 0 && adj === 2) {
        // Corridoio stretto senza filler: rischio, non hard-dead
        tight++;
        risk += 120;
      } else if (adj >= 3 && fillers === 1) {
        tight++;
        risk += 55;
      } else if (adj >= 4 && fillers <= 2) {
        tight++;
        risk += 30;
      }
    }
    return { dead, deadHigh, tight, risk, deadCells, frontier: fr.length };
  }

  /**
   * Check leggero: tasca chiusa (adj>=3) con 0 filler nel multiset residuo.
   * Coordinate libere. Non tratta adj=1 senza filler come buco (espansione opzionale).
   */
  function gnSoloFrontierHasHole(board, size, poolCards) {
    const pool = poolCards || [];
    const list = board || [];
    if (!list.length) return false;
    if (!pool.length) return list.length < size * size;
    return gnSoloAnalyzePockets(list, size, pool).dead > 0;
  }

  /**
   * Rischio tasca se posi card@x,y (pool = carte ancora da usare, inclusa card).
   * true se crea buco morto; risk numerico per ranking.
   */
  function gnSoloMovePocketRisk(board, size, poolCards, card, x, y) {
    if (!card) return { dead: false, risk: 0, deadHigh: 0 };
    const temp = (board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
    const sim = { board: temp, size, turnPlayed: 0 };
    if (!canPlaceCardAt(sim, card, x, y, 1)) {
      return { dead: true, risk: 9999, deadHigh: 1 };
    }
    temp.push({ x, y, card });
    const rest = (poolCards || []).filter(c => c.uid !== card.uid);
    const a = gnSoloAnalyzePockets(temp, size, rest);
    return { dead: a.dead > 0, risk: a.risk, deadHigh: a.deadHigh, tight: a.tight };
  }

  /**
   * Policy «frontiera aperta + matching residuo» (solitario equo).
   * Mid-game: preferisci espansione a basso grado (adj 1-2), non chiudere
   * celle strette se il residuo ha pochi filler, non riempire interiori troppo presto.
   * Score additivo (puo' essere fortemente negativo).
   */
  function gnSoloOpenGrowthScore(board, size, card, x, y, residualPool) {
    if (!card || !size) return 0;
    const list = board || [];
    const filled = list.length;
    const emptyAfter = size * size - filled - 1;
    if (emptyAfter <= 0) return 0;
    // Coda stretta: lasciano set-fill / deep search
    if (emptyAfter <= 8) return 0;

    const sim0 = { board: list, size, turnPlayed: 0 };
    if (!canPlaceCardAt(sim0, card, x, y, 1)) return -8000;

    const temp = list.map(b => ({ x: b.x, y: b.y, card: b.card }));
    temp.push({ x, y, card });
    const rest = (residualPool || []).filter(c => c && c.uid !== card.uid);

    let sc = 0;
    const expDeg = durissimaExpectedFinalDegree({ board: list, size }, x, y);
    const early = gnSoloIsEarlyPhase(filled, size);
    const mid = !early && emptyAfter > 10;
    const adjBefore = gnSoloCellAdjCount(list, x, y);

    // --- Crescita aperta (pesi moderati: troppa pena stallava 7/8) ---
    if (early || mid) {
      if (adjBefore <= 1) sc += 14;
      else if (adjBefore === 2) sc += 3;
      else if (adjBefore >= 3) sc -= 28;

      if (expDeg <= 2.3) sc += 6;
      else if (expDeg >= 3.7) sc -= mid ? 22 : 10;
    }

    // --- Matching residuo sulle celle strette dopo la posa ---
    const fr = gnSoloFrontierCells(temp, size);
    let tightUnderfilled = 0;
    let tightOk = 0;
    let minFillTight = 99;
    for (let i = 0; i < fr.length; i++) {
      const cell = fr[i];
      const adj = gnSoloCellAdjCount(temp, cell.x, cell.y);
      if (adj < 3) continue;
      const fillers = gnSoloCellFillerCount(temp, size, rest, cell.x, cell.y);
      if (fillers < minFillTight) minFillTight = fillers;
      if (fillers === 0) {
        // Gia' coperto da pocket dead altrove; qui solo segnale
        sc -= adj >= 4 ? 120 : 80;
        tightUnderfilled++;
      } else if (fillers === 1) {
        sc -= 35;
        tightUnderfilled++;
      } else if (fillers === 2) {
        sc -= 10;
        tightOk++;
      } else {
        tightOk++;
      }
    }
    if (tightUnderfilled === 0 && tightOk > 0 && minFillTight >= 3) sc += 12;

    // Pocket risk (senza doppio-contare dead gia' pesato altrove)
    const pockets = gnSoloAnalyzePockets(temp, size, rest);
    if (!pockets.dead && pockets.risk > 0) sc -= Math.min(100, pockets.risk * 0.2);

    // Set-fill solo molto in coda e budget basso
    if (emptyAfter <= 14 && emptyAfter > 8) {
      const fill = gnSoloSetFillable(temp, size, rest, 5000);
      if (fill === false) sc -= 180;
      else if (fill === true) sc += 20;
    }

    return sc;
  }

  /**
   * Quante posate "pocket-safe" esistono con le carte playable sul board dato
   * (residuo per il check tasche = residualPool). Limitato per costo.
   */
  function gnSoloCountPocketSafePlacements(board, size, playableCards, residualPool, limit) {
    limit = limit == null ? 10 : limit;
    const list = board || [];
    let playable = playableCards || [];
    if (!playable.length) return 0;
    if (!list.length) return Math.min(limit, playable.length);
    // Cap enumerazione (1-ply deve restare leggero)
    if (playable.length > 20) playable = playable.slice(0, 20);
    const cells = gnSoloFrontierCells(list, size);
    if (!cells.length) return 0;
    const cellCap = cells.length > 16 ? cells.slice(0, 16) : cells;
    let n = 0;
    const sim = { board: list, size, turnPlayed: 0 };
    for (let i = 0; i < playable.length; i++) {
      const card = playable[i];
      for (let j = 0; j < cellCap.length; j++) {
        const cell = cellCap[j];
        if (!canPlaceCardAt(sim, card, cell.x, cell.y, 1)) continue;
        const pr = gnSoloMovePocketRisk(list, size, residualPool, card, cell.x, cell.y);
        if (!pr.dead) {
          n++;
          if (n >= limit) return n;
        }
      }
    }
    return n;
  }

  /**
   * Lookahead 1 ply solitario equo: dopo la mossa, quante continuazioni pocket-safe restano?
   * - residualSafe: qualche carta del multiset residuo puo' ancora posarsi senza tasca morta
   *   (se 0, posizione topologicamente morta indipendentemente dalla pesca)
   * - drawSafe: dopo stop+pesca, con al piu' 1 carta dal tallone (campione), quante safe
   *   (modello equo: non usa FIFO reale, solo membership multiset)
   * Diagnosi seed 16: a #33 residual/hand safe=0 — evitare di ENTRARE in tali stati.
   */
  function gnSoloMoveSafeOutlook(state, move) {
    if (!state || !move || !move.card) {
      return { residualSafe: 0, drawSafe: 0, handSafe: 0, trapped: true };
    }
    const size = state.size;
    const board = state.board || [];
    const temp = board.map(b => ({ x: b.x, y: b.y, card: b.card }));
    const sim = { board: temp, size, turnPlayed: 0 };
    if (!canPlaceCardAt(sim, move.card, move.x, move.y, 1)) {
      return { residualSafe: 0, drawSafe: 0, handSafe: 0, trapped: true };
    }
    temp.push({ x: move.x, y: move.y, card: move.card });

    const owned = gnSoloOwnedPlayableCards(state);
    const tallone = gnSoloTalloneMultiset(state);
    const residual = owned.concat(tallone).filter(c => c.uid !== move.card.uid);
    if (residual.length === 0) {
      const empty = size * size - temp.length;
      return {
        residualSafe: empty <= 0 ? 1 : 0,
        drawSafe: empty <= 0 ? 1 : 0,
        handSafe: empty <= 0 ? 1 : 0,
        trapped: empty > 0
      };
    }

    const handAfter = (state.hands[0] || []).filter(c => c.uid !== move.card.uid);
    const freeAfter = [];
    if (isDurissimaFreeCellsEnabled(state)) {
      for (const c of state.durissimaFreeCells || []) {
        if (c && c.uid !== move.card.uid) freeAfter.push(c);
      }
    }
    const resAfter = [];
    if (isDurissimaReserveEnabled(state) && state.durissimaReserve) {
      for (const c of state.durissimaReserve) {
        if (c.uid !== move.card.uid) resAfter.push(c);
      }
    }
    const playableHand = handAfter.concat(freeAfter, resAfter);

    const residualSafe = gnSoloCountPocketSafePlacements(
      temp,
      size,
      residual,
      residual,
      8
    );
    const handSafe = gnSoloCountPocketSafePlacements(
      temp,
      size,
      playableHand,
      residual,
      6
    );

    // Pesca equa: prova un campione del tallone (non l'ordine reale)
    let drawSafe = handSafe;
    const pile = tallone.filter(c => c.uid !== move.card.uid);
    if (pile.length && residualSafe > 0) {
      const sample =
        pile.length <= 10
          ? pile
          : pile.slice(0, 10);
      for (let i = 0; i < sample.length; i++) {
        const drawn = sample[i];
        const withDraw = playableHand.concat([drawn]);
        const n = gnSoloCountPocketSafePlacements(temp, size, withDraw, residual, 4);
        if (n > drawSafe) drawSafe = n;
        if (drawSafe >= 4) break;
      }
    }

    return {
      residualSafe,
      drawSafe,
      handSafe,
      trapped: residualSafe === 0
    };
  }

  /** true se la mossa lascia il residuo senza continuazioni pocket-safe (solo mid/late). */
  function gnSoloMoveIsTrappedOutlook(state, move) {
    if (!state || state.players !== 1 || !move || !move.card) return false;
    const filled = (state.board && state.board.length) || 0;
    // Early: rumore + costo; la trappola tipica e' mid (diagnosi ~#29-33)
    if (filled < 18) return false;
    const empty = state.size * state.size - filled;
    if (empty <= 2 || empty > 40) return false;
    try {
      const o = gnSoloMoveSafeOutlook(state, move);
      return o.trapped === true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * Dopo una posa, il multiset residuo puo' ancora riempire i vuoti?
   * true = ok o sconosciuto; false = morto provato (anti-buco).
   */
  function gnSoloMovePreservesSetFill(board, size, poolCards, card, x, y, maxNodes) {
    if (!card) return true;
    const temp = (board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
    const sim = { board: temp, size, turnPlayed: 0 };
    if (!canPlaceCardAt(sim, card, x, y, 1)) return false;
    temp.push({ x, y, card });
    const rest = (poolCards || []).filter(c => c.uid !== card.uid);
    const emptyLeft = size * size - temp.length;
    if (rest.length < emptyLeft) return false;
    // Sempre: buco di frontiera (economico, coordinate libere)
    if (gnSoloFrontierHasHole(temp, size, rest)) return false;
    // Full fillability solo a meta'/coda e se board e' su griglia 0..N-1
    // (grow solitario usa 0..N-1; gioco libero puo' essere traslato)
    if (emptyLeft > 16) return true;
    const budget =
      maxNodes != null
        ? maxNodes
        : emptyLeft <= 6
          ? 30000
          : emptyLeft <= 10
            ? 15000
            : emptyLeft <= 14
              ? 8000
              : 4000;
    const r = gnSoloSetFillable(temp, size, rest, budget);
    return r !== false;
  }

  /**
   * Solitario equo: un piano e' "schedulabile" solo se ogni carta del piano e' GIA' in mano/riserva
   * (niente dipendenza dall'ordine reale del tallone). Simula posate dalla mano senza usare
   * la FIFO vera: a fine turno non si "scopre" quale carta arrivera'.
   *
   * Piani che citano carte ancora nel tallone → false (l'umano non puo' contare su quell'ordine).
   */
  function gnSoloIsPlanSchedulable(state, plan) {
    if (!plan || !plan.length || state.players !== 1) return true;
    const ownedNow = new Set(gnSoloOwnedPlayableCards(state).map(c => c.uid));
    for (const step of plan) {
      if (!step || !step.card) continue;
      if ((state.board || []).some(b => b.x === step.x && b.y === step.y)) continue;
      if (!ownedNow.has(step.card.uid)) return false;
    }
    // Simula solo con le carte owned (fork ma tallone reso opaco: pesca non usata per sbloccare step)
    const fork = gnForkSearchState(state);
    // Svuota il tallone nel fork di verifica: se un piano richiedesse una pesca specifica fallirebbe
    // gia' sopra; qui verifichiamo solo la legalita' topologica delle posate owned.
    fork.drawPile = [];
    let stepIdx = 0;
    let guard = 0;
    const maxGuard = plan.length * 48;
    while (stepIdx < plan.length && guard++ < maxGuard) {
      if (fork.status !== "playing") break;
      const step = plan[stepIdx];
      if (gnBoardHasCell(fork, step.x, step.y)) {
        stepIdx++;
        continue;
      }
      const requirement = placementRequirement(fork);
      if (requirement === null || (requirement > 4 && requirement !== 1)) return false;
      const hand = fork.hands[0] || [];
      const res = fork.durissimaReserve || [];
      const free = (fork.durissimaFreeCells || []).filter(Boolean);
      const live =
        (step.card && hand.find(card => card.uid === step.card.uid)) ||
        (step.card && res.find(card => card.uid === step.card.uid)) ||
        (step.card && free.find(card => card.uid === step.card.uid));
      if (!live) {
        // Carta non in mano: con tallone opaco non possiamo assumere di pescarla ora
        if (fork.turnPlayed > 0 && fork.turnPlayed < 5) {
          const endFrame = gnApplyEndTurnInPlace(fork);
          if (!endFrame || fork.status !== "playing") return false;
          continue;
        }
        return false;
      }
      const fromFree =
        !hand.some(c => c.uid === live.uid) &&
        !res.some(c => c.uid === live.uid) &&
        free.some(c => c.uid === live.uid);
      const fromReserve =
        !fromFree &&
        !hand.some(c => c.uid === live.uid) &&
        res.some(c => c.uid === live.uid);
      const legals = legalPlacements(fork, 0, requirement);
      const legal = legals.find(
        move =>
          move.x === step.x &&
          move.y === step.y &&
          move.card.uid === live.uid &&
          (fromFree
            ? move.fromFreeCell === true
            : fromReserve
              ? move.fromReserve === true
              : !move.fromReserve && !move.fromFreeCell)
      );
      if (!legal) {
        if (fork.turnPlayed > 0 && fork.turnPlayed < 5) {
          const endFrame = gnApplyEndTurnInPlace(fork);
          if (!endFrame || fork.status !== "playing") return false;
          continue;
        }
        return false;
      }
      const frame = gnApplyPlacementInPlace(fork, 0, legal);
      if (!frame) return false;
      if (fork.turnPlayed >= 5) {
        const endFrame = gnApplyEndTurnInPlace(fork);
        if (!endFrame || fork.status !== "playing") return false;
      }
      stepIdx++;
    }
    // Piano equo puo' essere parziale (solo owned): ok se abbiamo consumato tutti gli step del piano
    return stepIdx >= plan.length;
  }

  /**
   * Finish / mossa solitario equo: solo mano/riserva.
   * - Tallone vuoto: DFS sulle carte in mano.
   * - Tallone coperto (default): expectimax 1 pesca su multiset (ordine ignoto).
   * - Tallone cima visibile (durissimaPeekTopDraw): la prossima pesca e' drawPile[0]
   *   (info legale di regola, non oracolo sull'intero ordine).
   */
  function gnSoloFairFinishAction(state, playerId) {
    const requirement = placementRequirement(state);
    if (requirement === null || (requirement > 4 && requirement !== 1)) return null;
    const legals = legalPlacements(state, playerId, requirement);
    if (!legals.length) return null;
    const multi = gnSoloTalloneMultiset(state);
    const talloneEmpty = multi.length === 0;
    const peekTop = state.durissimaPeekTopDraw === true;
    const knownTop =
      peekTop && state.drawPile && state.drawPile.length > 0
        ? state.drawPile[0]
        : null;

    // Tallone vuoto: ricerca completa equa (tutte le carte residue sono in mano/riserva)
    if (talloneEmpty) {
      const empty =
        state.size * state.size - ((state.board && state.board.length) || 0);
      if (empty <= 8) {
        const fork0 = gnForkSearchState(state);
        fork0.drawPile = [];
        const searchOpts = gnMoveSearchOptions(fork0, { coordinatedTeam: true });
        if (searchOpts) {
          searchOpts.maxNodes = empty <= 4 ? 200000 : 80000;
          const outcome = solveGnStateOutcome(fork0, {
            ...searchOpts,
            _gnInPlace: true,
            trackAction: true,
            coordinatedTeam: true
          });
          if (outcome.result === "solved" && outcome.action) return outcome.action;
        }
      }
    }

    let best = null;
    let bestSc = -Infinity;
    // Peek: solo la cima. Altrimenti campione del multiset (ordine ignoto).
    const sample =
      multi.length === 0
        ? []
        : knownTop
          ? [knownTop]
          : multi.length <= 16
            ? multi.slice()
            : multi.slice(0, 16);

    // Anti-buco + anti-pocket: preferisci mosse che non creano frontiera morta
    const poolAll = gnSoloOwnedPlayableCards(state).concat(multi);
    const emptyNow =
      state.size * state.size - ((state.board && state.board.length) || 0);
    const fillBudget =
      emptyNow <= 8 ? 12000 : emptyNow <= 16 ? 4000 : 1500;
    const safeLegals = legals.filter(m => {
      if (
        !gnSoloMovePreservesSetFill(
          state.board,
          state.size,
          poolAll,
          m.card,
          m.x,
          m.y,
          fillBudget
        )
      ) {
        return false;
      }
      const pr = gnSoloMovePocketRisk(state.board, state.size, poolAll, m.card, m.x, m.y);
      return !pr.dead;
    });
    const moveList = safeLegals.length ? safeLegals : legals;

    for (const move of moveList) {
      let sc = 1;
      if (safeLegals.length && safeLegals.indexOf(move) >= 0) sc += 15;
      const fork = gnForkSearchState(state);
      if (!gnApplyPlacementInPlace(fork, playerId, move)) continue;
      const emptyAfter =
        fork.size * fork.size - ((fork.board && fork.board.length) || 0);
      if (emptyAfter === 0) {
        sc += 1e6;
      } else if (sample.length === 0) {
        if (fork.turnPlayed > 0 && fork.turnPlayed < 5) {
          const req2 = placementRequirement(fork);
          sc +=
            req2 && (req2 <= 4 || req2 === 1)
              ? legalPlacements(fork, playerId, req2).length * 5
              : 0;
        }
      } else {
        let sum = 0;
        for (const maybe of sample) {
          const f2 = gnForkSearchState(state);
          if (!gnApplyPlacementInPlace(f2, playerId, move)) continue;
          // Dopo posa+stop: in mano arriva la carta candidata (cima se peek, o ipotesi multiset)
          f2.drawPile = (state.drawPile || [])
            .filter(c => c.uid !== maybe.uid)
            .map(c => ({ ...c }));
          // Con peek, dopo la pesca la NUOVA cima e' visibile (seconda carta attuale)
          if (knownTop && state.drawPile && state.drawPile.length > 1) {
            // lascia l'ordine restante solo come cima nota al turno dopo: non usiamo oltre
            f2.drawPile = state.drawPile.slice(1).map(c => ({ ...c }));
          } else if (!knownTop) {
            f2.drawPile = [];
          }
          f2.turnPlayed = 0;
          f2.consecutivePasses = 0;
          const h = (f2.hands[playerId] || []).slice();
          if (!h.some(c => c.uid === maybe.uid)) h.push({ ...maybe });
          f2.hands[playerId] = h;
          const req2 = placementRequirement(f2);
          const leg2 =
            req2 && (req2 <= 4 || req2 === 1)
              ? legalPlacements(f2, playerId, req2)
              : [];
          let local = leg2.length;
          // Peek: bonus se la prossima carta (unica nota) ha una posa legale dopo questa mossa
          if (knownTop && leg2.some(m => m.card && m.card.uid === maybe.uid)) {
            local += 12;
          }
          // Solo cima nota: non usare drawPile[1] (l'umano la vede solo DOPO la pesca)
          sum += local;
        }
        sc += sum / sample.length;
      }
      // Bias topologia + early-game (errori inizio partita)
      if (move.card) {
        const left = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));
        const stats = gnSoloBuildResidStats(left);
        const prof = gnSoloCardAxisProfile(move.card, stats);
        const geo = gnSoloCellGeoDegree(move.x, move.y, state.size);
        sc += gnSoloEarlyPlacementScore(state, move.card, move.x, move.y, stats, left) * 0.35;
        if (prof.multiUnique && geo >= 4) sc -= 5;
        if (prof.flex > 0.7 && geo >= 3) sc += 1.5;
      }
      sc += (10 - (Number(move.card && move.card.value) || 0)) * 0.02;
      if (sc > bestSc) {
        bestSc = sc;
        best = move;
      }
    }
    if (!best) return null;
    return { type: "move", move: best };
  }

  /**
   * Search equa in coda: posate dalla mano; a fine turno pesca da tallone rimescolato
   * come multiset (seed dal set di uid, non FIFO reale del seed di partita).
   */
  function gnSoloFairDeepSearch(state, playerId, options) {
    options = options || {};
    const empty0 =
      state.size * state.size - ((state.board && state.board.length) || 0);
    const emptyCap =
      options.maxEmpty != null
        ? options.maxEmpty
        : state.size >= 7
          ? 14
          : 10;
    if (empty0 <= 0 || empty0 > emptyCap) return null;
    const maxNodes = options.maxNodes || (empty0 <= 4 ? 120000 : empty0 <= 6 ? 60000 : 25000);
    let nodes = 0;
    let bestAction = null;
    let bestFilled = (state.board && state.board.length) || 0;

    function opaqueShufflePile(st, salt) {
      const pile = (st.drawPile || []).slice();
      if (pile.length <= 1) return;
      const sig = pile.map(c => c.uid).sort().join(",");
      const rng = mulberry32(hashSeed("fair-deep:" + sig + ":" + salt + ":" + st.board.length));
      st.drawPile = shuffle(pile, rng);
    }

    function dfs(st, rootAction) {
      nodes++;
      if (nodes > maxNodes) return false;
      const filled = (st.board && st.board.length) || 0;
      if (filled > bestFilled && rootAction) {
        bestFilled = filled;
        bestAction = rootAction;
      }
      if (st.status === "success" || isBoardComplete(st)) {
        if (rootAction) bestAction = rootAction;
        return true;
      }
      const empty = st.size * st.size - filled;
      if (empty <= 0) {
        if (rootAction) bestAction = rootAction;
        return true;
      }
      const req = placementRequirement(st);
      if (req === null || (req > 4 && req !== 1)) {
        if (st.turnPlayed > 0) {
          opaqueShufflePile(st, nodes);
          endTurn(st);
          return dfs(st, rootAction);
        }
        return false;
      }
      let moves = legalPlacements(st, playerId, req);
      if (!moves.length) {
        if (st.turnPlayed > 0) {
          opaqueShufflePile(st, nodes);
          endTurn(st);
          return dfs(st, rootAction);
        }
        return false;
      }
      const leftCards = gnSoloOwnedPlayableCards(st).concat(st.drawPile || []);
      const stats = gnSoloBuildResidStats(leftCards);
      moves = moves.slice().sort((a, b) => {
        const pa = gnSoloCardAxisProfile(a.card, stats);
        const pb = gnSoloCardAxisProfile(b.card, stats);
        const ga = gnSoloCellGeoDegree(a.x, a.y, st.size);
        const gb = gnSoloCellGeoDegree(b.x, b.y, st.size);
        const sa = pa.flex * 3 - (pa.multiUnique && ga >= 4 ? 25 : 0) - (ga === 4 && pa.rigid > 0.5 ? 8 : 0);
        const sb = pb.flex * 3 - (pb.multiUnique && gb >= 4 ? 25 : 0) - (gb === 4 && pb.rigid > 0.5 ? 8 : 0);
        return sb - sa;
      });
      const lim = Math.min(moves.length, empty0 <= 4 ? 8 : 5);
      for (let i = 0; i < lim; i++) {
        const mv = moves[i];
        const fork = gnForkSearchState(st);
        if (!gnApplyPlacementInPlace(fork, playerId, mv)) continue;
        opaqueShufflePile(fork, nodes + i);
        const act = rootAction || { type: "move", move: mv };
        if (dfs(fork, act)) return true;
      }
      if (st.turnPlayed > 0 && st.turnPlayed < 5) {
        const fork = gnForkSearchState(st);
        opaqueShufflePile(fork, nodes + 99);
        endTurn(fork);
        if (dfs(fork, rootAction)) return true;
      }
      return false;
    }

    const root = gnForkSearchState(state);
    opaqueShufflePile(root, 0);
    dfs(root, null);
    return bestAction;
  }

  /** Solitario: nessuna mossa fuori da legalPlacements (candidateCells + regole posa). */
  function gnEnsureLegalSoloMove(state, playerId, action) {
    if (!gnUseCoordinatedSoloPlanner(state) || !action || action.type !== "move" || !action.move) {
      return action;
    }
    const requirement = placementRequirement(state);
    const legals = legalPlacements(state, playerId, requirement);
    const move = action.move;
    const hit = legals.find(
      entry => entry.card.uid === move.card.uid && entry.x === move.x && entry.y === move.y
    );
    if (hit) return { type: "move", move: hit };
    return legals.length ? { type: "move", move: legals[0] } : { type: "stop" };
  }

  function gnAllTeamLegalPlacements(state, requirement) {
    const out = [];
    for (let holderId = 0; holderId < state.players; holderId++) {
      for (const move of legalPlacements(state, holderId, requirement)) {
        out.push({ holderId, move });
      }
    }
    return out;
  }

  function gnPruneTeamPlacements(state, entries) {
    if (!entries.length) return entries;

    const perfectGN = gnUseCoordinatedTeamPlanner(state) && isDurissimaGnIdeal(state);
    const relaxPrunes = perfectGN && state.size >= 4;

    let kept = entries;
    if (!relaxPrunes) {
      kept = entries.filter(({ holderId, move }) => !gnFastMoveFatal(state, holderId, move));
    }

    if (isDurissimaGnIdeal(state) && !relaxPrunes) {
      const plan = state._gnTargetPlan;
      const safe = kept.filter(({ holderId, move }) => {
        if (plan && Array.isArray(plan)) {
          for (const p of plan) {
            if (p.card && p.card.uid === move.card.uid && p.x === move.x && p.y === move.y) return true;
          }
        }
        return !gnMoveBreaksIdealFillPlan(state, holderId, move);
      });
      if (safe.length) kept = safe;
    }
    return kept;
  }

  function gnRankTeamPlacement(state, holderId, move, options) {
    options = options || {};
    const rankOpts = {
      useMorphology: options.useMorphology !== false,
      useGlobalHeuristic: options.useGlobalHeuristic === true,
      _narrowFrontier: options._narrowFrontier
    };
    let score = gnMoveRank(state, holderId, move, rankOpts);
    score += durissimaMoveScore(
      state, holderId, move, () => 0, 12, placementRequirement(state), true
    ) * 0.08;

    // Bias forte per le celle precoci del piano one-mind (cell order per G>N)
    if (state._gnFullSequence && Array.isArray(state._gnFullSequence)) {
      const seq = state._gnFullSequence;
      let planPos = -1;
      for (let i = 0; i < seq.length; i++) {
        const t = seq[i];
        if (t.x === move.x && t.y === move.y) {
          if (!state.board.some(b => b.x === t.x && b.y === t.y)) {
            planPos = i;
          }
          break;
        }
      }
      if (planPos >= 0) {
        // bonus molto forte per G > N (tallone)
        const isHighG = state.players > state.size;
        const bonus = isHighG ? (80000 - planPos * 3000) : (50000 - planPos * 2000);
        score += Math.max(2000, bonus);
      }
    }
    return score;
  }

  function gnChooseGlobalTeamPlacement(state, random, options) {
    options = options || {};
    const requirement = placementRequirement(state);
    const rawTeam = gnAllTeamLegalPlacements(state, requirement);
    let team = gnPruneTeamPlacements(state, rawTeam);
    if (!team.length) {
      team = rawTeam.filter(({ holderId, move }) => !gnFastMoveFatal(state, holderId, move));
    }
    if (!team.length && rawTeam.length) team = rawTeam;
    if (!team.length) return null;

    if (isDurissimaGnIdeal(state) && gnEmptyCellsInIdealGrid(state) <= gnNarrowHeuristicEmptyCap(state.size)) {
      options._narrowFrontier = gnNarrowFrontierCells(state);
    }

    // Force head del piano solo su 4x4+ (per non disturbare 3x3 seed42 che risolveva senza)
    const plan = state._gnTargetPlan;
    if (state.size >= 4 && plan && Array.isArray(plan)) {
      let head = null;
      for (const p of plan) {
        const placed = state.board.some(b => b.x === p.x && b.y === p.y);
        if (!placed) { head = p; break; }
      }
      if (head && head.card) {
        for (const entry of team) {
          if (entry.move.card.uid === head.card.uid && entry.move.x === head.x && entry.move.y === head.y) {
            return { holderId: entry.holderId, move: entry.move, score: 999999999 };
          }
        }
      }
    }

    let best = null;
    let bestScore = -Infinity;
    for (const entry of team) {
      const score = gnRankTeamPlacement(state, entry.holderId, entry.move, options);
      if (score > bestScore) {
        bestScore = score;
        best = { holderId: entry.holderId, move: entry.move, score };
      }
    }
    return best;
  }

  /** Soglia vuoti per DFS coordinato (squadra unica vs mazzo). */
  function gnCoordinatedSolverThreshold(size) {
    if (size <= 3) return size * size;
    if (size === 4) return 12;  // più search per perfect 4x4 one-mind
    if (size <= 5) return 10;
    return gnEndgameExactThreshold(size);
  }

  function solveGnCoordinatedBestAction(state, playerId, random) {
    const searchOpts = gnMoveSearchOptions(state, { coordinatedTeam: true });
    if (!searchOpts) return null;
    const fork = gnForkSearchState(state);
    const outcome = solveGnStateOutcome(fork, {
      ...searchOpts,
      _gnInPlace: true,
      trackAction: true,
      coordinatedTeam: true
    });
    if (outcome.result === "solved" && outcome.action) return outcome.action;
    return null;
  }

  // Precomputed library of full solutions for 4x4 (user's idea: small fixed set "in memoria")
  let _4x4SolutionLibrary = null;
  function get4x4SolutionLibrary() {
    if (_4x4SolutionLibrary) return _4x4SolutionLibrary;
    _4x4SolutionLibrary = [];
    try {
      const ms = dmRequireModule("./scripts/durissima-matrix-solver");
      if (!ms) return _4x4SolutionLibrary;
      // Precomputiamo un pool di soluzioni "NxN" una volta per tutte (per N=4).
      // Ogni soluzione e' un piano completo (16 step card+cell) generato dal solver A+B.
      // In fase di deal ne scegliamo una il cui *insieme completo* di carte matcha le mani.
      // Poi la seguiamo strict con passi. Non serve ricalcolare l'ordine durante la partita.
      let attempts = 0;
      const maxAttempts = 1500;
      // Target 300 soluzioni NxN precomputate fisse (buon compromesso: più hit lib vs tempo build una tantum all'avvio)
      while (_4x4SolutionLibrary.length < 300 && attempts < maxAttempts) {
        attempts++;
        const asm = ms.findSchedulableMatrix(4, { maxNodesA: 1000000, maxNodesB: 300000 });
        if (asm && asm.success) {
          const plan = ms.getTargetPlan(asm);
          if (plan && plan.length === 16) {
            _4x4SolutionLibrary.push(plan);
          }
        }
      }
    } catch (e) {}
    return _4x4SolutionLibrary;
  }

  function chooseDurissimaCoordinatedAction(state, playerId, random) {
    if (state.turnPlayed >= 5) return { type: "stop" };
    const requirement = placementRequirement(state);
    if (state.turnPlayed >= 4 && requirement > 4) return { type: "stop" };
    if (state.turnPlayed < 4 && requirement > 4) return { type: "stop" };

    // Durante la decisione one-mind: vietato consumare/simulare la FIFO reale del tallone.
    // (Le posate reali e la pesca di fine turno avvengono FUORI, in apply/botStep.)
    const _prevDecide = state._gnInCoordinatedDecide;
    state._gnInCoordinatedDecide = true;
    try {
      return chooseDurissimaCoordinatedActionBody(state, playerId, random, requirement);
    } finally {
      state._gnInCoordinatedDecide = _prevDecide;
    }
  }

  function chooseDurissimaCoordinatedActionBody(state, playerId, random, requirement) {
    const coordinated = gnUseCoordinatedDurissimaPlanner(state);
    const soloCoordinated = coordinated && state.players === 1;
    const virtualMulti = soloCoordinated && isDurissimaSoloVirtualMulti(state);
    const perfectGNLive = coordinated && isDurissimaGnIdeal(state);

    // Turni corti mid-game solitario N>=6 (dopo 1 posa, griglia ancora "aperta").
    // Virtual-multi: NO short forzato (come G=2: stop dopo 1 via _gnJustPlayedSeqStep).
    // Vale ANCHE con refill (prima il refill disabilitava il freno -> catene e
    // regressione packing). Multi-posa resta libera in coda e se
    // durissimaSoloAllowMidChains. Su 4-5 non forziamo short: short aggressivo
    // regrediva il noref; soft+refill su 4x4 peggiorava pure vs catene libere.
    // Idea (4+1 cieca) resta opt-in pursueIdea: regalo ovunque, trappola/umani.
    if (
      soloCoordinated &&
      !virtualMulti &&
      state.size >= 6 &&
      state.turnPlayed >= 1 &&
      !durissimaSoloAllowMidChains(state)
    ) {
      const emptyNow =
        state.size * state.size - ((state.board && state.board.length) || 0);
      const shortTurnEmpty = Math.max(
        16,
        Math.floor(state.size * state.size * 0.28)
      );
      if (emptyNow > shortTurnEmpty) {
        return { type: "stop" };
      }
    }

    // Solitario a inizio turno: free cell + VITA su trappola topologica.
    // Trigger: zero legali OPPURE zero legali pocket-safe / outlook trapped.
    // Catena di reshuffle (budget) finche' compare una mossa safe o vite esaurite.
    if (soloCoordinated && state.turnPlayed === 0) {
      if (isDurissimaFreeCellsEnabled(state) && durissimaFreeCellEmptyIndex(state) >= 0) {
        if (!hasLegalPlacementsNow(state, playerId) || !gnSoloHasSafeLegalNow(state, playerId)) {
          const parked = gnSoloFillFreeCellsBeforeVita(state, playerId);
          if (parked === 0 && !hasLegalPlacementsNow(state, playerId)) {
            const parkAct = gnSoloChooseParkAction(state, playerId);
            if (parkAct) return parkAct;
          }
        }
        // Ultima spiaggia: park proattivo mid-game (riempie fc prima di posare)
        const proPark = gnSoloProactiveParkAction(state, playerId);
        if (proPark) return proPark;
      }
      if (
        isDurissimaVitaExtraEnabled(state) &&
        canUseDurissimaVitaExtra(state, playerId) &&
        !gnSoloHasSafeLegalNow(state, playerId)
      ) {
        spendDurissimaVitaExtraUntilSafe(state, playerId, random, {
          strategy: "durissima-global-planner"
        });
      }
    }

    // Fork bot jolly: hold/rescue/peek cima (non tocca partite senza wild)
    if (soloCoordinated && gnSoloWildSmartEnabled(state)) {
      const wildAct = gnSoloWildSmartAction(state, playerId, requirement);
      if (wildAct) return wildAct;
    }

    // ONE MIND vs mazzo — path unificato per conoscenza:
    // - fullKnown set: draw < G, G>=N, o G=1 (insieme carte residue noto; ORDINE tallone ignoto in solitario equo)
    // - partial (G>1, G<N, tallone grande): prefisso owned + scheletro; handoff a fullKnown
    // - G=1 equo: multiset tallone noto (foglio), mai usare l'ordine reale di drawPile per pianificare
    if (coordinated && ((state.players || 1) > 1 || soloCoordinated)) {
      const size = state.size;
      const targetLen = size * size;
      const players = state.players || 1;
      // Virtual-multi: NON usare il ramo scoreSolo fullKnown; agisci come coop G=2
      // (partial se tallone grande). Owned = tutta la mano unica.
      const isSolo = players === 1 && !virtualMulti;
      const drawPileLen = (state.drawPile || []).length;
      const isIdeal = isDurissimaGnIdeal(state);
      // Soglia tallone "piccolo": G reale, o G virtuale 2 in solo virtual-multi
      const gEff = virtualMulti ? 2 : players;
      const isSmallTallone = drawPileLen < gEff;
      const gAtLeastN = players >= size;
      // Solitario legacy: fullKnown sempre. Virtual-multi / coop: fullKnown se tallone < G_eff.
      const fullKnown = isSolo
        ? true
        : isIdeal ||
          isSmallTallone ||
          (gAtLeastN && drawPileLen < players);
      const emptyCount = targetLen - ((state.board && state.board.length) || 0);
      const pendingFullSeq = state._gnFullSequence
        ? state._gnFullSequence.filter(
            s => s && s.card && !(state.board || []).some(b => b.x === s.x && b.y === s.y)
          ).length
        : 0;
      const hasCompleteFullSeq =
        state._gnFullSequence &&
        state._gnFullSequence.length > 0 &&
        state._gnFullSequence[0] &&
        state._gnFullSequence[0].card &&
        !state._gnPartialMode &&
        pendingFullSeq >= emptyCount &&
        emptyCount > 0;

      // Replan: mai pianificato | handoff a fullKnown | partial periodico | soglie di coda
      const placedNow = (state.board && state.board.length) || 0;
      const drawNow = drawPileLen;
      let needPlan = emptyCount > 0 && !state._gnPlanningDone;
      if (emptyCount > 0 && state._gnPlanningDone) {
        const lastPlaced = state._gnPlanAtPlaced || 0;
        const lastDraw = state._gnPlanDrawLen != null ? state._gnPlanDrawLen : drawNow;
        const periodic =
          drawNow < lastDraw ||
          placedNow - lastPlaced >= Math.max(1, virtualMulti ? 2 : players);
        if (fullKnown && !hasCompleteFullSeq) {
          if (!state._gnHadFullKnownPlan || periodic) needPlan = true;
        } else if (state._gnPartialMode && !fullKnown && periodic) {
          needPlan = true;
        }
        // Solitario legacy: replan ad ogni pesca; N grandi replan piu' spesso (anti-buco mid)
        if (isSolo && drawNow < lastDraw) needPlan = true;
        if (
          isSolo &&
          placedNow > lastPlaced &&
          (emptyCount <= 16 || size >= 6 || emptyCount <= Math.floor(targetLen * 0.55))
        ) {
          needPlan = true;
        }
        // Virtual-multi: replan a pesca come coop (periodic gia' copre draw)
        if (virtualMulti && drawNow < lastDraw) needPlan = true;
        // Coda: forza replan a empty 8 e 4 (una volta per soglia) se non G=N ideal perfetto
        const gLessN = players < size || virtualMulti;
        if ((gLessN || state._gnPartialMode || !hasCompleteFullSeq || isSolo) && !perfectGNLive) {
          if (emptyCount <= 8 && state._gnEmptyReplan8 !== true) {
            needPlan = true;
            state._gnEmptyReplan8 = true;
          }
          if (emptyCount <= 4 && state._gnEmptyReplan4 !== true) {
            needPlan = true;
            state._gnEmptyReplan4 = true;
          }
        }
      }

      if (needPlan) {
      state._gnPlanningDone = true;
      try {
        const ms = dmRequireModule("./scripts/durissima-matrix-solver");
        if (!ms) throw new Error("solver unavailable");

        if (fullKnown) {
          state._gnPartialMode = false;
          state._gnHadFullKnownPlan = true;
          // === ALGORITMO UNICO fullKnown (N=3..8; G>=N; draw<G; G=1 solitario) ===
          // Solitario core: NON un romanzo su N^2 carte. Bootstrap con sole carte giocabili
          // (mano+riserva), replan a ogni pesca; residuale completo solo in coda o tallone corto.
          // Principio densita': tratti piu' numerosi (tipicamente valore alto su N<8) → late + cluster.
          const boardUids = new Set((state.board || []).map(b => b.card && b.card.uid).filter(Boolean));
          const remaining = [];
          const ownedUids = new Set();
          for (let p = 0; p < (state.hands || []).length; p++) {
            if (state.hands[p]) {
              for (const c of state.hands[p]) {
                if (!boardUids.has(c.uid)) {
                  remaining.push({ ...c });
                  ownedUids.add(c.uid);
                }
              }
            }
          }
          if (isSolo && isDurissimaReserveEnabled(state) && state.durissimaReserve) {
            for (const c of state.durissimaReserve) {
              if (!boardUids.has(c.uid) && !ownedUids.has(c.uid)) {
                remaining.push({ ...c });
                ownedUids.add(c.uid);
              }
            }
          }
          if (isSolo && isDurissimaFreeCellsEnabled(state)) {
            for (const c of state.durissimaFreeCells) {
              if (c && !boardUids.has(c.uid) && !ownedUids.has(c.uid)) {
                remaining.push({ ...c });
                ownedUids.add(c.uid);
              }
            }
          }
          let minLateForTallone = 0;
          const fullGame = simulationDeck().filter(c => Number(c.value) <= size);
          const knownUids = new Set([...remaining.map(c => c.uid), ...boardUids]);
          let missing = [];
          if (isSolo) {
            for (const c of state.drawPile || []) {
              if (!boardUids.has(c.uid) && !ownedUids.has(c.uid)) {
                missing.push({ ...c });
              }
            }
            const have = new Set([...knownUids, ...missing.map(c => c.uid)]);
            for (const c of fullGame) {
              if (!have.has(c.uid)) missing.push({ ...c });
            }
          } else {
            missing = fullGame.filter(c => !knownUids.has(c.uid)).map(c => ({ ...c }));
          }
          if (missing.length > 0 && !isSolo) {
            remaining.push(...missing);
            const denom = Math.max(1, virtualMulti ? 2 : players);
            const minRounds = Math.ceil(missing.length / denom) + 1;
            minLateForTallone = minRounds * denom;
          } else if (missing.length > 0 && isSolo) {
            // Solo: missing restano note per densita'/lookahead, ma non in fullSeq bootstrap
            remaining.push(...missing);
          }

          let mapped = [];
          let cellPlan = [];
          let asmResult = null;

          // --- Solitario EQUO: solo carte in mano/riserva nei piani.
          // Multiset tallone = noto (foglio); ORDINE tallone = ignoto (mai usato per schedulare uid).
          // Strategia generale (ogni N): rigidita' da INCROCI di tratti + topologia celle
          // (non hack "i 5 in un 3x3"). Su 8x8 gli assi sono equidistribuiti: conta il collo di bottiglia.
          if (isSolo) {
            const dirsS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const playableNow = remaining.filter(c => ownedUids.has(c.uid));
            const allLeftSet = remaining.filter(c => !boardUids.has(c.uid));
            const residStats = gnSoloBuildResidStats(allLeftSet);
            const closePhase = emptyCount <= Math.max(10, Math.floor(targetLen * 0.48));
            const talloneEmpty = drawPileLen === 0;
            const doFullResidual =
              talloneEmpty ||
              playableNow.length >= emptyCount;

            const scoreSolo = (x, y, card, tempBoard, stepIdx) => {
              const val = Number(card.value) || 0;
              const prof = gnSoloCardAxisProfile(card, residStats);
              const geo = gnSoloCellGeoDegree(x, y, size);
              let sc = 0;
              if (ownedUids.has(card.uid)) sc += 50;

              // Anti-buco (A): se questa posa rende il residuo set-infeasible, penalita' fortissima
              // (pool = tutte le carte ancora da posare: allLeftSet meno quelle gia' usate su tempBoard)
              const usedOnTemp = new Set(tempBoard.map(b => b.card && b.card.uid).filter(Boolean));
              const poolForCheck = allLeftSet.filter(c => !usedOnTemp.has(c.uid));
              const emptyLeft = targetLen - tempBoard.length - 1;
              // Controlla solo se ha senso (non a ogni micro-nodo con griglia enorme e budget 0)
              // Anti-buco: frontiera sempre; fill completo se emptyLeft <= 16
              if (emptyLeft >= 0) {
                const okFill = gnSoloMovePreservesSetFill(
                  tempBoard,
                  size,
                  poolForCheck,
                  card,
                  x,
                  y,
                  emptyLeft <= 6 ? 25000 : emptyLeft <= 12 ? 12000 : 5000
                );
                if (!okFill) sc -= 800;
                // Anti-pocket + frontiera aperta / matching residuo
                const pr = gnSoloMovePocketRisk(tempBoard, size, poolForCheck, card, x, y);
                if (pr.dead) sc -= 500 + Math.min(400, pr.risk);
                else if (pr.risk > 0) sc -= Math.min(120, pr.risk * 0.4);
                // Peso ridotto: full score peggiorava avg 6-8 (probe 2026-07-18)
                sc += gnSoloOpenGrowthScore(tempBoard, size, card, x, y, poolForCheck) * 0.35;
              }

              // --- Allinea pezzo e cella (generale, ogni N) ---
              // Early: score dedicato (angoli/bordi, riserva per hard nel residuo)
              sc += gnSoloEarlyPlacementScore(
                { board: tempBoard, size },
                card,
                x,
                y,
                residStats,
                allLeftSet.filter(c => !usedOnTemp.has(c.uid))
              );
              // Mid/late (fuori early): rigido su bordo/angolo, flex dentro
              if (!gnSoloIsEarlyPhase(tempBoard.length, size)) {
                if (prof.multiUnique || prof.scarceAxes >= 2) {
                  if (geo >= 4) sc -= 40;
                  else if (geo === 3) sc -= 12;
                  else sc += 14;
                } else if (prof.rigid > 0.55 || prof.scarceAxes === 1) {
                  if (geo >= 4) sc -= 18 * prof.rigid;
                  else if (geo === 2) sc += 8 * prof.rigid;
                }
                if (prof.flex > 0.65 && geo === 2 && !closePhase) sc -= 6;
              }

              // Early/mid densita' valore: abbondanti non isolati; coda cluster flex
              const midGame = !closePhase && tempBoard.length >= Math.floor(targetLen * 0.3);
              if (!closePhase) {
                sc += (size + 1 - val) * 3;
                if (prof.flex > 0.7 && prof.cv >= residStats.maxV - 0) sc -= midGame ? 22 : 16;
              } else {
                sc += prof.flex * 12;
                sc += val * 0.4;
              }

              let sameValN = 0;
              let sameShapeN = 0;
              let sameColorN = 0;
              for (const d of dirsS) {
                const nb = tempBoard.find(b => b.x === x + d[0] && b.y === y + d[1]);
                if (!nb || !nb.card) continue;
                if (nb.card.value === card.value) {
                  sameValN++;
                  // Cluster valore: forte se il valore e' fungibile (count alto)
                  sc += prof.cv >= 3 ? 14 : 5;
                }
                if (nb.card.shape === card.shape) {
                  sameShapeN++;
                  sc += prof.cs >= 3 ? 6 : 2;
                }
                if (nb.card.color === card.color) {
                  sameColorN++;
                  sc += prof.cc >= 3 ? 6 : 2;
                }
              }
              // Cluster mid solo se gia' appoggiato (non sparpagliare abbondanti)
              if (!closePhase && prof.flex > 0.65 && sameValN > 0) sc += 18;
              // Isolare un pezzo scarso di forma/colore accanto a nulla di simile: ok se angolo
              if (prof.scarceAxes >= 1 && sameShapeN + sameColorN + sameValN === 0 && geo >= 4) {
                sc -= 10;
              }

              // Prima posa: bias leggero residuo (early score gia' copre multi-unico / flex)
              if (tempBoard.length === 0) {
                if (val === 1 && !prof.multiUnique) sc += 3;
              }
              return sc;
            };

            const grow = (pool, maxSteps) => {
              const tempBoard = (state.board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
              const used = new Set(tempBoard.map(b => b.card.uid));
              const order = [];
              const limit = Math.min(maxSteps, pool.length);
              for (let step = 0; step < limit; step++) {
                let best = null;
                let bestSc = -Infinity;
                const cells = [];
                for (let y = 0; y < size; y++) {
                  for (let x = 0; x < size; x++) {
                    if (tempBoard.some(b => b.x === x && b.y === y)) continue;
                    if (tempBoard.length === 0) {
                      cells.push({ x, y });
                      continue;
                    }
                    let adj = false;
                    for (const d of dirsS) {
                      if (tempBoard.some(b => b.x === x + d[0] && b.y === y + d[1])) {
                        adj = true;
                        break;
                      }
                    }
                    if (adj) cells.push({ x, y });
                  }
                }
                // Due passate: prima solo mosse set-fillable, poi fallback se nessuna
                const candidates = [];
                for (const cell of cells) {
                  for (const c of pool) {
                    if (used.has(c.uid)) continue;
                    const sim = { board: tempBoard, size, turnPlayed: 0 };
                    if (!canPlaceCardAt(sim, c, cell.x, cell.y, 1)) continue;
                    const sc = scoreSolo(cell.x, cell.y, c, tempBoard, step);
                    candidates.push({ x: cell.x, y: cell.y, card: c, sc });
                  }
                }
                candidates.sort((a, b) => b.sc - a.sc);
                const safe = candidates.filter(c => c.sc > -200);
                const pickFrom = safe.length ? safe : candidates;
                if (!pickFrom.length) break;
                best = pickFrom[0];
                bestSc = best.sc;
                used.add(best.card.uid);
                order.push(best);
                tempBoard.push({ x: best.x, y: best.y, card: best.card });
              }
              return order;
            };

            // Pool di crescita: SOLO owned (equo). Mai carte del tallone come se fossero in mano.
            const residPool = playableNow;
            if (doFullResidual && residPool.length > 0) {
              let ord = grow(residPool, emptyCount);
              if (ord.length < emptyCount && emptyCount <= 14 && residPool.length >= emptyCount) {
                const maxBt = emptyCount <= 4 ? 120000 : emptyCount <= 6 ? 80000 : emptyCount <= 10 ? 35000 : 18000;
                let btN = 0;
                let bestOrd = ord.slice();
                const baseB = (state.board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
                const empties = [];
                for (let y = 0; y < size; y++) {
                  for (let x = 0; x < size; x++) {
                    if (!baseB.some(b => b.x === x && b.y === y)) empties.push({ x, y });
                  }
                }
                const keyOf = (x, y) => x + "," + y;
                const dfs = (board, used, order) => {
                  btN++;
                  if (btN > maxBt) return false;
                  if (order.length > bestOrd.length) bestOrd = order.slice();
                  if (order.length === empties.length) return true;
                  const filled = new Set(board.map(b => keyOf(b.x, b.y)));
                  const fr = [];
                  for (const cell of empties) {
                    if (filled.has(keyOf(cell.x, cell.y))) continue;
                    let adj = board.length === 0;
                    for (const d of dirsS) {
                      if (filled.has(keyOf(cell.x + d[0], cell.y + d[1]))) adj = true;
                    }
                    if (!adj) continue;
                    fr.push(cell);
                  }
                  if (!fr.length) return false;
                  let pick = null;
                  let opts = null;
                  let minO = Infinity;
                  for (const cell of fr) {
                    const o = [];
                    const sim = { board, size, turnPlayed: 0 };
                    for (const c of residPool) {
                      if (used.has(c.uid)) continue;
                      if (canPlaceCardAt(sim, c, cell.x, cell.y, 1)) o.push(c);
                    }
                    if (!o.length) continue;
                    o.sort((a, b) => scoreSolo(cell.x, cell.y, b, board, order.length) - scoreSolo(cell.x, cell.y, a, board, order.length));
                    if (o.length < minO) {
                      minO = o.length;
                      pick = cell;
                      opts = o;
                      if (minO === 1) break;
                    }
                  }
                  if (!pick) return false;
                  const lim = Math.min(opts.length, 6);
                  for (let i = 0; i < lim; i++) {
                    const c = opts[i];
                    used.add(c.uid);
                    board.push({ x: pick.x, y: pick.y, card: c });
                    order.push({ x: pick.x, y: pick.y, card: c });
                    if (dfs(board, used, order)) return true;
                    order.pop();
                    board.pop();
                    used.delete(c.uid);
                    if (btN > maxBt) return false;
                  }
                  return false;
                };
                dfs(baseB.map(b => ({ ...b })), new Set(baseB.map(b => b.card.uid)), []);
                if (bestOrd.length > ord.length) ord = bestOrd;
              }
              if (ord.length > 0) {
                mapped = ord;
                cellPlan = ord.map(s => ({ x: s.x, y: s.y }));
                state._gnPartialMode = ord.length < emptyCount;
              }
            } else {
              // Bootstrap / mid-game: solo carte GIA' in mano (equo, replan a ogni pesca)
              const ord = grow(residPool, residPool.length);
              if (ord.length > 0) {
                mapped = ord;
                cellPlan = ord.map(s => ({ x: s.x, y: s.y }));
                state._gnPartialMode = true;
              }
            }
          }

          // Coop fullKnown: matrix-solver. Solitario: solo se tallone vuoto (altrimenti barerebbe
          // assegnando uid del tallone in un ordine di posa che assume l'ordine di pesca).
          if (
            mapped.length < 1 ||
            (!isSolo && mapped.length < targetLen) ||
            (isSolo && drawPileLen === 0 && mapped.length < emptyCount)
          ) try {
            asmResult = ms.findSchedulableMatrix(size, { maxNodesA: 2000000, maxNodesB: 500000 });
          } catch (e) {}

          if (mapped.length < targetLen && asmResult && asmResult.success && asmResult.grid && asmResult.cards) {
            const byUid = new Map(remaining.map(c => [c.uid, c]));
            const byCode = new Map();
            for (const c of remaining) {
              if (!byCode.has(c.code)) byCode.set(c.code, []);
              byCode.get(c.code).push(c);
            }
            const usedResolve = new Set();
            const resolveCard = (sc) => {
              if (!sc) return null;
              if (byUid.has(sc.uid) && !usedResolve.has(sc.uid)) {
                usedResolve.add(sc.uid);
                return byUid.get(sc.uid);
              }
              const pool = byCode.get(sc.code) || [];
              const ix = pool.findIndex(c => !usedResolve.has(c.uid));
              if (ix >= 0) {
                usedResolve.add(pool[ix].uid);
                return pool[ix];
              }
              return null;
            };
            const cellCard = new Map();
            let resolveOk = true;
            for (let y = 0; y < size; y++) {
              for (let x = 0; x < size; x++) {
                const idx = asmResult.grid[y][x];
                const card = resolveCard(asmResult.cards[idx]);
                if (!card) { resolveOk = false; break; }
                cellCard.set(x + "," + y, card);
              }
              if (!resolveOk) break;
            }

            if (resolveOk && cellCard.size === targetLen) {
              // Assembly multi-start (stesso algoritmo per ogni N): prova diverse celle
              // iniziali owned per massimizzare il prefisso safe (missing il piu' tardi possibile).
              const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
              const buildOrder = (forcedFirstKey) => {
                const order = [];
                const filled = new Set();
                const fits = (x, y, card) => {
                  if (filled.size === 0) return true;
                  let neigh = 0;
                  let ok = 0;
                  for (const d of dirs) {
                    const key = (x + d[0]) + "," + (y + d[1]);
                    if (!filled.has(key)) continue;
                    neigh++;
                    const nb = cellCard.get(key);
                    if (nb && (nb.value === card.value || nb.shape === card.shape || nb.color === card.color)) ok++;
                  }
                  return neigh > 0 && ok === neigh;
                };
                for (let step = 0; step < targetLen; step++) {
                  let cands = [];
                  if (step === 0 && forcedFirstKey && !filled.has(forcedFirstKey)) {
                    const [fx, fy] = forcedFirstKey.split(",").map(Number);
                    const card = cellCard.get(forcedFirstKey);
                    if (card && ownedUids.has(card.uid)) {
                      cands = [{ x: fx, y: fy, card, isOwned: true, key: forcedFirstKey }];
                    }
                  }
                  if (cands.length === 0) {
                    for (let y = 0; y < size; y++) {
                      for (let x = 0; x < size; x++) {
                        const key = x + "," + y;
                        if (filled.has(key)) continue;
                        const card = cellCard.get(key);
                        if (!card || !fits(x, y, card)) continue;
                        const isOwned = ownedUids.has(card.uid);
                        if (step < minLateForTallone && !isOwned) continue;
                        cands.push({ x, y, card, isOwned, key });
                      }
                    }
                  }
                  if (cands.length === 0) {
                    for (let y = 0; y < size; y++) {
                      for (let x = 0; x < size; x++) {
                        const key = x + "," + y;
                        if (filled.has(key)) continue;
                        const card = cellCard.get(key);
                        if (!card || !fits(x, y, card)) continue;
                        cands.push({ x, y, card, isOwned: ownedUids.has(card.uid), key });
                      }
                    }
                  }
                  if (cands.length === 0) return null;
                  cands.sort((a, b) => (b.isOwned ? 1 : 0) - (a.isOwned ? 1 : 0));
                  const pick = cands[0];
                  filled.add(pick.key);
                  order.push({ x: pick.x, y: pick.y, card: pick.card });
                }
                return order;
              };
              const firstUnknownIdx = (ord) => {
                for (let i = 0; i < ord.length; i++) {
                  if (!ownedUids.has(ord[i].card.uid)) return i;
                }
                return ord.length;
              };
              let best = null;
              let bestScore = -1;
              const starts = [null];
              for (const [key, card] of cellCard) {
                if (ownedUids.has(card.uid)) starts.push(key);
              }
              // Limita tentativi (N=8 ha 64 celle): primi 1+fino a 24 owned starts
              const maxStarts = Math.min(starts.length, isSolo ? 40 : 25);
              for (let si = 0; si < maxStarts; si++) {
                const ord = buildOrder(starts[si]);
                if (!ord || ord.length !== targetLen) continue;
                const fui = firstUnknownIdx(ord);
                const soloOk = !isSolo || gnSoloIsPlanSchedulable(state, ord);
                // Solitario: non scartare i non-FIFO (replan a pesca); solo preferiscili
                const score = fui * 10 + (fui >= minLateForTallone ? 1000 : 0) + (soloOk ? 5000 : 0);
                if (score > bestScore) {
                  bestScore = score;
                  best = ord;
                  if (fui >= minLateForTallone && soloOk) break;
                }
              }
              if (best) {
                mapped = best;
                cellPlan = best.map(s => ({ x: s.x, y: s.y }));
              }
            }
            // Solitario equo: tieni solo step con carte GIA' owned (niente piano su tallone)
            if (isSolo && mapped.length > 0 && drawPileLen > 0) {
              mapped = mapped.filter(s => s && s.card && ownedUids.has(s.card.uid));
              cellPlan = mapped.map(s => ({ x: s.x, y: s.y }));
              state._gnPartialMode = true;
            }
            // Fallback: ordine assembly del solver (getTargetPlan) con remap uid
            if (mapped.length < targetLen) {
              const p = ms.getTargetPlan(asmResult);
              if (p && p.length === targetLen) {
                const used = new Set();
                const m = [];
                for (const s of p) {
                  let card = null;
                  if (s.card && byUid.has(s.card.uid) && !used.has(s.card.uid)) card = byUid.get(s.card.uid);
                  else if (s.card && byCode.has(s.card.code)) {
                    const pool = byCode.get(s.card.code);
                    const ix = pool.findIndex(c => !used.has(c.uid));
                    if (ix >= 0) card = pool[ix];
                  }
                  if (!card) { m.length = 0; break; }
                  used.add(card.uid);
                  m.push({ x: s.x, y: s.y, card });
                }
                if (m.length === targetLen) {
                  mapped = m;
                  cellPlan = m.map(s => ({ x: s.x, y: s.y }));
                }
              }
            }
          }
          // Solitario equo: Niente assembly basato su ordine FIFO reale del tallone (era cheating).
          if (isSolo && mapped.length > 0 && drawPileLen > 0) {
            mapped = mapped.filter(s => s && s.card && ownedUids.has(s.card.uid));
            cellPlan = mapped.map(s => ({ x: s.x, y: s.y }));
            state._gnPartialMode = true;
          }
          if (cellPlan.length === 0) {
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cellPlan.push({ x, y });
          }

          // Mid-game fullKnown coop: piano residuo sul board reale con DFS/MRV (backtrack).
          // Solitario: gestito sopra (bootstrap/residuale densita').
          if ((state.board || []).length > 0 && !isSolo) {
            const baseBoard = (state.board || []).map(b => ({
              x: b.x, y: b.y, card: b.card
            }));
            const pool = remaining.slice();
            const emptyCells = [];
            for (let y = 0; y < size; y++) {
              for (let x = 0; x < size; x++) {
                if (!baseBoard.some(b => b.x === x && b.y === y)) emptyCells.push({ x, y });
              }
            }
            const dirs4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            const keyOf = (x, y) => x + "," + y;
            const nEmpty = emptyCells.length;
            const adjCount = (c, board) => {
              let n = 0;
              for (const d of dirs4) {
                if (board.some(t => t.x === c.x + d[0] && t.y === c.y + d[1])) n++;
              }
              return n;
            };

            // 1) Greedy veloce (sempre)
            const greedy = () => {
              const tempBoard = baseBoard.map(b => ({ x: b.x, y: b.y, card: b.card }));
              const usedR = new Set();
              const remOrder = [];
              while (remOrder.length < nEmpty) {
                let best = null;
                let bestSc = -Infinity;
                for (const cell of emptyCells) {
                  if (remOrder.some(s => s.x === cell.x && s.y === cell.y)) continue;
                  const ac = adjCount(cell, tempBoard);
                  if (tempBoard.length > 0 && ac === 0) continue;
                  for (const c of pool) {
                    if (usedR.has(c.uid)) continue;
                    const sim = { board: tempBoard, size, turnPlayed: 0 };
                    if (!canPlaceCardAt(sim, c, cell.x, cell.y, 1)) continue;
                    const isOwned = ownedUids.has(c.uid);
                    const sc = (isOwned ? 20 : 0) + ac * 3;
                    if (sc > bestSc) {
                      bestSc = sc;
                      best = { x: cell.x, y: cell.y, card: c };
                    }
                  }
                }
                if (!best) break;
                usedR.add(best.card.uid);
                remOrder.push(best);
                tempBoard.push({ x: best.x, y: best.y, card: best.card });
              }
              return remOrder;
            };

            let bestOrder = greedy();

            // 2) DFS/MRV solo se greedy incompleto e code corte
            if (bestOrder.length < nEmpty && nEmpty <= 12) {
              const maxBtNodes = nEmpty <= 6 ? 60000 : nEmpty <= 9 ? 25000 : 10000;
              let btNodes = 0;
              let dfsBest = bestOrder.slice();
              const legalCardsFor = (board, cell, used) => {
                const out = [];
                const sim = { board, size, turnPlayed: 0 };
                for (const c of pool) {
                  if (used.has(c.uid)) continue;
                  if (canPlaceCardAt(sim, c, cell.x, cell.y, 1)) out.push(c);
                }
                out.sort((a, b) => (ownedUids.has(b.uid) ? 1 : 0) - (ownedUids.has(a.uid) ? 1 : 0));
                return out;
              };
              const frontierCells = (board, placedKeys) => {
                const filled = new Set(board.map(b => keyOf(b.x, b.y)));
                for (const k of placedKeys) filled.add(k);
                const out = [];
                for (const cell of emptyCells) {
                  const k = keyOf(cell.x, cell.y);
                  if (filled.has(k)) continue;
                  let adj = false;
                  for (const d of dirs4) {
                    if (filled.has(keyOf(cell.x + d[0], cell.y + d[1]))) {
                      adj = true;
                      break;
                    }
                  }
                  if (adj || board.length === 0) out.push(cell);
                }
                return out;
              };
              const dfs = (board, used, order, placedKeys) => {
                btNodes++;
                if (btNodes > maxBtNodes) return false;
                if (order.length > dfsBest.length) dfsBest = order.slice();
                if (order.length === nEmpty) return true;
                const fr = frontierCells(board, placedKeys);
                if (!fr.length) return false;
                let pickCell = null;
                let pickOpts = null;
                let minOpts = Infinity;
                for (const cell of fr) {
                  const opts = legalCardsFor(board, cell, used);
                  if (!opts.length) continue;
                  if (opts.length < minOpts) {
                    minOpts = opts.length;
                    pickCell = cell;
                    pickOpts = opts;
                    if (minOpts === 1) break;
                  }
                }
                if (!pickCell) return false;
                const limit = Math.min(pickOpts.length, 8);
                for (let oi = 0; oi < limit; oi++) {
                  const c = pickOpts[oi];
                  used.add(c.uid);
                  board.push({ x: pickCell.x, y: pickCell.y, card: c });
                  order.push({ x: pickCell.x, y: pickCell.y, card: c });
                  placedKeys.add(keyOf(pickCell.x, pickCell.y));
                  if (dfs(board, used, order, placedKeys)) return true;
                  placedKeys.delete(keyOf(pickCell.x, pickCell.y));
                  order.pop();
                  board.pop();
                  used.delete(c.uid);
                  if (btNodes > maxBtNodes) return false;
                }
                return false;
              };
              const boardWork = baseBoard.map(b => ({ x: b.x, y: b.y, card: b.card }));
              dfs(boardWork, new Set(), [], new Set());
              if (dfsBest.length > bestOrder.length) bestOrder = dfsBest;
            }

            if (bestOrder.length === nEmpty && nEmpty > 0) {
              mapped = bestOrder;
              cellPlan = bestOrder.map(s => ({ x: s.x, y: s.y }));
              state._gnPartialMode = false;
            } else if (bestOrder.length > 0) {
              mapped = bestOrder;
              const filledK = new Set(bestOrder.map(s => keyOf(s.x, s.y)));
              cellPlan = [
                ...bestOrder.map(s => ({ x: s.x, y: s.y })),
                ...emptyCells.filter(c => !filledK.has(keyOf(c.x, c.y)))
              ];
              state._gnPartialMode = true;
            } else {
              mapped = [];
            }
          }

          if (mapped.length > 0 && mapped[0].card) {
            state._gnFullSequence = mapped;
            state._gnSeqIdx = 0;
            state._gnTargetCellSequence = (cellPlan.length ? cellPlan : mapped).map(s => ({ x: s.x, y: s.y }));
            state._gnPlanAtPlaced = placedNow;
            state._gnPlanDrawLen = drawPileLen;
          } else {
            state._gnTargetCellSequence = cellPlan.map(s => ({ x: s.x, y: s.y }));
            state._gnSeqIdx = 0;
            state._gnFullSequence = null;
            state._gnPlanAtPlaced = placedNow;
            state._gnPlanDrawLen = drawPileLen;
          }
        } else {
          // === G>1, G<N, tallone grande: prefisso OWNED + scheletro celle (no uid del tallone) ===
          // Senza pool condiviso. Replan periodico / a pesca; handoff a fullKnown quando draw < G.
          state._gnPartialMode = true;
          let cellPlan = null;
          try {
            const asm = ms.findSchedulableMatrix(size, { maxNodesA: 2000000, maxNodesB: 500000 });
            if (asm && asm.success) {
              const p = ms.getTargetPlan(asm);
              if (p && p.length === targetLen) {
                cellPlan = p.map(s => ({ x: s.x, y: s.y }));
              }
            }
          } catch (e) {}
          if (!cellPlan) {
            cellPlan = [];
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cellPlan.push({ x, y });
          }
          // Solo celle ancora vuote nello scheletro
          const emptyPlan = cellPlan.filter(
            t => !(state.board || []).some(b => b.x === t.x && b.y === t.y)
          );
          const ownedCards = [];
          for (let p = 0; p < (state.hands || []).length; p++) {
            if (state.hands[p]) ownedCards.push(...state.hands[p].map(c => ({ ...c })));
          }
          const usedO = new Set();
          const tempBoard = (state.board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
          const prefix = [];
          // Prefisso: per ogni cella dello scheletro (o frontiera), assegna una owned legale
          for (let i = 0; i < emptyPlan.length; i++) {
            const t = emptyPlan[i];
            let best = null;
            let bestSc = -Infinity;
            for (const c of ownedCards) {
              if (usedO.has(c.uid)) continue;
              const sim = { board: tempBoard, size, turnPlayed: 0 };
              if (!canPlaceCardAt(sim, c, t.x, t.y, 1)) continue;
              // Soft: valori bassi early se core, alti late (N-agnostic soft)
              const val = Number(c.value) || 0;
              const coreish = i < Math.floor(emptyPlan.length * 0.55);
              let sc = coreish ? (10 - val) : val;
              // Clustering soft
              for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nb = tempBoard.find(b => b.x === t.x + d[0] && b.y === t.y + d[1]);
                if (!nb) continue;
                if (nb.card.value === c.value) sc += 4;
                if (nb.card.shape === c.shape) sc += 2;
                if (nb.card.color === c.color) sc += 2;
              }
              if (sc > bestSc) {
                bestSc = sc;
                best = c;
              }
            }
            if (!best) break; // stop al primo buco: prefisso connesso solo sulle owned legali in ordine scheletro
            usedO.add(best.uid);
            prefix.push({ x: t.x, y: t.y, card: best });
            tempBoard.push({ x: t.x, y: t.y, card: best });
          }
          // Se prefisso vuoto (board vuota e scheletro non matcha owned): bootstrap 1+ owned ovunque legali
          if (prefix.length === 0 && ownedCards.length > 0) {
            const sim0 = { board: tempBoard, size, turnPlayed: 0 };
            for (const c of ownedCards) {
              if (tempBoard.length === 0) {
                prefix.push({ x: Math.floor(size / 2), y: Math.floor(size / 2), card: c });
                tempBoard.push({ x: Math.floor(size / 2), y: Math.floor(size / 2), card: c });
                usedO.add(c.uid);
                break;
              }
            }
            // estendi frontiera
            let grew = true;
            while (grew) {
              grew = false;
              for (const c of ownedCards) {
                if (usedO.has(c.uid)) continue;
                const legs = [];
                // prova celle candidate vicine
                for (const b of tempBoard) {
                  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const x = b.x + d[0];
                    const y = b.y + d[1];
                    if (x < 0 || y < 0 || x >= size || y >= size) continue;
                    if (tempBoard.some(t => t.x === x && t.y === y)) continue;
                    const sim = { board: tempBoard, size, turnPlayed: 0 };
                    if (canPlaceCardAt(sim, c, x, y, 1)) legs.push({ x, y, card: c });
                  }
                }
                if (legs.length > 0) {
                  const pick = legs[0];
                  usedO.add(c.uid);
                  prefix.push(pick);
                  tempBoard.push({ x: pick.x, y: pick.y, card: pick.card });
                  grew = true;
                  break;
                }
              }
            }
          }

          if (prefix.length > 0) {
            state._gnFullSequence = prefix;
            state._gnSeqIdx = 0;
          } else {
            state._gnFullSequence = null;
          }
          state._gnTargetCellSequence = emptyPlan.length ? emptyPlan : cellPlan;
          state._gnSeqIdx = 0;
          state._gnPlanAtPlaced = placedNow;
          state._gnPlanDrawLen = drawPileLen;
        }
      } catch (e) {
        // fallback silenzioso
      }
      } // needPlan
    } // coordinated && G>1


    // Pianificazione PRIMA del follow (altrimenti handoff fullKnown non scatta e si resta sul prefisso stale).
    // Blocco completo: vedi sotto "ONE MIND vs mazzo — path unificato" (needPlan).
    // Qui solo flag early per oracle path dopo eventuale replan.
    const drawPileLenEarly = (state.drawPile || []).length;
    const playersEarly = state.players || 1;
    // (planning inject point — eseguito subito sotto se G>1)

    // === PATH UNICO G>=N / smallTallone (stesso per OGNI N = 3..8) ===
    // Set carte noto (G=N oppure tallone < G per eliminazione). Niente DFS per-turno N-specifico:
    // un solo algoritmo = piano A+B una volta + follow strict + passi. Search solo finish
    // opzionale uguale per tutti gli N quando restano poche celle.
    const smallTallone = drawPileLenEarly < playersEarly;
    const useOraclePlanPath = coordinated && (perfectGNLive || smallTallone);
    // Finish search: senza fullSeq sana (non rompere G>=N).
    // Solitario: SOLO ricerca equa (niente fork che pesca con ordine reale del tallone).
    if (coordinated) {
      const remainingCells = (state.size * state.size) - ((state.board && state.board.length) || 0);
      const hasWorkingFullSeq =
        state._gnFullSequence &&
        state._gnFullSequence[0] &&
        state._gnFullSequence[0].card &&
        !state._gnPartialMode;
      const gLessN = (state.players || 1) < state.size;
      // Solitario equo legacy: deep search in coda. Virtual-multi: no (path come G=2).
      const deepEmpty =
        soloCoordinated && !virtualMulti && state.size >= 7 ? 12 : 10;
      if (
        soloCoordinated &&
        !virtualMulti &&
        remainingCells > 0 &&
        remainingCells <= deepEmpty
      ) {
        const deep = gnSoloFairDeepSearch(state, playerId, {
          maxEmpty: deepEmpty,
          maxNodes:
            remainingCells <= 4
              ? 180000
              : remainingCells <= 6
                ? 100000
                : remainingCells <= 10
                  ? 50000
                  : 28000
        });
        if (deep) return deep;
      }
      if (
        soloCoordinated &&
        !virtualMulti &&
        remainingCells > 0 &&
        (state.durissimaPeekTopDraw === true || remainingCells <= 12)
      ) {
        const fair = gnSoloFairFinishAction(state, playerId);
        if (fair) return fair;
      }
      // Finish DFS solo a tallone vuoto (niente oracolo sull'ordine di pesca)
      const wantFinish =
        remainingCells > 0 &&
        remainingCells <= 6 &&
        !soloCoordinated &&
        gnSearchMayUseDrawPile(state) &&
        (!hasWorkingFullSeq || (gLessN && remainingCells <= 4));
      if (wantFinish) {
        const searchOpts = gnMoveSearchOptions(state, { coordinatedTeam: true });
        if (searchOpts) {
          let boost = remainingCells <= 3 ? 300000 : remainingCells <= 5 ? 150000 : 80000;
          if (gLessN && remainingCells <= 4) boost = Math.max(boost, 350000);
          searchOpts.maxNodes = Math.max(searchOpts.maxNodes || 0, boost);
          const fork = gnForkSearchState(state);
          const outcome = solveGnStateOutcome(fork, {
            ...searchOpts,
            _gnInPlace: true,
            trackAction: true,
            coordinatedTeam: true
          });
          if (outcome.result === "solved" && outcome.action) return outcome.action;
        }
      }
    }
    // Virtual-multi: stesso ingresso del multi (solo useOraclePlanPath), non del solo legacy.
    if (useOraclePlanPath || (soloCoordinated && !virtualMulti)) {
      // Strict follow se piano sano; se step illegale/stale → abilita flex (no stuck).
      // Solitario: carta da mano o riserva N.
      if (state._gnFullSequence && state._gnFullSequence.length > 0) {
        const seq = state._gnFullSequence;
        for (let i = 0; i < seq.length; i++) {
          const step = seq[i];
          if (state.board.some(b => b.x === step.x && b.y === step.y)) continue;
          if (!step.card) break;
          const placeOk = canPlaceCardAt(state, step.card, step.x, step.y, 1);
          const somewhere = gnCardStillSomewhere(state, step.card.uid);
          if (!placeOk || !somewhere) {
            state._gnPartialMode = true;
            state._gnFullSequence = null;
            break;
          }
          const playable = gnFindPlayableForUid(state, playerId, step.card.uid);
          if (playable && canPlaceCardAt(state, playable.card, step.x, step.y, requirement)) {
            const seqMove = {
              cardUid: playable.card.uid,
              card: playable.card,
              x: step.x,
              y: step.y,
              fromReserve: playable.fromReserve === true,
              fromFreeCell: playable.fromFreeCell === true,
              freeCellIndex: playable.freeCellIndex
            };
            // Solitario: non seguire il piano se 1-ply dice trappola (0 safe residuali)
            if (soloCoordinated && gnSoloMoveIsTrappedOutlook(state, seqMove)) {
              state._gnPartialMode = true;
              state._gnFullSequence = null;
              break;
            }
            state._gnSeqIdx = i + 1;
            state._gnJustPlayedSeqStep = true;
            return { type: "move", move: seqMove };
          }
          // Solitario: se lo step early non e' in mano, cerca il primo step successivo giocabile ora
          if (soloCoordinated) {
            for (let j = i + 1; j < seq.length; j++) {
              const st2 = seq[j];
              if (state.board.some(b => b.x === st2.x && b.y === st2.y)) continue;
              if (!st2.card) continue;
              const pl2 = gnFindPlayableForUid(state, playerId, st2.card.uid);
              if (pl2 && canPlaceCardAt(state, pl2.card, st2.x, st2.y, requirement)) {
                const seqMove2 = {
                  cardUid: pl2.card.uid,
                  card: pl2.card,
                  x: st2.x,
                  y: st2.y,
                  fromReserve: pl2.fromReserve === true,
                  fromFreeCell: pl2.fromFreeCell === true,
                  freeCellIndex: pl2.freeCellIndex
                };
                if (gnSoloMoveIsTrappedOutlook(state, seqMove2)) continue;
                state._gnSeqIdx = j + 1;
                state._gnJustPlayedSeqStep = true;
                return { type: "move", move: seqMove2 };
              }
            }
            // nessun step del piano giocabile: flex realistico
            state._gnPartialMode = true;
            break;
          }
          break;
        }
      }
    }

    // Force 1-card activations for sequence following (ensures req=1, sup>=1 safe for any valid growth seq).
    if (coordinated && state._gnJustPlayedSeqStep) {
      state._gnJustPlayedSeqStep = false;
      return { type: "stop" };
    }

    // === LOGICA PER G >= N o tallone piccolo (< G): segui percorso ideale di celle o piano specifico ===
    // Piazziamo la migliore carta disponibile nella mano che si adatta alla cella target più precoce (o la carta esatta del piano specifico).
    // Non usiamo l'ordine del tallone. Quando il tallone è piccolo (< G) il set rimanente è noto per eliminazione;
    // aggiorniamo man mano che nuove carte arrivano (il tallone si esaurisce in fretta).
    // Per piani con carte specifiche (G=N o small tallone), usa follow stretto hasCards.
    // Per tallone grande, usa logica flessibile su celle target.
    if (coordinated && state._gnFullSequence && state._gnFullSequence.length > 0 && state._gnFullSequence[0].card) {
      // Strict follow: earliest pending + uid esatto (mano o riserva). Pass se titolare altro.
      const seq = state._gnFullSequence;
      let pending = false;
      for (let i = 0; i < seq.length; i++) {
        const step = seq[i];
        if (state.board.some(b => b.x === step.x && b.y === step.y)) continue;
        pending = true;
        if (!step.card) break;
        const placeOk = canPlaceCardAt(state, step.card, step.x, step.y, 1);
        const somewhere = gnCardStillSomewhere(state, step.card.uid);
        if (!placeOk || !somewhere) {
          state._gnPartialMode = true;
          state._gnFullSequence = null;
          pending = false;
          break;
        }
        const playable = gnFindPlayableForUid(state, playerId, step.card.uid);
        if (playable && canPlaceCardAt(state, playable.card, step.x, step.y, requirement)) {
          const seqMove = {
            cardUid: playable.card.uid,
            card: playable.card,
            x: step.x,
            y: step.y,
            fromReserve: playable.fromReserve === true,
            fromFreeCell: playable.fromFreeCell === true,
            freeCellIndex: playable.freeCellIndex
          };
          if (
            soloCoordinated &&
            !virtualMulti &&
            gnSoloMoveIsTrappedOutlook(state, seqMove)
          ) {
            state._gnPartialMode = true;
            state._gnFullSequence = null;
            pending = false;
            break;
          }
          state._gnSeqIdx = i + 1;
          state._gnJustPlayedSeqStep = true;
          return { type: "move", move: seqMove };
        }
        // Solo legacy: salta avanti nel piano. Virtual-multi / multi: stop (pass di fatto).
        if (soloCoordinated && !virtualMulti) {
          for (let j = i + 1; j < seq.length; j++) {
            const st2 = seq[j];
            if (state.board.some(b => b.x === st2.x && b.y === st2.y)) continue;
            if (!st2.card) continue;
            const pl2 = gnFindPlayableForUid(state, playerId, st2.card.uid);
            if (pl2 && canPlaceCardAt(state, pl2.card, st2.x, st2.y, requirement)) {
              const seqMove2 = {
                cardUid: pl2.card.uid,
                card: pl2.card,
                x: st2.x,
                y: st2.y,
                fromReserve: pl2.fromReserve === true,
                fromFreeCell: pl2.fromFreeCell === true,
                freeCellIndex: pl2.freeCellIndex
              };
              if (gnSoloMoveIsTrappedOutlook(state, seqMove2)) continue;
              state._gnSeqIdx = j + 1;
              state._gnJustPlayedSeqStep = true;
              return { type: "move", move: seqMove2 };
            }
          }
          state._gnPartialMode = true;
          pending = false;
          break;
        }
        return { type: "stop" };
      }
      if (pending && !state._gnPartialMode) return { type: "stop" };
    }

    if (coordinated && !perfectGNLive) {
      let targetSeq = state._gnTargetCellSequence;
      if (!targetSeq && state._gnFullSequence) {
        targetSeq = state._gnFullSequence.map(s => ({ x: s.x, y: s.y }));
      }
      if (targetSeq && targetSeq.length > 0) {
        const myHand = state.hands[playerId] || [];
        const legals = legalPlacements(state, playerId, requirement);

        // Find the *earliest* pending target cell (by plan order) for which I have a legal fit now.
        // Do not stop at the first pending if I can't fill it; scan for any reachable in the priority list.
        // This makes the plan a "preferred cell priority" rather than rigid sequence, allowing higher completion
        // while still following a good global layout (chosen with owned-safe prefix in mind for small tallone).
        let bestI = -1;
        let bestFit = null;
        for (let i = 0; i < targetSeq.length; i++) {
          const t = targetSeq[i];
          if (state.board.some(b => b.x === t.x && b.y === t.y)) continue;
          const fits = legals.filter(m => m.x === t.x && m.y === t.y);
          if (fits.length > 0) {
            if (bestI < 0 || i < bestI) {
              bestI = i;
              bestFit = fits[0];
            }
          }
        }
        if (bestFit) {
          state._gnSeqIdx = bestI + 1;
          state._gnJustPlayedSeqStep = true;
          return { type: "move", move: bestFit };
        }

        // No immediate plan cell fillable now: fall through to realistico (with plan bias below) so we always play if any legal.
        // The targetSeq remains for future bias / prioritization.
      }
    }

    // If we have (or just set) a gn plan/seq for ideal or smallTallone, drive the action from it
    // on this turn too (planning runs late in the function). This restores plan-once + strict follow.
    if (coordinated && (state._gnFullSequence || state._gnTargetCellSequence)) {
      const legalsP = legalPlacements(state, playerId, requirement);
      if (state._gnFullSequence && state._gnFullSequence.length > 0 && state._gnFullSequence[0] && state._gnFullSequence[0].card) {
        const seq = state._gnFullSequence;
        let pending = false;
        for (let i = 0; i < seq.length; i++) {
          const step = seq[i];
          if (state.board.some(b => b.x === step.x && b.y === step.y)) continue;
          pending = true;
          if (!step.card) break;
          const placeOk = canPlaceCardAt(state, step.card, step.x, step.y, 1);
          const somewhere = gnCardStillSomewhere(state, step.card.uid);
          if (!placeOk || !somewhere) {
            state._gnPartialMode = true;
            state._gnFullSequence = null;
            pending = false;
            break;
          }
          const playable = gnFindPlayableForUid(state, playerId, step.card.uid);
          if (playable && canPlaceCardAt(state, playable.card, step.x, step.y, requirement)) {
            const seqMove = {
              cardUid: playable.card.uid,
              card: playable.card,
              x: step.x,
              y: step.y,
              fromReserve: playable.fromReserve === true,
              fromFreeCell: playable.fromFreeCell === true,
              freeCellIndex: playable.freeCellIndex
            };
            if (soloCoordinated && gnSoloMoveIsTrappedOutlook(state, seqMove)) {
              state._gnPartialMode = true;
              state._gnFullSequence = null;
              pending = false;
              break;
            }
            state._gnSeqIdx = i + 1;
            state._gnJustPlayedSeqStep = true;
            return { type: "move", move: seqMove };
          }
          if (soloCoordinated) {
            for (let j = i + 1; j < seq.length; j++) {
              const st2 = seq[j];
              if (state.board.some(b => b.x === st2.x && b.y === st2.y)) continue;
              if (!st2.card) continue;
              const pl2 = gnFindPlayableForUid(state, playerId, st2.card.uid);
              if (pl2 && canPlaceCardAt(state, pl2.card, st2.x, st2.y, requirement)) {
                const seqMove2 = {
                  cardUid: pl2.card.uid,
                  card: pl2.card,
                  x: st2.x,
                  y: st2.y,
                  fromReserve: pl2.fromReserve === true,
                  fromFreeCell: pl2.fromFreeCell === true,
                  freeCellIndex: pl2.freeCellIndex
                };
                if (gnSoloMoveIsTrappedOutlook(state, seqMove2)) continue;
                state._gnSeqIdx = j + 1;
                state._gnJustPlayedSeqStep = true;
                return { type: "move", move: seqMove2 };
              }
            }
            state._gnPartialMode = true;
            pending = false;
            break;
          }
          return { type: "stop" };
        }
        if (pending && !state._gnPartialMode) return { type: "stop" };
      }
      if (state._gnTargetCellSequence && state._gnTargetCellSequence.length > 0) {
        // blockTarget solo se fullSeq sana e non partial
        const blockTarget =
          state._gnFullSequence &&
          state._gnFullSequence[0] &&
          state._gnFullSequence[0].card &&
          !state._gnPartialMode &&
          state._gnFullSequence.some(
            s => s.card && !(state.board || []).some(b => b.x === s.x && b.y === s.y)
          );
        if (!blockTarget) {
          const tseq = state._gnTargetCellSequence;
          let bestI = -1;
          let bestFit = null;
          for (let i = 0; i < tseq.length; i++) {
            const t = tseq[i];
            if (state.board.some(b => b.x === t.x && b.y === t.y)) continue;
            const fits = legalsP.filter(m => m.x === t.x && m.y === t.y);
            if (fits.length > 0) {
              if (bestI < 0 || i < bestI) {
                bestI = i;
                bestFit = fits[0];
              }
            }
          }
          if (bestFit) {
            state._gnSeqIdx = bestI + 1;
            state._gnJustPlayedSeqStep = true;
            return { type: "move", move: bestFit };
          }
        }
        // fall to realistico (plan bias will apply)
      }
    }

    // === COORDINATORE "MIGLIOR UMANO" REALISTICO ===
    // Conosce ESATTAMENTE il set delle carte (tutto il mazzo in solitario/coop).
    // Usa "cosa fare" + "cosa non fare".
    // Componente statistica (P pesca basata su conteggi rimanenti).
    // Approximate lookahead (1 passo con note attuali).
    // Non usa mai l'ordine esatto del tallone.
    if (coordinated) {
      let legals = legalPlacements(state, playerId, requirement);
      if (legals.length === 0) {
        if (soloCoordinated) {
          const parkAct = gnSoloChooseParkAction(state, playerId);
          if (parkAct) return parkAct;
        }
        return { type: "stop" };
      }

      const known = [];
      for (let p = 0; p < state.hands.length; p++) if (state.hands[p]) known.push(...state.hands[p]);
      if (state.durissimaReserve) known.push(...state.durissimaReserve);
      if (isDurissimaFreeCellsEnabled(state)) {
        for (const c of state.durissimaFreeCells) if (c) known.push(c);
      }
      const unk = state.drawPile || [];
      const counts = {};
      ['shape','color','value'].forEach(tr => {
        counts[tr] = {};
        [...known, ...unk].forEach(c => counts[tr][c[tr]] = (counts[tr][c[tr]]||0)+1);
      });

      const emptyLeft = (state.size * state.size) - ((state.board && state.board.length) || 0);
      const poolLeft = [...known, ...unk].filter(c => c && c.uid !== undefined);

      // Solitario + freecell: non posare mosse che creano tasca morta se esiste alternativa.
      // Se tutte creano tasca e c'e' slot free: park (proattivo) invece di suicidarsi.
      if (soloCoordinated && isDurissimaFreeCellsEnabled(state) && emptyLeft > 4) {
        const safeLegals = [];
        let leastRisk = null;
        let leastRiskVal = Infinity;
        for (let i = 0; i < legals.length; i++) {
          const m = legals[i];
          const pr = gnSoloMovePocketRisk(
            state.board || [],
            state.size,
            poolLeft,
            m.card,
            m.x,
            m.y
          );
          if (!pr.dead) safeLegals.push(m);
          if ((pr.risk || 0) < leastRiskVal) {
            leastRiskVal = pr.risk || 0;
            leastRisk = m;
          }
        }
        if (safeLegals.length > 0) {
          legals = safeLegals;
        } else {
          const parkAct = gnSoloProactiveParkAction(state, playerId) ||
            gnSoloChooseParkAction(state, playerId);
          if (parkAct) return parkAct;
          if (leastRisk) legals = [leastRisk];
        }
      }
      // Lookahead anti-buco + "greedy residual complete?"
      const residualGreedyComplete = (board0, pool0) => {
        const board = board0.map(b => ({ x: b.x, y: b.y, card: b.card }));
        const used = new Set(board.map(b => b.card.uid));
        const size = state.size;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let guard = 0;
        while (guard++ < size * size) {
          const empties = [];
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              if (!board.some(b => b.x === x && b.y === y)) empties.push({ x, y });
            }
          }
          if (empties.length === 0) return true;
          let best = null;
          for (const cell of empties) {
            let adj = 0;
            for (const d of dirs) {
              if (board.some(b => b.x === cell.x + d[0] && b.y === cell.y + d[1])) adj++;
            }
            if (board.length > 0 && adj === 0) continue;
            for (const c of pool0) {
              if (used.has(c.uid)) continue;
              const sim = { board, size, turnPlayed: 0 };
              if (!canPlaceCardAt(sim, c, cell.x, cell.y, 1)) continue;
              best = { cell, c, adj };
              break;
            }
            if (best) break;
          }
          if (!best) return false;
          used.add(best.c.uid);
          board.push({ x: best.cell.x, y: best.cell.y, card: best.c });
        }
        return false;
      };
      const holePenalty = (move) => {
        const board2 = (state.board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
        board2.push({ x: move.x, y: move.y, card: move.card });
        const pool2 = poolLeft.filter(c => c && c.uid !== move.card.uid);
        // Solitario: anti-pocket su coordinate libere (sempre, non solo coda)
        if (soloCoordinated) {
          const pr = gnSoloMovePocketRisk(
            state.board || [],
            state.size,
            poolLeft,
            move.card,
            move.x,
            move.y
          );
          let sc = 0;
          if (pr.dead) sc -= 900 + Math.min(500, pr.risk);
          else sc -= Math.min(180, pr.risk * 0.5);
          if (emptyLeft <= 7) {
            if (residualGreedyComplete(board2, pool2)) sc += 200;
            else if (emptyLeft <= 4) sc -= 50;
          }
          return sc;
        }
        // Coop: logica precedente (griglia 0..N-1, solo coda)
        if (emptyLeft > 10) return 0;
        const used = new Set([move.card.uid]);
        const size = state.size;
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        let unfillable = 0;
        let fillable = 0;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (board2.some(b => b.x === x && b.y === y)) continue;
            let adj = 0;
            for (const d of dirs) {
              if (board2.some(b => b.x === x + d[0] && b.y === y + d[1])) adj++;
            }
            if (adj === 0 && board2.length > 0) continue;
            const sim = { board: board2, size, turnPlayed: 0 };
            let ok = false;
            for (const c of poolLeft) {
              if (used.has(c.uid) || c.uid === move.card.uid) continue;
              if (canPlaceCardAt(sim, c, x, y, 1)) {
                ok = true;
                break;
              }
            }
            if (ok) fillable++;
            else if (adj > 0) unfillable++;
          }
        }
        let sc = 0;
        if (unfillable > 0) sc -= 80 * unfillable;
        if (emptyLeft <= 6) sc += fillable * 3;
        if (emptyLeft <= 7) {
          if (residualGreedyComplete(board2, pool2)) sc += 200;
          else if (emptyLeft <= 4) sc -= 50;
        }
        return sc;
      };
      const score = (move) => {
        const card = move.card;
        let sc = 0;

        // Endgame aggressivo: con pochi vuoti, chiudere conta piu' delle euristiche midgame
        if (emptyLeft <= 8) sc += 40;
        if (emptyLeft <= 5) sc += 35;
        if (emptyLeft <= 3) sc += 40;
        sc += holePenalty(move);
        // Solitario: tratti piu' numerosi (spesso valore alto su N<8) → late + cluster
        if (soloCoordinated) {
          const filled = (state.board && state.board.length) || 0;
          const total = state.size * state.size;
          const close = emptyLeft <= Math.max(6, Math.floor(state.size * 1.2));
          // densita' valore residuo (mano+riserva+tallone)
          const vCnt = {};
          [...known, ...unk].forEach(c => {
            if (c && c.uid !== card.uid) vCnt[c.value] = (vCnt[c.value] || 0) + 1;
          });
          vCnt[card.value] = (vCnt[card.value] || 0) + 1;
          let maxC = 1;
          Object.keys(vCnt).forEach(k => { if (vCnt[k] > maxC) maxC = vCnt[k]; });
          const abundant = (vCnt[card.value] || 0) >= maxC;
          if (!close) {
            if (abundant) sc -= 14;
            sc += (state.size + 1 - (Number(card.value) || 0)) * 2;
          } else if (abundant) {
            sc += 10;
          }
          // Refill-to-N: catene utili (posa K => pesca K). Preferisci estendere se safe.
          if (isDurissimaRefillToNEnabled(state) && state.turnPlayed >= 1) {
            sc += 6;
            // 5a posa (Idea): forte se pezzo hard in "buco" a 4 vicini
            if (state.turnPlayed === 4) {
              sc += 22;
              const nb = move.neighbors != null ? move.neighbors : 0;
              if (nb >= 4) {
                const leftResid = [...known, ...unk];
                const stR = gnSoloBuildResidStats(leftResid);
                const prf = gnSoloCardAxisProfile(card, stR);
                if (gnSoloProfileIsHard(prf) || prf.multiUnique) sc += 28;
                else sc += 12;
              }
            }
          }
        }
        // Preferisci celle del piano target se presenti
        if (state._gnTargetCellSequence) {
          const ti = state._gnTargetCellSequence.findIndex(
            t => t.x === move.x && t.y === move.y &&
              !(state.board || []).some(b => b.x === t.x && b.y === t.y)
          );
          if (ti >= 0) sc += Math.max(0, 25 - ti);
        }

        // "Cosa fare"
        known.forEach(o => {
          if (o.uid === card.uid) return;
          let m=0;
          if (o.value===card.value) m++;
          if (o.shape===card.shape) m++;
          if (o.color===card.color) m++;
          sc += m;
        });

        // "Cosa non fare" + rarità (toned down in endgame)
        const sC = counts.shape[card.shape]||1;
        const cC = counts.color[card.color]||1;
        const vC = counts.value[card.value]||1;
        const rarePen = emptyLeft <= 6 ? 0.35 : 1;
        if (sC<=1) sc -= 12 * rarePen;
        else if (sC==2) sc -= 6 * rarePen;
        if (cC<=2) sc -= 7 * rarePen;
        if (vC<=2) sc -= 5 * rarePen;

        // Fattori specifici per N crescente (da osservazioni umane su 5x5 vs 4x4):
        // - Gli insiemi per VALORE crescono (soprattutto i valori alti come il 5: +8 carte nel 5x5).
        //   Questo aiuta a "calcolare nel futuro" le possibilità di posa.
        // - Gli insiemi per COLORE si assottigliano relativamente (più difficile posare per colore).
        //   Per umano il colore è visivamente dominante → svantaggio umano vs IA; per IA teniamone conto.
        const szN = state.size || 5;
        if (szN >= 5) {
          // Non favorire indiscriminatamente i valori alti "presto".
          // Dall'esempio manuale efficace: prima si chiude il core con valori bassi,
          // poi si usano i valori alti per la parte esterna (tutti i 5 raggruppati in un blocco).
          // Quindi qui non diamo bonus generale ai valori alti; il bias viene gestito
          // nella costruzione del piano (valori bassi early, alti late) e nel late-game.
          if (cC <= 3) sc += 2;                     // color rarity meno penalizzante
        }

        // Early-game topologia (angoli/bordi vs hard residui). Non hack N-specifici.
        if (soloCoordinated) {
          const leftResid = [...known, ...unk];
          const residSt = gnSoloBuildResidStats(leftResid);
          sc += gnSoloEarlyPlacementScore(
            state,
            card,
            move.x,
            move.y,
            residSt,
            leftResid
          );
          // Frontiera aperta (bias soft; full peso regrediva 6-8)
          sc +=
            gnSoloOpenGrowthScore(
              state.board || [],
              state.size,
              card,
              move.x,
              move.y,
              leftResid
            ) * 0.45;
          // Jolly: con smart bot non bonus greedy (lo gestisce gnSoloWildSmartAction).
          // Solo se smart OFF: leggero bias salvataggio.
          if (
            isPlayingSoloWildCard(state, card) &&
            state.durissimaSoloWildSmartBot === false
          ) {
            const phys = countPhysicalNeighbors(state, move.x, move.y);
            sc += 15 + phys * 8;
          }
        } else {
          // Coop: bias leggero legacy angolo/rarita'
          const x = move.x;
          const y = move.y;
          const sz = state.size;
          const corner = (x === 0 || x === sz - 1) && (y === 0 || y === sz - 1);
          if (corner) {
            if (card.value === 1 && card.shape === 1) sc += 18;
            if (sC <= 2) sc += 7;
          }
        }

        // Statistica (es. "so che ci sono ancora X di questo tipo")
        const unkN = unk.length;
        if (unkN > 0) {
          const match = unk.filter(c => c.value==card.value || c.shape==card.shape || c.color==card.color).length;
          sc += (match / unkN) * 9;
        }

        // Approximate lookahead (1 passo)
        let la = 0;
        const after = known.filter(c => c.uid != card.uid);
        legals.forEach(nm => {
          if (nm.card.uid == card.uid) return;
          let ns = 0;
          after.forEach(o => {
            let m=0;
            if (o.value==nm.card.value) m++;
            if (o.shape==nm.card.shape) m++;
            if (o.color==nm.card.color) m++;
            ns += m;
          });
          if (ns > la) la = ns;
        });
        sc += la * 0.7;

        // Morph: solo soft mid/late. Early e' gestito da gnSoloEarlyPlacementScore
        // (hard su angolo/bordo, non "hard ovunque adesso").
        if (!soloCoordinated || !gnSoloIsEarlyPhase((state.board && state.board.length) || 0, state.size)) {
          try {
            const morph = gnMorphologyForSize ? gnMorphologyForSize(state.size) : null;
            if (morph && morph.cardMorph) {
              const m = morph.cardMorph(card);
              if (m.rigidity > 1.5) sc += m.rigidity * 2;
              if (m.flexibility > 20) sc -= 1;
            }
          } catch (e) { /* ignore */ }
        }

        // Clustering su qualsiasi tratto (valore, forma, colore).
        // Forme e colori servono proprio a gestire situazioni dove non abbiamo match di valore.
        // Incoraggiamo a estendere cluster su qualunque tratto disponibile, per flessibilità
        // (soprattutto quando N cresce e i pool per tratto diventano grandi e bilanciati).
        // Bonus addizionale se match di valore (come nell'esempio manuale dove i 5 formano un blocco).
        let clusterBonus = 0;
        const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
        for (const [dx,dy] of dirs) {
          const nx = move.x + dx, ny = move.y + dy;
          const neigh = state.board.find(b => b.x === nx && b.y === ny);
          if (neigh) {
            if (neigh.card.value === card.value) clusterBonus += 4;  // valore (esempio manuale)
            if (neigh.card.shape === card.shape) clusterBonus += 2;
            if (neigh.card.color === card.color) clusterBonus += 2;
          }
        }
        sc += clusterBonus;

        // Late game: quando rimangono poche celle, sii più aggressivo (aiuta a chiudere con tallone piccolo).
        // Gli ultimi 3-4 posti sono dove spesso si blocca.
        const remaining = (state.size * state.size) - state.board.length - 1;
        if (remaining <= 4) {
          sc += 10;  // bonus generale per qualsiasi posa utile in endgame
          // Non diamo extra specifico ai valori alti qui: l'esempio mostra che i 5 vanno
          // usati come blocco per la parte esterna, dopo aver sistemato il core.
        }

        // Bias verso il piano (target o full): premia mosse che riempiono le celle precoci del piano buono.
        // Il piano è scelto con owned-defer (unknowns il più tardi possibile) per small tallone.
        // Non blocca mai: realistico gioca sempre se ci sono legals.
        const tseqBias = state._gnTargetCellSequence || (state._gnFullSequence ? state._gnFullSequence.map(s => ({x:s.x, y:s.y})) : null);
        if (tseqBias && tseqBias.length > 0) {
          for (let i = 0; i < Math.min(tseqBias.length, 12); i++) {
            const t = tseqBias[i];
            if (state.board.some(b => b.x === t.x && b.y === t.y)) continue;
            if (move.x === t.x && move.y === t.y) {
              sc += (18 - i * 1.2); // forte bonus per le prime, decrescente
              break;
            }
          }
        }

        return sc;
      };

      // Coda: se una mossa lascia un residuo greedy-complete, prendila subito
      if (emptyLeft <= 5) {
        for (const m of legals) {
          const board2 = (state.board || []).map(b => ({ x: b.x, y: b.y, card: b.card }));
          board2.push({ x: m.x, y: m.y, card: m.card });
          const pool2 = poolLeft.filter(c => c.uid !== m.card.uid);
          if (residualGreedyComplete(board2, pool2)) {
            state._gnJustPlayedSeqStep = true;
            return { type: "move", move: m };
          }
        }
      }

      // Solitario: filtra per crescita aperta + anti-pocket + outlook
      let moveList = legals;
      if (soloCoordinated && legals.length > 0) {
        const tierA = []; // open growth ok + no dead + residual ok
        const tierB = []; // no dead + residual ok
        const tierC = []; // no dead pocket
        const tierD = []; // resto
        for (const m of legals) {
          const pr = gnSoloMovePocketRisk(
            state.board || [],
            state.size,
            poolLeft,
            m.card,
            m.x,
            m.y
          );
          if (pr.dead) {
            tierD.push(m);
            continue;
          }
          const grow = gnSoloOpenGrowthScore(
            state.board || [],
            state.size,
            m.card,
            m.x,
            m.y,
            poolLeft
          );
          let outlook = null;
          const filledNow = (state.board && state.board.length) || 0;
          if (
            legals.length <= 24 &&
            emptyLeft > 3 &&
            emptyLeft <= 36 &&
            filledNow >= 18
          ) {
            outlook = gnSoloMoveSafeOutlook(state, m);
          }
          if (outlook && outlook.trapped) {
            tierD.push(m);
            continue;
          }
          // Soglia morbida: non scartare quasi tutte le legali (regrediva)
          const openOk = grow > -250;
          if (openOk && outlook && outlook.drawSafe > 0 && outlook.residualSafe > 0) {
            tierA.push({ m, outlook, pr, grow });
          } else if (openOk && (!outlook || outlook.residualSafe > 0)) {
            tierA.push({ m, outlook, pr, grow });
          } else if (outlook && outlook.residualSafe > 0) {
            tierB.push({ m, outlook, pr, grow });
          } else if (!outlook || !outlook.trapped) {
            tierC.push({ m, outlook, pr, grow });
          } else {
            tierD.push(m);
          }
        }
        const pickTier = tierA.length
          ? tierA
          : tierB.length
            ? tierB
            : tierC.length
              ? tierC
              : null;
        if (pickTier) {
          let best = pickTier[0].m;
          let bs = -Infinity;
          for (let i = 0; i < pickTier.length; i++) {
            const item = pickTier[i];
            let s = score(item.m);
            if (item.outlook) {
              s += (item.outlook.drawSafe || 0) * 6;
              s += (item.outlook.residualSafe || 0) * 3;
              s += (item.outlook.handSafe || 0) * 2;
            }
            if (item.pr && item.pr.risk) s -= Math.min(80, item.pr.risk * 0.15);
            if (item.grow != null) s += Math.max(-200, Math.min(80, item.grow * 0.25));
            if (s > bs) {
              bs = s;
              best = item.m;
            }
          }
          return { type: "move", move: best };
        }
        moveList = legals;
      }

      let best = moveList[0];
      let bs = score(best);
      moveList.forEach(m => {
        const s = score(m);
        if (s > bs) {
          bs = s;
          best = m;
        }
      });

      return { type: "move", move: best };
    }

    // Search come fallback se NON abbiamo una sequenza pre-scelta valida da seguire.
    // Solitario: DFS anche su griglie grandi (no pass coop).
    if (coordinated && !state._gnFullSequence
        && (state.size <= 5 || (soloCoordinated && state.size <= 4))) {
      // Search pesante solo senza tallone (no oracolo ordine)
      if (gnSearchMayUseDrawPile(state)) {
        const searchOpts = gnMoveSearchOptions(state, { coordinatedTeam: true });
        if (searchOpts) {
          if (state.size === 4) searchOpts.maxNodes = Math.max(searchOpts.maxNodes || 0, 1000000);
          const fork = gnForkSearchState(state);
          const outcome = solveGnStateOutcome(fork, {
            ...searchOpts,
            _gnInPlace: true,
            trackAction: true,
            coordinatedTeam: true
          });
          if (outcome.result === "solved" && outcome.action) return outcome.action;
        }
      }
      const my = legalPlacements(state, playerId, requirement);
      if (my.length) return { type: "move", move: my[0] };
      return { type: "stop" };
    }



    // Fallback / non perfect: logica precedente (monte, patch, pruned, solver, pick)
    if (state.consecutivePasses >= state.players - 1) {
      // Priority alla seq se presente: usa owner lookup (i piani non hanno .player)
      if (coordinated && state._gnFullSequence) {
        const seq = state._gnFullSequence;
        const placedCount = state.board.length;
        const safeLen = state._gnSafePrefixLen || 0;
        const prefixAssign = state._gnPrefixAssignments || [];
        const myHand = state.hands[playerId] || [];

        // Rispetta il prefisso safe anche nel monte
        if (placedCount < safeLen && prefixAssign.length > 0) {
          for (let i = 0; i < prefixAssign.length; i++) {
            const pa = prefixAssign[i];
            if (state.board.some(b => b.x === pa.x && b.y === pa.y)) continue;
            const live = myHand.find(c => c.uid === pa.card.uid);
            if (live) {
              const legals = legalPlacements(state, playerId, requirement);
              const matching = legals.find(mm => mm.x === pa.x && mm.y === pa.y && mm.card && mm.card.uid === live.uid);
              if (matching) {
                state._gnSeqIdx = i + 1;
                state._gnJustPlayedSeqStep = true;
                return { type: "move", move: matching };
              }
            }
            break;
          }
        }

        // Flessibile per il resto
        const WINDOW = 5;
        let bestIdx = -1;
        let chosenCard = null;
        let bestTarget = null;
        let cand = 0;
        for (let i = 0; i < seq.length && cand < WINDOW; i++) {
          const t = seq[i];
          if (state.board.some(b => b.x === t.x && b.y === t.y)) continue;
          cand++;
          for (const c of myHand) {
            if (canPlaceCardAt(state, c, t.x, t.y, requirement)) {
              if (bestIdx === -1 || i < bestIdx) {
                bestIdx = i;
                chosenCard = c;
                bestTarget = t;
              }
              break;
            }
          }
        }
        if (bestIdx !== -1 && chosenCard && bestTarget) {
          const legals = legalPlacements(state, playerId, requirement);
          const matching = legals.find(mm => mm.x === bestTarget.x && mm.y === bestTarget.y && mm.card && mm.card.uid === chosenCard.uid);
          if (matching) {
            state._gnSeqIdx = bestIdx + 1;
            state._gnJustPlayedSeqStep = true;
            const nextI = state._gnSeqIdx;
            if (nextI < seq.length) {
              const nt = seq[nextI];
              if (myHand.some(c => canPlaceCardAt(state, c, nt.x, nt.y, requirement))) {
                state._gnJustPlayedSeqStep = false;
              }
            }
            return { type: "move", move: matching };
          }
        }
      }
      const urgent = gnAllTeamLegalPlacements(state, requirement)
        .filter(({ holderId }) => holderId === playerId);
      if (urgent.length) return { type: "move", move: urgent[0].move };
    }

    if (gnUsePatchFirstStrategy(state)) {
      const patchAction = gnTryPatchGuidedAction(state, playerId);
      if (patchAction) return patchAction;
    }

    const prunedTeam = gnPruneTeamPlacements(
      state, gnAllTeamLegalPlacements(state, requirement)
    );
    if (prunedTeam.length === 1) {
      const only = prunedTeam[0];
      if (only.holderId === playerId) return { type: "move", move: only.move };
      return { type: "stop" };
    }

    if (isDurissimaGnIdeal(state)
        && gnEmptyCellsInIdealGrid(state) <= gnCoordinatedSolverThreshold(state.size)) {
      const solverAction = solveGnCoordinatedBestAction(state, playerId, random);
      if (solverAction) return solverAction;
    }

    const pick = gnChooseGlobalTeamPlacement(state, random, {
      useMorphology: true,
      useGlobalHeuristic: isDurissimaGnIdeal(state)
    });
    if (!pick) return { type: "stop" };

    if (pick.holderId !== playerId) return { type: "stop" };

    let move = pick.move;
    if (isDurissimaGnIdeal(state)) {
      const patchRect = gnSelectBestPatchGoal(state);
      move = gnRepickGlobalMoveIfBreaksMatching(state, playerId, move, patchRect) || move;
    }
    return { type: "move", move };
  }

  function chooseDurissimaGlobalAction(state, playerId, random) {
    if (state.turnPlayed >= 5) return { type: "stop" };
    const requirement = placementRequirement(state);
    if (state.turnPlayed >= 4 && requirement > 4) return { type: "stop" };
    if (state.turnPlayed < 4 && requirement > 4) return { type: "stop" };

    if (state.turnPlayed === 4 && canOfferIdea(state, playerId)) {
      const ideaMove = chooseDurissimaIdeaPursuitPlacement(
        state, playerId, random, PLANNER_BRANCH_LIMIT + 2, true
      );
      if (ideaMove) return { type: "move", move: ideaMove };
    }

    if (durissimaCanPursueIdeaThisTurn(state, playerId) && state.turnPlayed > 0 && state.turnPlayed < 4) {
      const chainMove = chooseDurissimaIdeaPursuitPlacement(
        state, playerId, random, PLANNER_BRANCH_LIMIT + 4, true
      )
        || choosePlacementPlanner(state, playerId, requirement, random, PLANNER_BRANCH_LIMIT + 4);
      if (chainMove) return { type: "move", move: chainMove };
    }

    if (isDurissimaGnIdeal(state)) {
      const reqMoves = legalPlacements(state, playerId, requirement);
      let safeTurn = reqMoves.filter(move => !gnMoveBreaksIdealFillPlan(state, playerId, move));
      if (state.size >= 6 && gnEmptyCellsInIdealGrid(state) <= 14 && safeTurn.length) {
        const noMisuse = safeTurn.filter(move => !gnMoveMisusesHeldReservation(state, playerId, move));
        if (noMisuse.length) safeTurn = noMisuse;
      }
      if (reqMoves.length && !safeTurn.length && state.turnPlayed > 0) {
        const ideaChainOk = state.size >= 6 && durissimaCanPursueIdeaThisTurn(state, playerId);
        if (!ideaChainOk) return { type: "stop" };
      }
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
    if (forced) {
      if (state.size === 7 && state.turnPlayed === 0) {
        const emptyMid = gnEmptyCellsInIdealGrid(state);
        if (emptyMid >= 20 && emptyMid <= 30 && gnUsePatchFirstStrategy(state)) {
          const patchAction = gnTryPatchGuidedAction(state, playerId);
          if (patchAction && patchAction.type === "move" && patchAction.move
            && (patchAction.move.x !== forced.x || patchAction.move.y !== forced.y
              || patchAction.move.card.uid !== forced.card.uid)) {
            const repick = gnRepick7x7ForcedVsPatch(state, playerId, forced, patchAction.move);
            return { type: "move", move: repick };
          }
        }
      }
      return { type: "move", move: forced };
    }

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
          if (!safeReq.length) {
            if (state.size === 7 && gnEmptyCellsInIdealGrid(state) <= 10
              && gn7x7PatchPlanComplete(state)) {
              const salvage = gnTryEndgameSolverAction(state);
              if (salvage) return salvage;
            }
            if (state.size === 8 && gnEmptyCellsInIdealGrid(state) <= 14
              && !gn8x8PatchPlanPending(state)) {
              const salvage = gnTryEndgameSolverAction(state);
              if (salvage) return salvage;
            }
            return { type: "stop" };
          }
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
    const gn7CornersReady = (state.size !== 7 || gn7x7PatchPlanComplete(state))
      && !gn8x8PatchPlanPending(state);
    if (isDurissimaGnIdeal(state) && emptyCells <= gnEndgameExactThreshold(state.size) && gn7CornersReady) {
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

    const crossSpine = gnTry7x7CrossSpineAction(state, playerId);
    if (crossSpine) return crossSpine;

    const crossMargin = gnTry7x7CrossMarginAction(state, playerId);
    if (crossMargin) return crossMargin;

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
      if (durissimaCanPursueIdeaThisTurn(state, playerId)) {
        const chainMove = chooseDurissimaIdeaPursuitPlacement(
          state, playerId, random, branchLimit, teamMode
        );
        if (chainMove) return chainMove;
      }
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
    if (gnUseCoordinatedDurissimaPlanner(state)
        && (strategy === "durissima-global-planner" || strategy === "durissima-team-planner")) {
      let action = chooseDurissimaCoordinatedAction(state, playerId, random);
      action = gnEnsureLegalSoloMove(state, playerId, action);
      if (strategy === "durissima-global-planner" && action.type === "move"
          && !gnUseCoordinatedSoloPlanner(state)) {
        return gnFinalizeGlobalMoveAction(state, playerId, action);
      }
      return action;
    }
    if (strategy === "durissima-global-planner") {
      if (isDurissimaGnIdeal(state)) {
        return gnFinalizeGlobalMoveAction(
          state, playerId, chooseDurissimaGlobalAction(state, playerId, random)
        );
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
      durissimaCanPursueIdeaThisTurn(state, playerId) &&
      isDurissimaPlannerStrategy(strategy) &&
      state.turnPlayed > 0 &&
      state.turnPlayed < 4
    ) {
      const teamMode = strategy !== "durissima-planner";
      const chainMove = chooseDurissimaIdeaPursuitPlacement(
        state, playerId, random, PLANNER_BRANCH_LIMIT + 4, teamMode
      )
        || choosePlacementPlanner(state, playerId, requirement, random, PLANNER_BRANCH_LIMIT + 4);
      if (chainMove) return { type: "move", move: chainMove };
    }
    if (
      state.turnPlayed === 4 &&
      canOfferIdea(state, playerId) &&
      isDurissimaPlannerStrategy(strategy)
    ) {
      const teamMode = strategy !== "durissima-planner";
      const ideaMove = chooseDurissimaIdeaPursuitPlacement(
        state, playerId, random, PLANNER_BRANCH_LIMIT + 2, teamMode
      );
      if (ideaMove) return { type: "move", move: ideaMove };
    }
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
      const hasFree = isDurissimaFreeCellsEnabled(state) && durissimaFreeCellOccupiedCount(state) > 0;
      if (!hasHand && !hasReserve && !hasFree) {
        throw new Error("Nessuna carta disponibile per realizzare l'idea.");
      }
    }
    const legalMove = legalPlacements(state, playerId, requirement).find(candidate =>
      candidate.cardUid === move.cardUid &&
      candidate.x === move.x &&
      candidate.y === move.y
    );
    if (!legalMove) {
      const coordinated = gnUseCoordinatedTeamPlanner(state);
      if (coordinated && state._gnFullSequence) {
        // In strict seq mode, if canPlace says yes, allow the move.
        // This bypasses the candidateCells / ideal filter / list, allowing the exact precomputed (card,cell)
        // even if coords are negative after shift or the enumeration didn't include it.
        const requirement2 = placementRequirement(state);
        if (canPlaceCardAt(state, move.card, move.x, move.y, requirement2)) {
          // return a fake legalMove so applyPlacement can proceed
          return {
            cardUid: move.cardUid || (move.card && move.card.uid),
            x: move.x,
            y: move.y,
            card: move.card,
            fromReserve: false
          };
        } else {
          throw new Error("Posa non legale.");
        }
      } else {
        throw new Error("Posa non legale.");
      }
    }
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

  function isDurissimaScartiNReshuffle(state) {
    return isDurissimaMater(state) && state.durissimaScartiNReshuffle === true;
  }

  function durissimaScartiShuffleSeed(state, tag) {
    return hashSeed(
      "scarti:" + tag + ":" + state.turns + ":" + state.currentPlayer + ":" +
      (state.durissimaDiscardRecyclesUsed || 0) + ":" + state.board.length
    );
  }

  function durissimaRecycleDiscardPileIfNeeded(state, random) {
    if (!isDurissimaScartiNReshuffle(state)) return false;
    if ((state.drawPile || []).length > 0) return false;
    const discard = state.durissimaDiscardPile || [];
    if (!discard.length) return false;
    if ((state.durissimaDiscardRecyclesLeft || 0) <= 0) return false;
    const rng = random || mulberry32(durissimaScartiShuffleSeed(state, "recycle"));
    state.drawPile = shuffle(discard.slice(), rng);
    state.durissimaDiscardPile = [];
    state.durissimaDiscardRecyclesLeft--;
    state.durissimaDiscardRecyclesUsed = (state.durissimaDiscardRecyclesUsed || 0) + 1;
    return true;
  }

  function chooseDurissimaDiscardUid(state, playerId, random, strategy) {
    const hand = state.hands[playerId] || [];
    if (!hand.length) return null;
    const requirement = placementRequirement(state);
    if (requirement === null || (requirement > 4 && requirement !== 1)) {
      return hand[Math.floor((random || (() => 0))() * hand.length)].uid;
    }
    const morph = gnMorphologyForSize(state.size);
    let bestUid = hand[0].uid;
    let bestPlacements = Infinity;
    let bestFlex = -Infinity;
    for (const card of hand) {
      const placements = legalPlacements(state, playerId, requirement)
        .filter(move => move.cardUid === card.uid).length;
      const flex = morph.cardMorph(card).flexibility;
      if (
        placements < bestPlacements ||
        (placements === bestPlacements && flex > bestFlex) ||
        (placements === bestPlacements && flex === bestFlex && (random || (() => 0))() < 0.5)
      ) {
        bestPlacements = placements;
        bestFlex = flex;
        bestUid = card.uid;
      }
    }
    return bestUid;
  }

  function durissimaDiscardFromHand(state, playerId, cardUid) {
    if (!isDurissimaScartiNReshuffle(state)) return false;
    const hand = state.hands[playerId] || [];
    const index = hand.findIndex(card => card.uid === cardUid);
    if (index < 0) return false;
    const [card] = hand.splice(index, 1);
    if (!state.durissimaDiscardPile) state.durissimaDiscardPile = [];
    state.durissimaDiscardPile.push(card);
    return true;
  }

  function durissimaScartiDrawOne(state, playerId, random, strategy) {
    if (!isDurissimaScartiNReshuffle(state)) return drawForPlayer(state, playerId);
    const cap = durissimaHandDrawCapLimit(state);
    const hand = state.hands[playerId] || [];
    if (hand.length >= cap) {
      const uid = chooseDurissimaDiscardUid(state, playerId, random, strategy);
      if (!uid || !durissimaDiscardFromHand(state, playerId, uid)) return false;
    }
    durissimaRecycleDiscardPileIfNeeded(state, random);
    return drawForPlayer(state, playerId);
  }

  function durissimaRefillHandToCap(state, playerId, random, strategy) {
    if (!isDurissimaScartiNReshuffle(state)) return 0;
    const cap = durissimaHandDrawCapLimit(state);
    let drawn = 0;
    while ((state.hands[playerId] || []).length < cap) {
      if (!durissimaScartiDrawOne(state, playerId, random, strategy)) break;
      drawn++;
    }
    return drawn;
  }

  function durissimaScartiCycleOnce(state, playerId, random, strategy) {
    if (!isDurissimaScartiNReshuffle(state)) return false;
    const hand = state.hands[playerId] || [];
    if (!hand.length) return false;
    return durissimaScartiDrawOne(state, playerId, random, strategy);
  }

  function resolveDurissimaScartiStuck(state, random, options) {
    options = options || {};
    const playerId = state.currentPlayer;
    const strategy = options.strategy;
    const maxCycles = Math.max(8, (state.size || 3) * (state.hands[playerId] || []).length * 2);
    for (let i = 0; i < maxCycles; i++) {
      if (hasLegalPlacementsNow(state, playerId)) return "cycled";
      if (!durissimaScartiCycleOnce(state, playerId, random, strategy)) break;
    }
    if (hasLegalPlacementsNow(state, playerId)) return "cycled";
    if (state.players === 1) {
      state.status = "stalled";
      return "lost";
    }
    passTurn(state);
    return "passed";
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

  /**
   * Regola Durissima: a fine turno, se hai posato almeno 1 carta,
   * peschi finche' la mano torna a initialHandSize (tipicamente N) o tallone esaurito.
   * Posa K => tipicamente pesca K. Niente pesca su pass (drawOnlyAfterPlacement).
   * Refill e' regola fissa di prodotto (non opt-out). Vale G>=1 (solitario e multi).
   * Eccezioni tecniche solo per varianti sperimentali competitive-draw / scarti-n-reshuffle.
   */
  function isDurissimaRefillToNEnabled(state) {
    return (
      isDurissimaMater(state) &&
      state.durissimaRefillToNAfterPlace === true &&
      !durissimaUsesCompetitiveDraw(state) &&
      !isDurissimaScartiNReshuffle(state)
    );
  }

  function defaultDurissimaRefillToNAfterPlace(options) {
    if (!options || options.durissimaMater !== true) return false;
    // Varianti sperimentali con altra pesca: no refill-to-N
    if (options.durissimaScartiNReshuffle === true) return false;
    if (options.durissimaCompetitiveDraw === true) return false;
    // Prodotto: refill sempre ON (ignora opt-out false — non e' piu' opzione di tavolo)
    return true;
  }

  /**
   * Pesca fino a target = initialHandSize || size. Ritorna quante carte pescate.
   * Rispetta budget after-play se limitato (ogni carta conta 1).
   */
  function tryDurissimaRefillHandToN(state, playerId) {
    if (!isDurissimaRefillToNEnabled(state)) return 0;
    if (!state.drawPile || state.drawPile.length === 0) return 0;
    const target = Math.max(
      1,
      state.initialHandSize || state.size || 1
    );
    let drawn = 0;
    while ((state.hands[playerId] || []).length < target && state.drawPile.length > 0) {
      if (!durissimaAfterPlayBudgetOpen(state)) break;
      if (!drawForPlayer(state, playerId)) break;
      if (state.durissimaAfterPlayDrawsLeft !== null && state.durissimaAfterPlayDrawsLeft !== undefined) {
        state.durissimaAfterPlayDrawsLeft--;
      }
      state.durissimaAfterPlayDrawsUsed = (state.durissimaAfterPlayDrawsUsed || 0) + 1;
      drawn++;
    }
    return drawn;
  }

  /**
   * N reshuffle / vita extra: **rimossi dal prodotto** (2026-07).
   * Sempre false: non interrompono il flusso di gioco; non sono opzioni di tavolo.
   * Il codice di implementazione resta per eventuale archeologia/probe storici, ma e' morto.
   */
  function defaultDurissimaVitaExtraEnabled(_options) {
    return false;
  }

  /**
   * Solitario: «carte extra» in mano al setup (non un pool separato; non in coop G>=2).
   * Default prodotto: 0 => mano = N (regola base).
   * Facilitazione opzionale: k = N => mano 2N (utile da 6–8; su 3–5 non necessaria).
   * Override: durissimaExtraCards o tabella durissimaExtraCardsByN.
   */
  function defaultDurissimaExtraCards(size, options) {
    if (!options || options.durissimaMater !== true) return 0;
    const players = Number(options.players);
    if (players !== 1) return 0;
    if (options.durissimaExtraCards !== undefined) {
      return Math.max(0, Math.floor(Number(options.durissimaExtraCards)) || 0);
    }
    const table = options.durissimaExtraCardsByN;
    if (table && table[size] != null) {
      return Math.max(0, Math.floor(Number(table[size])) || 0);
    }
    return 0;
  }

  /**
   * Solo virtual-multi: default ON solo N>=6 (dove partial multi aiuta).
   * N<=5: default OFF → path solo fullKnown legacy (non rompere 3–5).
   * Override esplicito true/false sempre rispettato.
   */
  function defaultDurissimaSoloVirtualMulti(options) {
    if (!options || options.durissimaMater !== true) return false;
    if (Number(options.players) !== 1) return false;
    if (options.durissimaSoloVirtualMulti === false) return false;
    if (options.durissimaSoloVirtualMulti === true) return true;
    const size = Math.floor(Number(options.size)) || 0;
    return size >= 6;
  }

  /**
   * Solitario free cell: numero di slot di parcheggio (0 = off, default prodotto).
   * Override: durissimaFreeCellSlots (1..N tipico; max 16 per probe). Coop G>=2: sempre 0.
   */
  function defaultDurissimaFreeCellSlots(options) {
    if (!options || options.durissimaMater !== true) return 0;
    const players = Number(options.players);
    if (players !== 1) return 0;
    if (options.durissimaFreeCellSlots === undefined || options.durissimaFreeCellSlots === null) {
      return 0;
    }
    const n = Math.floor(Number(options.durissimaFreeCellSlots));
    if (!Number.isFinite(n) || n <= 0) return 0;
    // Prima tetto 4; per probe "fc=N" serve fino a size (es. 6x6 con 6 slot)
    return Math.min(16, n);
  }

  /**
   * Parcheggia una carta dalla mano in uno slot free cell vuoto.
   * Non conta come posa (turnPlayed invariato). Solo solitario.
   */
  function applyParkToFreeCell(state, playerId, cardUid) {
    if (!isDurissimaFreeCellsEnabled(state) || state.status !== "playing") return false;
    if (playerId !== state.currentPlayer) return false;
    const slot = durissimaFreeCellEmptyIndex(state);
    if (slot < 0) return false;
    const hand = state.hands[playerId] || [];
    const idx = hand.findIndex(c => c.uid === cardUid);
    if (idx < 0) return false;
    const card = hand.splice(idx, 1)[0];
    state.durissimaFreeCells[slot] = card;
    state.lastMove = {
      playerId,
      card,
      park: true,
      freeCellIndex: slot
    };
    return true;
  }

  /**
   * Sceglie quale carta parcheggiare: prioritizza multi-unici / rigidi
   * (li salva dal reshuffle vita e li tiene giocabili).
   */
  function gnSoloChooseParkCardUid(state, playerId) {
    if (!isDurissimaFreeCellsEnabled(state)) return null;
    if (durissimaFreeCellEmptyIndex(state) < 0) return null;
    const hand = state.hands[playerId] || [];
    if (!hand.length) return null;
    const pool = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));
    const stats = gnSoloBuildResidStats(pool);
    let best = null;
    let bestScore = -Infinity;
    for (const card of hand) {
      const prof = gnSoloCardAxisProfile(card, stats);
      // Piu' unico/rigido -> meglio in free cell (proteggi + non inquinare mano vita)
      const score =
        (prof.multiUnique ? 40 : 0) +
        prof.scarceAxes * 12 +
        prof.rigid * 20 -
        prof.flex * 5;
      if (score > bestScore) {
        bestScore = score;
        best = card.uid;
      }
    }
    return best;
  }

  function gnSoloChooseParkAction(state, playerId) {
    const uid = gnSoloChooseParkCardUid(state, playerId);
    if (!uid) return null;
    return { type: "park", cardUid: uid };
  }

  /**
   * Ultima spiaggia: park proattivo mid-game (non solo a zero legali / pre-vita).
   *
   * Con refill-to-N: park K poi posa 1 => pesca K+1: i pezzi scomodi restano in free cell
   * (sempre giocabili) e la mano si rinnova. Senza park aggressivo fc=N e' inerte (~0.2 park/deal).
   *
   * Priorita' park: carte senza posa pocket-safe > multi-unici/rigidi, se resta >=2 carte in mano.
   * Solo turnPlayed===0 (inizio turno). Coda (empty<=6): non parcheggiare.
   */
  function gnSoloProactiveParkAction(state, playerId) {
    if (!state || state.players !== 1) return null;
    if (!isDurissimaFreeCellsEnabled(state)) return null;
    if (durissimaFreeCellEmptyIndex(state) < 0) return null;
    if ((state.turnPlayed || 0) !== 0) return null;
    const size = state.size || 0;
    const n2 = size * size;
    const emptyBoard = n2 - ((state.board && state.board.length) || 0);
    if (emptyBoard <= 6) return null;
    const hand = state.hands[playerId] || [];
    // Tieni almeno 2 carte in mano per avere scelta di posa dopo i park
    if (hand.length <= 2) return null;

    const pool = [];
    for (let p = 0; p < (state.hands || []).length; p++) {
      if (state.hands[p]) pool.push(...state.hands[p]);
    }
    if (state.durissimaReserve) pool.push(...state.durissimaReserve);
    if (isDurissimaFreeCellsEnabled(state)) {
      for (const c of state.durissimaFreeCells || []) if (c) pool.push(c);
    }
    for (const c of gnSoloTalloneMultiset(state) || []) if (c) pool.push(c);

    const legals = legalPlacements(state, playerId, 1) || [];
    const safeByUid = Object.create(null);
    for (let i = 0; i < legals.length; i++) {
      const m = legals[i];
      if (!m || !m.card) continue;
      const pr = gnSoloMovePocketRisk(
        state.board || [],
        size,
        pool,
        m.card,
        m.x,
        m.y
      );
      if (!pr.dead && (pr.risk || 0) < 200) {
        safeByUid[m.card.uid] = true;
      }
    }
    const safeUidCount = Object.keys(safeByUid).length;

    const stats = gnSoloBuildResidStats(pool);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < hand.length; i++) {
      const card = hand[i];
      if (!card) continue;
      const hasSafe = !!safeByUid[card.uid];
      // Non parcheggiare l'unica carta con posa safe
      if (hasSafe && safeUidCount <= 1) continue;
      const prof = gnSoloCardAxisProfile(card, stats);
      let score = 0;
      if (!hasSafe) score += 100;
      if (prof.multiUnique) score += 40;
      score += (prof.scarceAxes || 0) * 12;
      score += (prof.rigid || 0) * 20;
      score -= (prof.flex || 0) * 5;
      // Mid-game: spingi a riempire free cell anche con pezzi mediamente rigidi
      if (emptyBoard > 12 && !hasSafe) score += 15;
      if (emptyBoard > 12 && hasSafe && (prof.multiUnique || (prof.rigid || 0) >= 2)) {
        score += 25;
      }
      if (score > bestScore) {
        bestScore = score;
        best = card.uid;
      }
    }
    // Soglia: parcheggia se c'e' un candidato "no-safe" o un hard con alternative safe
    if (!best || bestScore < 20) return null;
    return { type: "park", cardUid: best };
  }

  /**
   * Riempie gli slot free cell vuoti con pezzi preziosi dalla mano (pre-vita).
   * Ritorna quanti park eseguiti.
   */
  function gnSoloFillFreeCellsBeforeVita(state, playerId) {
    let n = 0;
    while (durissimaFreeCellEmptyIndex(state) >= 0) {
      const uid = gnSoloChooseParkCardUid(state, playerId);
      if (!uid) break;
      if (!applyParkToFreeCell(state, playerId, uid)) break;
      n++;
    }
    return n;
  }

  /**
   * Legacy «pool riserva» separato: solo se esplicitamente abilitato (probe).
   * Prodotto solitario preferisce carte extra in mano (defaultDurissimaExtraCards).
   * Coop G>=2: mai riserva.
   */
  function defaultDurissimaReserveEnabled(options) {
    if (options.durissimaMater !== true) return false;
    if (options.durissimaScartiNReshuffle === true) return false;
    const players = Number(options.players);
    if (Number.isInteger(players) && players > 1) return false;
    // Se usiamo carte extra in mano, non apriamo anche un pool riserva (niente doppio aiuto).
    if (players === 1 && defaultDurissimaExtraCards(options.size || 0, options) > 0) {
      return options.durissimaReserveEnabled === true;
    }
    return options.durissimaReserveEnabled === true;
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

  /**
   * Legacy: taglia pool riserva separato (probe). Preferire defaultDurissimaExtraCards.
   * Override: durissimaReserveSize; oppure durissimaReserveFrac f → max(0, ceil(f*N^2)-N).
   */
  function defaultDurissimaReserveSize(size, options) {
    if (options && options.durissimaReserveSize !== undefined) {
      return Math.max(0, Math.floor(Number(options.durissimaReserveSize)) || 0);
    }
    if (options && options.durissimaReserveFrac != null) {
      const f = Number(options.durissimaReserveFrac);
      if (Number.isFinite(f) && f > 0) {
        return Math.max(0, Math.ceil(f * size * size) - size);
      }
    }
    return size;
  }

  function setupDurissimaReserve(drawPile, size, options) {
    if (!defaultDurissimaReserveEnabled(options || {})) {
      return { drawPile: drawPile.slice(), durissimaReserve: [] };
    }
    const reserveSize = defaultDurissimaReserveSize(size, options || {});
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

  function isDurissimaVitaExtraEnabled(_state) {
    // Feature rimossa dal prodotto: mai attiva.
    return false;
  }

  function canUseDurissimaVitaExtra(_state, _playerId) {
    return false;
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
        card: cloneCardSnapshot(entry.card),
        ideaBlind: entry.ideaBlind === true || undefined
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

  /**
   * Board gia' morta (tasca chiusa con 0 filler nel residuo): reshuffle mano NON ripara.
   * Non bruciare vite in questo caso.
   */
  function gnSoloBoardIsTopologicallyDead(state) {
    if (!state || state.players !== 1) return false;
    const pool = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));
    if (!pool.length) {
      const empty = state.size * state.size - ((state.board && state.board.length) || 0);
      return empty > 0;
    }
    return gnSoloFrontierHasHole(state.board || [], state.size, pool);
  }

  /**
   * Solitario equo CORE: la posizione e' gia' persa (indipendente dall'ordine del tallone)?
   * - short_pool: residue < vuoti
   * - frontier_hole: tasca frontiera (adj>=3, 0 filler) su coordinate libere
   * - set_unfillable: solo se l'ingombro e' gia' NxN (griglia bloccata), con board
   *   rinormalizzata a 0..N-1 — altrimenti set-fill su 0..N-1 e' un falso positivo
   *   (tipico: morte finta a ~22/36 quando empty scende a 14).
   */
  function gnSoloIsPositionDead(state, options) {
    options = options || {};
    if (!state || state.players !== 1) {
      return { dead: false, reason: null };
    }
    const size = state.size;
    const board = state.board || [];
    const filled = board.length;
    const empty = size * size - filled;
    if (empty <= 0) {
      return { dead: false, reason: null, empty: 0, poolN: 0 };
    }
    const pool = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));
    const poolN = pool.length;
    if (poolN < empty) {
      return { dead: true, reason: "short_pool", empty, poolN };
    }
    // Affidabile con coordinate libere
    if (gnSoloFrontierHasHole(board, size, pool)) {
      return { dead: true, reason: "frontier_hole", empty, poolN };
    }
    const pockets = gnSoloAnalyzePockets(board, size, pool);
    if (pockets.dead > 0) {
      return {
        dead: true,
        reason: "frontier_hole",
        empty,
        poolN,
        deadHigh: pockets.deadHigh
      };
    }
    // Set-fill: solo griglia bloccata NxN E pochi vuoti.
    // gnSoloSetFillable puo' restituire false per ricerca incompleta (non solo morte certa);
    // con empty grandi genera falsi positivi (es. picco finto a 22/36). Default: solo empty<=8.
    const bounds = boardBounds(board, []);
    const locked = bounds.width >= size && bounds.height >= size;
    const maxEmptyForFill =
      options.maxEmptyForFill != null ? options.maxEmptyForFill : 8;
    if (locked && empty <= maxEmptyForFill) {
      const normBoard = board.map(b => ({
        x: b.x - bounds.minX,
        y: b.y - bounds.minY,
        card: b.card
      }));
      const budget =
        options.fillBudget != null
          ? options.fillBudget
          : empty <= 4
            ? 80000
            : empty <= 6
              ? 40000
              : 20000;
      const fill = gnSoloSetFillable(normBoard, size, pool, budget);
      if (fill === false) {
        return { dead: true, reason: "set_unfillable", empty, poolN };
      }
      if (fill === null) {
        return { dead: false, reason: null, empty, poolN, fillUnknown: true };
      }
    }
    return { dead: false, reason: null, empty, poolN };
  }

  /**
   * Solitario: legali "safe" per trigger vita.
   * - Sempre: no tasca morta (adj>=3, 0 filler).
   * - In fascia critica (filled alto e empty ancora non banale): anche no outlook trapped.
   *   (Su 7: full outlook da filled=18 bruciava tutte le vite; pocket-only non le usava mai.)
   */
  function gnSoloCountSafeLegalsNow(state, playerId) {
    const requirement = placementRequirement(state);
    if (requirement === null || (requirement > 4 && requirement !== 1)) return 0;
    const legals = legalPlacements(state, playerId, requirement);
    if (!legals.length) return 0;
    const pool = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));
    const filled = (state.board && state.board.length) || 0;
    const empty = state.size * state.size - filled;
    // Fascia dove la trappola mid e' tipica: non troppo early, non coda estrema
    const useOutlook =
      filled >= Math.max(16, Math.floor(state.size * state.size * 0.4)) &&
      empty > 4 &&
      empty <= Math.max(18, Math.floor(state.size * state.size * 0.45));
    let n = 0;
    for (let i = 0; i < legals.length; i++) {
      const m = legals[i];
      const pr = gnSoloMovePocketRisk(state.board || [], state.size, pool, m.card, m.x, m.y);
      if (pr.dead) continue;
      // Tasche "strette" (risk alto ma non dead) contano come unsafe per il dig
      if (pr.risk >= 200) continue;
      if (useOutlook && gnSoloMoveIsTrappedOutlook(state, m)) continue;
      n++;
    }
    return n;
  }

  function gnSoloHasSafeLegalNow(state, playerId) {
    return gnSoloCountSafeLegalsNow(state, playerId) > 0;
  }

  /**
   * Vita a catena finche' esiste almeno 1 mossa pocket-safe, o finisce il budget.
   * - Se la board e' gia' morta: 0 vite (inutile).
   * - Preferisce full reshuffle (keep vuoto) per uscire dalla trappola mano;
   *   fallback selective se full fallisce.
   */
  function spendDurissimaVitaExtraUntilSafe(state, playerId, random, options) {
    options = options || {};
    if (gnSoloBoardIsTopologicallyDead(state)) return 0;
    let used = 0;
    const maxLoop = 32;
    while (used < maxLoop && canUseDurissimaVitaExtra(state, playerId)) {
      if (gnSoloHasSafeLegalNow(state, playerId)) break;
      const strategy = options.strategy;
      // Full dig: rilascia tutta la mano (massima chance di pezzi nuovi sulla frontiera)
      let ok = tryDurissimaVitaExtra(state, playerId, random, { keepUids: [] });
      if (!ok && strategy && useDurissimaSelectiveReshuffle(state, strategy)) {
        ok = tryDurissimaVitaExtraBot(state, playerId, random, strategy);
      }
      if (!ok) {
        ok = tryDurissimaVitaExtra(state, playerId, random);
      }
      if (!ok) break;
      used++;
    }
    return used;
  }

  function resolveDurissimaStuck(state, random, options) {
    options = options || {};
    if (isDurissimaScartiNReshuffle(state)) {
      return resolveDurissimaScartiStuck(state, random, options);
    }
    const playerId = state.currentPlayer;
    const wantVita = options.useVitaExtra === true
      || (options.useVitaExtra !== false && state.players === 1);
    if (wantVita) {
      const strategy = options.strategy;
      const used =
        state.players === 1
          ? spendDurissimaVitaExtraUntilSafe(state, playerId, random, { strategy })
          : spendDurissimaVitaExtraUntilPlayable(state, playerId, random, { strategy });
      if (used > 0) {
        if (
          state.players === 1
            ? gnSoloHasSafeLegalNow(state, playerId) || hasLegalPlacementsNow(state, playerId)
            : hasLegalPlacementsNow(state, playerId)
        ) {
          return "vita_extra";
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
    if (legalMove.fromFreeCell === true || (legalMove.freeCellIndex != null && legalMove.freeCellIndex >= 0)) {
      const cells = state.durissimaFreeCells || [];
      let idx =
        legalMove.freeCellIndex != null && legalMove.freeCellIndex >= 0
          ? legalMove.freeCellIndex
          : cells.findIndex(c => c && c.uid === legalMove.cardUid);
      if (idx < 0 || !cells[idx] || cells[idx].uid !== legalMove.cardUid) {
        idx = cells.findIndex(c => c && c.uid === legalMove.cardUid);
      }
      if (idx < 0 || !cells[idx]) throw new Error("Carta non presente in free cell.");
      card = cells[idx];
      cells[idx] = null;
    } else if (legalMove.fromReserve) {
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
    const ideaPlacement = state.turnPlayed === 4;
    const wildPlacement = isPlayingSoloWildCard(state, card);
    state.board.push({
      x: legalMove.x,
      y: legalMove.y,
      card,
      playerId,
      ideaBlind: ideaPlacement || undefined,
      wildBlind: wildPlacement || undefined
    });
    state.consecutivePasses = 0;
    state.turnPlayed++;
    state.lastMove = {
      playerId,
      card,
      x: legalMove.x,
      y: legalMove.y,
      matches: legalMove.matches,
      requirement: ideaPlacement || wildPlacement ? 0 : state.turnPlayed,
      idea: ideaPlacement,
      ideaBlind: ideaPlacement || undefined,
      wildBlind: wildPlacement || undefined
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
        "Durissima Mater solitario: senza mosse legali la partita e' persa."
      );
    }
    if (shouldDrawOnPass(state)) {
      if (isDurissimaScartiNReshuffle(state)) {
        durissimaScartiDrawOne(
          state,
          state.currentPlayer,
          mulberry32(durissimaScartiShuffleSeed(state, "pass")),
          null
        );
      } else {
        drawForPlayer(state, state.currentPlayer);
      }
    }
    state.consecutivePasses++;
    const canStall = !isDurissimaMater(state) || !isBoardComplete(state);
    if (canStall && state.consecutivePasses >= state.players) {
      if (isTournamentMode(state)) {
        tournamentCompleteGame(state, "monte");
        return;
      }
      state.status = "stalled";
    }
    endTurn(state);
  }

  function drawForPlayer(state, playerId) {
    // Anti-oracolo: durante chooseDurissimaCoordinatedAction non si pesca dalla FIFO reale.
    // (La pesca legittima e' in endTurn/apply DOPO la decisione.)
    if (
      state &&
      state._gnInCoordinatedDecide &&
      state.drawPile &&
      state.drawPile.length > 0
    ) {
      gnRecordDrawOracleBlock("drawForPlayer during coordinated decide");
      if (typeof process !== "undefined" && process.env && process.env.GN_DRAW_ORACLE_STRICT === "1") {
        throw new Error(
          "DRAW-ORACLE: drawForPlayer durante decisione one-mind con tallone non vuoto"
        );
      }
      return false;
    }
    if (isDurissimaScartiNReshuffle(state)) {
      durissimaRecycleDiscardPileIfNeeded(state);
    }
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
    if (state.status === "playing") {
      if (isDurissimaScartiNReshuffle(state)) {
        durissimaRefillHandToCap(
          state,
          playerId,
          mulberry32(durissimaScartiShuffleSeed(state, "refill")),
          null
        );
      } else if (state.turnPlayed > 0 && (isDurissimaMater(state) || !handEmpty)) {
        // Durissima: mano vuota NON e' vittoria — se hai posato devi poter pescare anche con mano vuota.
        // (In Dura competitiva la mano vuota vince prima di endTurn, quindi !handEmpty resta corretto.)
        if (isDurissimaMater(state) && !durissimaUsesCompetitiveDraw(state)) {
          // Regola Durissima: refill fino a mano iniziale (posa K => pesca K).
          // Legacy (opt-out): una sola pesca after-play.
          if (isDurissimaRefillToNEnabled(state)) {
            tryDurissimaRefillHandToN(state, playerId);
          } else if (state.players === 1) {
            tryDurissimaAfterPlayDraw(state, playerId);
          } else {
            drawForPlayer(state, playerId);
          }
        } else {
          drawForPlayer(state, playerId);
        }
      }
    }
    state.turns++;
    state.currentPlayer = nextPlayerId(state);
    state.turnPlayed = 0;
  }

  /**
   * Deal iniziale. Opzionale options (Durissima solitario):
   * carte extra in mano = defaultDurissimaExtraCards (non un secondo pool).
   */
  function computeInitialDeal(size, players, options) {
    const totalCards = size * size;
    const overcrowded = players > size;
    let cardsPerPlayer = overcrowded ? Math.floor(totalCards / players) : size;
    let extraCards = 0;
    if (
      options &&
      options.durissimaMater === true &&
      players === 1 &&
      !overcrowded
    ) {
      extraCards = defaultDurissimaExtraCards(size, { ...options, size, players: 1 });
      // Cap: lasciare almeno 0 nel tallone; mano non oltre totalCards
      extraCards = Math.max(0, Math.min(extraCards, totalCards - size));
      cardsPerPlayer = size + extraCards;
    }
    const dealt = cardsPerPlayer * players;
    return {
      cardsPerPlayer,
      drawCount: totalCards - dealt,
      overcrowded,
      totalCards,
      extraCards
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
    const scartiMode = options.durissimaScartiNReshuffle === true;
    const dealOpts = { ...options, size, players };
    const deal = computeInitialDeal(size, players, dealOpts);
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
    // Legacy riserva separata solo se esplicitamente ON e senza carte extra in mano
    const reserveSetup = setupDurissimaReserve(shuffled, size, dealOpts);
    const tournamentMode = options.tournamentMode === true && options.durissimaMater !== true;
    const randomizeTurnOrder = tournamentMode ? false : options.randomizeTurnOrder !== false;
    const turnOrder = tournamentMode
      ? tournamentTurnOrder(players, 0)
      : randomizeTurnOrder
        ? randomInitialTurnOrder(players, random)
        : defaultTurnOrder(players);
    const initialTurnOrder = turnOrder.slice();
    const state = {
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
      durissimaPursueIdea: options.durissimaPursueIdea === true,
      // Solitario: permettere catene mid-game (default OFF = turni corti anche con refill)
      durissimaSoloAllowMidChains: options.durissimaSoloAllowMidChains === true,
      // Solo virtual-multi: path pianificazione/follow come coop undercrowded (partial owned)
      durissimaSoloVirtualMulti: defaultDurissimaSoloVirtualMulti(dealOpts),
      durissimaScartiNReshuffle: scartiMode,
      durissimaDiscardPile: scartiMode ? [] : null,
      durissimaDiscardRecyclesLeft: scartiMode ? size : null,
      durissimaDiscardRecyclesUsed: 0,
      durissimaCompetitiveDraw: scartiMode || options.durissimaCompetitiveDraw === true,
      durissimaHandDrawCap: scartiMode || options.durissimaHandDrawCap === true,
      durissimaHandDrawCapFactor: options.durissimaHandDrawCapFactor,
      durissimaHandDrawCapMax: scartiMode ? size : options.durissimaHandDrawCapMax,
      // Durissima: pesca solo se hai posato (default ON). Opt-out esplicito false.
      drawOnlyAfterPlacement:
        options.drawOnlyAfterPlacement === true ||
        (options.durissimaMater === true &&
          options.drawOnlyAfterPlacement !== false &&
          options.durissimaCompetitiveDraw !== true &&
          options.durissimaScartiNReshuffle !== true),
      tournamentMode,
      tournamentScores: tournamentMode ? Array.from({ length: players }, () => 0) : null,
      tournamentGameScores: tournamentMode ? Array.from({ length: players }, () => 0) : null,
      tournamentExited: tournamentMode ? Array.from({ length: players }, () => false) : null,
      tournamentGameIndex: tournamentMode ? 0 : null,
      tournamentLastGameReason: tournamentMode ? null : null,
      tournamentMonteLog: tournamentMode ? [] : null,
      tournamentGameLog: tournamentMode ? [] : null,
      tournamentFinishOrder: tournamentMode ? [] : null,
      durissimaEmergencyDrawsLeft: defaultDurissimaEmergencyBudget(size, players, options),
      durissimaAfterPlayDrawsLeft: options.durissimaMater === true
        ? normalizeDurissimaDrawBudget(options.durissimaAfterPlayDrawBudget)
        : null,
      durissimaEmergencyDrawsUsed: 0,
      durissimaAfterPlayDrawsUsed: 0,
      durissimaVitaExtraEnabled: defaultDurissimaVitaExtraEnabled(options),
      durissimaStrategicVitaExtra: scartiMode ? false : options.durissimaStrategicVitaExtra !== false,
      durissimaSelectiveReshuffle: scartiMode ? false : options.durissimaSelectiveReshuffle !== false,
      durissimaVitaExtraPool: defaultDurissimaVitaExtraPool(size, options),
      // Solitario: cima del tallone sempre visibile (prossima pesca nota). Non e' oracolo sull'ordine intero.
      durissimaPeekTopDraw:
        players === 1 && options.durissimaPeekTopDraw === true,
      // Solitario: a fine turno se hai posato, pesca fino a mano N (default ON).
      durissimaRefillToNAfterPlace: defaultDurissimaRefillToNAfterPlace(dealOpts),
      // Free cell: slot di parcheggio (null = vuoto). Solo solitario; default 0.
      durissimaFreeCells: (() => {
        const slots = defaultDurissimaFreeCellSlots(dealOpts);
        return slots > 0 ? Array.from({ length: slots }, () => null) : [];
      })(),
      // Solitario: jolly face-down opt-in (uid scelti sotto se abilitato)
      durissimaSoloWildCard: defaultDurissimaSoloWildCard(dealOpts),
      durissimaSoloWildCount: defaultDurissimaSoloWildCount(dealOpts),
      // Fork bot jolly: hold/rescue/peek (default ON se wild card ON)
      durissimaSoloWildSmartBot:
        defaultDurissimaSoloWildCard(dealOpts) &&
        options.durissimaSoloWildSmartBot !== false,
      durissimaSoloWildUid: null,
      durissimaSoloWildUids: [],
      durissimaVitaExtraUsed: Array.from({ length: players }, () => 0),
      randomizeTurnOrder,
      turnOrder: initialTurnOrder.slice(),
      turnPlacementStats: emptyTurnPlacementStats(),
      initialHandSize: deal.cardsPerPlayer,
      initialDrawCount: deal.drawCount,
      overcrowdedDeal: deal.overcrowded
    };
    if (state.durissimaSoloWildCard) {
      assignDurissimaSoloWildCard(state, random);
    }
    // Solitario opt-in: riga iniziale di N carte scoperte (senza vincoli di tratto tra loro)
    if (
      options.durissimaSoloSeedTopRow === true &&
      players === 1 &&
      options.durissimaMater === true
    ) {
      applyDurissimaSoloSeedTopRow(state);
    }
    return state;
  }

  /**
   * Pre-seed solitario: preleva N carte dal tallone e le dispone in riga y=0, x=0..N-1
   * senza controllare i vincoli di tratto tra di esse. Poi il gioco e' core (posate
   * successive devono rispettare i vincoli verso queste carte).
   * Opt-in: durissimaSoloSeedTopRow: true.
   * Ritorna quante carte posate.
   */
  function applyDurissimaSoloSeedTopRow(state) {
    if (!state || state.players !== 1 || !isDurissimaMater(state)) return 0;
    if ((state.board || []).length > 0) return 0;
    const n = state.size || 0;
    if (n < 2) return 0;
    const pile = state.drawPile || [];
    const k = Math.min(n, pile.length);
    if (k <= 0) return 0;
    for (let i = 0; i < k; i++) {
      const card = pile.shift();
      if (!card) break;
      state.board.push({
        x: i,
        y: 0,
        card,
        playerId: null,
        seedRow: true
      });
    }
    state.durissimaSoloSeedTopRow = true;
    state.durissimaSoloSeedCount = state.board.length;
    syncAxisLocksFromBoard(state);
    // Riga di N: asse larghezza tipicamente gia' fissato
    maybeCompleteDurissima(state);
    return state.durissimaSoloSeedCount;
  }

  function defaultDurissimaSoloWildCount(options) {
    if (!defaultDurissimaSoloWildCard(options || {})) return 0;
    if (options.durissimaSoloWildCount !== undefined) {
      return Math.max(1, Math.min(4, Math.floor(Number(options.durissimaSoloWildCount)) || 1));
    }
    return 1;
  }

  /**
   * Solitario: sceglie K carte a caso nel tallone come jolly face-down (K = durissimaSoloWildCount).
   * Se tallone corto, completa dalla mano. Opt-in: durissimaSoloWildCard: true.
   */
  function assignDurissimaSoloWildCard(state, random) {
    if (!state || state.players !== 1 || !isDurissimaMater(state)) return [];
    const rng = typeof random === "function" ? random : Math.random;
    const k = Math.max(
      1,
      Math.min(
        4,
        state.durissimaSoloWildCount ||
          defaultDurissimaSoloWildCount({
            durissimaMater: true,
            players: 1,
            durissimaSoloWildCard: true,
            durissimaSoloWildCount: state.durissimaSoloWildCount
          })
      )
    );
    const pile = state.drawPile || [];
    const hand = (state.hands && state.hands[0]) || [];
    const pool = pile.concat(hand);
    if (!pool.length) return [];
    // shuffle copy of indices
    const idxs = pool.map((_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = idxs[i];
      idxs[i] = idxs[j];
      idxs[j] = t;
    }
    const uids = [];
    const seen = new Set();
    for (let i = 0; i < idxs.length && uids.length < k; i++) {
      const c = pool[idxs[i]];
      if (!c || seen.has(c.uid)) continue;
      seen.add(c.uid);
      uids.push(c.uid);
    }
    state.durissimaSoloWildUids = uids;
    state.durissimaSoloWildUid = uids[0] || null; // legacy
    state.durissimaSoloWildCount = uids.length;
    return uids;
  }

  function defaultDurissimaSoloWildCard(options) {
    if (!options || options.durissimaMater !== true) return false;
    if (Number(options.players) !== 1) return false;
    return options.durissimaSoloWildCard === true;
  }

  /** Cima tallone: un jolly non ancora posato e' a faccia in su (visibile). */
  function gnSoloWildIsVisibleOnTop(state) {
    if (!isDurissimaSoloWildEnabled(state)) return false;
    const top = state.drawPile && state.drawPile[0];
    if (!top) return false;
    if (!gnSoloWildUidSet(state).has(top.uid)) return false;
    // gia' in board?
    return !(state.board || []).some(b => b.card && b.card.uid === top.uid);
  }

  function gnSoloWildInHand(state, playerId) {
    if (!isDurissimaSoloWildEnabled(state)) return null;
    const hand = state.hands[playerId] || [];
    const set = gnSoloWildUidSet(state);
    return hand.find(c => set.has(c.uid)) || null;
  }

  function gnSoloWildsRemaining(state) {
    const set = gnSoloWildUidSet(state);
    if (!set.size) return 0;
    let onBoard = 0;
    for (const b of state.board || []) {
      if (b.card && set.has(b.card.uid)) onBoard++;
    }
    return set.size - onBoard;
  }

  function gnSoloWildAlreadyOnBoard(state) {
    // true se TUTTI i jolly sono in board (niente da gestire)
    return gnSoloWildsRemaining(state) <= 0;
  }

  /**
   * Fork bot jolly (non sostituisce il core senza wild).
   * - Tiene il jolly finche' esistono legali NON-wild pocket-safe.
   * - Lo posa solo in salvataggio: zero alternative safe, o cella ad alto grado
   *   dove nessun pezzo normale del residuo entra.
   * - Se jolly visibile in cima al tallone e solo mosse non-safe: stop (pesca jolly).
   * Attivo se durissimaSoloWildSmartBot !== false (default ON con wild card).
   */
  function gnSoloWildSmartEnabled(state) {
    if (!isDurissimaSoloWildEnabled(state)) return false;
    if (state.durissimaSoloWildSmartBot === false) return false;
    return true;
  }

  function gnSoloPickBestNonWildSafe(state, playerId, safeMoves) {
    if (!safeMoves || !safeMoves.length) return null;
    const pool = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));
    let best = safeMoves[0];
    let bestSc = -Infinity;
    for (let i = 0; i < safeMoves.length; i++) {
      const m = safeMoves[i];
      let sc = gnSoloOpenGrowthScore(
        state.board || [],
        state.size,
        m.card,
        m.x,
        m.y,
        pool
      );
      sc += (m.neighbors || 0) * 2;
      const phys = countPhysicalNeighbors(state, m.x, m.y);
      if (phys <= 1) sc += 8;
      if (phys >= 3) sc -= 12;
      if (sc > bestSc) {
        bestSc = sc;
        best = m;
      }
    }
    return best;
  }

  function gnSoloPickWildRescueCell(state, playerId, wildMoves) {
    if (!wildMoves || !wildMoves.length) return null;
    const pool = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));
    const wildSet = gnSoloWildUidSet(state);
    let best = wildMoves[0];
    let bestSc = -Infinity;
    for (let i = 0; i < wildMoves.length; i++) {
      const m = wildMoves[i];
      const phys = countPhysicalNeighbors(state, m.x, m.y);
      let sc = phys * 25;
      // Quanti pezzi "normali" del residuo potrebbero entrare qui (con tratti)?
      let normalFit = 0;
      const simNormal = {
        board: state.board || [],
        size: state.size,
        turnPlayed: 0,
        players: 1,
        durissimaMater: true,
        durissimaSoloWildUid: null,
        durissimaSoloWildUids: []
      };
      for (let j = 0; j < pool.length; j++) {
        const c = pool[j];
        if (!c || wildSet.has(c.uid)) continue;
        if (canPlaceCardAt(simNormal, c, m.x, m.y, 1)) normalFit++;
      }
      if (normalFit === 0) sc += 80;
      else sc -= normalFit * 3;
      if (phys >= 3) sc += 45;
      if (phys >= 4) sc += 25;
      // Evita angolo vuoto early con jolly
      if (phys <= 1 && ((state.board && state.board.length) || 0) < state.size * 2) sc -= 40;
      if (sc > bestSc) {
        bestSc = sc;
        best = m;
      }
    }
    return best;
  }

  /**
   * Ritorna action {type,move} se la policy smart gestisce il turno; null = fallback coordinator.
   */
  function gnSoloWildSmartAction(state, playerId, requirement) {
    if (!gnSoloWildSmartEnabled(state)) return null;
    if (gnSoloWildAlreadyOnBoard(state)) return null;

    const wildInHand = gnSoloWildInHand(state, playerId);
    const wildOnTop = gnSoloWildIsVisibleOnTop(state);
    const legals = legalPlacements(state, playerId, requirement);
    const pool = gnSoloOwnedPlayableCards(state).concat(gnSoloTalloneMultiset(state));

    if (!legals.length) {
      // Niente da posare: se abbiamo gia' posato e jolly in cima, chiudi turno per pescarlo
      if (wildOnTop && state.turnPlayed > 0) {
        return { type: "stop", reason: "wild-peek-draw" };
      }
      return null;
    }

    const nonWild = [];
    const wildMoves = [];
    for (let i = 0; i < legals.length; i++) {
      const m = legals[i];
      if (isPlayingSoloWildCard(state, m.card) || m.wildBlind) wildMoves.push(m);
      else nonWild.push(m);
    }

    const safeNonWild = [];
    for (let i = 0; i < nonWild.length; i++) {
      const m = nonWild[i];
      const pr = gnSoloMovePocketRisk(
        state.board || [],
        state.size,
        pool,
        m.card,
        m.x,
        m.y
      );
      if (!pr.dead) safeNonWild.push(m);
    }

    // 1) Tieni jolly: gioca solo non-wild safe
    if (wildInHand && safeNonWild.length > 0) {
      const pick = gnSoloPickBestNonWildSafe(state, playerId, safeNonWild);
      if (pick) return { type: "move", move: pick, wildHold: true };
    }

    // 2) Jolly in cima (visibile): se non-safe only e abbiamo posato, stop per pescarlo
    if (wildOnTop && !wildInHand && state.turnPlayed > 0 && safeNonWild.length === 0) {
      return { type: "stop", reason: "wild-peek-draw" };
    }

    // 3) Jolly in cima e safe non-wild: continua safe (poi pescherai jolly a fine catena/turno)
    if (wildOnTop && !wildInHand && safeNonWild.length > 0) {
      // Preferisci stop dopo 1 posa mid se short-turn gia' attivo; altrimenti una safe e stop
      const pick = gnSoloPickBestNonWildSafe(state, playerId, safeNonWild);
      if (pick && state.turnPlayed >= 1) {
        // completa il turno presto per portare il jolly in mano
        return { type: "move", move: pick, wildPeekPrep: true };
      }
      if (pick) return { type: "move", move: pick, wildPeekPrep: true };
    }

    // 4) Salvataggio: jolly in mano, nessuna safe non-wild
    if (wildInHand && wildMoves.length > 0 && safeNonWild.length === 0) {
      const rescue = gnSoloPickWildRescueCell(state, playerId, wildMoves);
      if (rescue) {
        const phys = countPhysicalNeighbors(state, rescue.x, rescue.y);
        // Non bruciare jolly su espansione banale se ci sono ancora non-wild (anche non-safe)
        if (nonWild.length === 0 || phys >= 2) {
          return { type: "move", move: rescue, wildRescue: true };
        }
      }
    }

    // 5) Solo non-wild (jolly non in mano): lascia al coordinator, ma se jolly on top e turnPlayed>=1 e safe
    //    gia' gestito. Se jolly on top e turnPlayed>=1 e abbiamo fatto una mossa peekPrep, short turn
    //    forzerà stop su N>=6... ok.

    return null;
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
    if (action.type === "park") {
      const ok = applyParkToFreeCell(state, playerId, action.cardUid);
      if (!ok) {
        // Park fallito: tratta come stop (vita/stuck path sotto)
        const stopAct = { type: "stop" };
        // fall through via re-entry
        if (state.turnPlayed === 0 && isDurissimaMater(state) && state.players === 1) {
          if (
            canUseDurissimaVitaExtra(state, playerId) &&
            !gnSoloHasSafeLegalNow(state, playerId)
          ) {
            spendDurissimaVitaExtraUntilSafe(state, playerId, random, {
              strategy: playerStrategy
            });
            const retry = chooseAction(state, playerId, playerStrategy, random);
            if (retry.type === "move") {
              applyPlacement(state, playerId, retry.move);
              if (state.status !== "playing") return { played: true, move: retry.move, parkFailed: true };
              if (state.turnPlayed >= 5) endTurn(state);
              return { played: true, move: retry.move, parkFailed: true };
            }
          }
          state.status = "stalled";
          return { played: false, lost: true, parkFailed: true };
        }
        return { played: false, parkFailed: true };
      }
      // Dopo park: se ora c'e' una posa, il prossimo botStep la farà; se no e vita, prova ora.
      if (!gnSoloHasSafeLegalNow(state, playerId) && state.turnPlayed === 0) {
        if (canUseDurissimaVitaExtra(state, playerId)) {
          spendDurissimaVitaExtraUntilSafe(state, playerId, random, {
            strategy: playerStrategy
          });
        }
        if (hasLegalPlacementsNow(state, playerId)) {
          const retry = chooseAction(state, playerId, playerStrategy, random);
          if (retry.type === "move") {
            applyPlacement(state, playerId, retry.move);
            if (state.status !== "playing") {
              return { played: true, move: retry.move, parked: true, vitaAfterPark: true };
            }
            if (state.turnPlayed >= 5) endTurn(state);
            return { played: true, move: retry.move, parked: true, vitaAfterPark: true };
          }
        }
      }
      return { played: false, parked: true, cardUid: action.cardUid };
    }
    if (action.type === "stop") {
      if (state.turnPlayed === 0) {
        if (isDurissimaMater(state)) {
          // Blocco a inizio turno: vita su trappola topologica (solo: safe legal), non solo zero legali.
          if (
            canUseDurissimaVitaExtra(state, playerId) &&
            (state.players === 1
              ? !gnSoloHasSafeLegalNow(state, playerId)
              : !hasLegalPlacementsNow(state, playerId))
          ) {
            const used =
              state.players === 1
                ? spendDurissimaVitaExtraUntilSafe(state, playerId, random, {
                    strategy: playerStrategy
                  })
                : spendDurissimaVitaExtraUntilPlayable(state, playerId, random, {
                    strategy: playerStrategy
                  });
            if (
              used > 0 &&
              (state.players === 1
                ? gnSoloHasSafeLegalNow(state, playerId) || hasLegalPlacementsNow(state, playerId)
                : hasLegalPlacementsNow(state, playerId))
            ) {
              const retry = chooseAction(state, playerId, playerStrategy, random);
              if (retry.type === "move") {
                applyPlacement(state, playerId, retry.move);
                if (state.status !== "playing") {
                  return { played: true, move: retry.move, vitaExtra: true };
                }
                if (state.turnPlayed >= 5) endTurn(state);
                return { played: true, move: retry.move, vitaExtra: true };
              }
            }
          }
          if (!useDurissimaStrategicVita(state)) {
            const stuck = durissimaWhenStuckWithoutPlay(state, random, {
              useVitaExtra: true,
              strategy: playerStrategy
            });
            if (stuck === "vita_extra" || stuck === "cycled") {
              const retry = chooseAction(state, playerId, playerStrategy, random);
              if (retry.type === "move") {
                applyPlacement(state, playerId, retry.move);
                if (state.status !== "playing") {
                  return { played: true, move: retry.move, vitaExtra: stuck === "vita_extra", cycled: stuck === "cycled" };
                }
                if (state.turnPlayed >= 5) endTurn(state);
                return { played: true, move: retry.move, vitaExtra: stuck === "vita_extra", cycled: stuck === "cycled" };
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
    const maxStepsPerGame = options.size * options.size * players * stepFactor;
    const maxTotalSteps = maxStepsPerGame * players * 2;
    let steps = 0;
    let monteGames = 0;
    let totalTurns = 0;
    while (state.tournamentGameIndex < players && steps < maxTotalSteps) {
      let gameSteps = 0;
      while (state.status === "playing" && gameSteps < maxStepsPerGame && steps < maxTotalSteps) {
        botStep(state, strategies, random);
        gameSteps++;
        steps++;
      }
      totalTurns += state.turns;
      if (state.status === "game_over" || state.status === "hand_over") {
        // hand_over: status legacy (pre rename partita)
        if (state.status === "hand_over") state.status = "game_over";
        if (state.tournamentLastGameReason === "monte") monteGames++;
        beginNextTournamentGame(state, deck, random);
      } else if (state.status === "tournament_complete") {
        if (state.tournamentLastGameReason === "monte") monteGames++;
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
      tournamentGamesPlayed: state.tournamentGameIndex || 0,
      tournamentMonteGames: monteGames,
      tournamentMonteLog: (state.tournamentMonteLog || []).slice(),
      tournamentGameLog: (state.tournamentGameLog || []).slice(),
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
      durissimaDiscardRecyclesUsed: state.durissimaDiscardRecyclesUsed || 0,
      durissimaDiscardRecyclesLeft: state.durissimaDiscardRecyclesLeft,
      durissimaDiscardPileSize: (state.durissimaDiscardPile || []).length,
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
    isIdeaBlindTurn,
    isIdeaBlindBoardEntry,
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
    gn7x7Center3,
    gn7x7Side3x3Order,
    gn7x7OuterCorner3x3Order,
    gn7x7Inner5,
    gn7x7Outer7,
    gn7x7MorphMode,
    gn7x7PatchPhaseOrder,
    gn7x7Corner3x3Order,
    gn7x7AllCornersComplete,
    gn7x7PatchPlanComplete,
    gn8x8Quad4Order,
    gn8x8Center4,
    gn8x8Side3x3Order,
    gn8x8OuterCorner3x3Order,
    gn8x8Inner6,
    gn8x8Outer8,
    gn8x8MorphMode,
    gn8x8PatchPhaseOrder,
    gn8x8PatchPlanComplete,
    gn8x8ActivePatchRect,
    gnTryPatchGuidedAction,
    gn7x7UnlockedCrossSpineCells,
    gnTry7x7CrossSpineAction,
    gnTry7x7CrossMarginAction,
    gnEmptyCellsInIdealGrid,
    gnFilledCellsInIdealGrid,
    gnIdealLayoutMoveScore,
    gnIdealLayoutRulesForSize,
    gnIdealLayoutCellRole,
    gnIdealFillMatchingPossible,
    gnFirstUnfillableIdealCell,
    gnSingletonReservations,
    gnCardReservations,
    gnNarrowFrontierCells,
    gnPruneReservedCardMisuse,
    gnMoveBreaksIdealFillPlan,
    gnShallowMaxDepth,
    gnShallowNodesPerMove,
    gnUseCoordinatedTeamPlanner,
    gnUseCoordinatedSoloPlanner,
    gnUseCoordinatedDurissimaPlanner,
    gnSoloIsPlanSchedulable,
    gnSoloOwnedPlayableCards,
    gnSoloTalloneMultiset,
    gnSoloBuildResidStats,
    gnSoloCardAxisProfile,
    gnSoloCellGeoDegree,
    gnSoloIsEarlyPhase,
    gnSoloEarlyPlacementScore,
    gnSoloSetFillable,
    gnSoloFrontierHasHole,
    gnSoloIsPositionDead,
    gnSoloFrontierCells,
    gnSoloAnalyzePockets,
    gnSoloMovePocketRisk,
    gnSoloOpenGrowthScore,
    gnSoloCountPocketSafePlacements,
    gnSoloMoveSafeOutlook,
    gnSoloMovePreservesSetFill,
    gnSoloFairFinishAction,
    gnSoloFairDeepSearch,
    gnSearchMayUseDrawPile,
    gnForkSearchStateNoDrawOracle,
    gnDrawOracleBlockCount,
    gnResetDrawOracleBlockCount,
    isDurissimaFreeCellsEnabled,
    defaultDurissimaFreeCellSlots,
    applyParkToFreeCell,
    gnSoloChooseParkAction,
    gnSoloFillFreeCellsBeforeVita,
    gnEnsureLegalSoloMove,
    gnAllTeamLegalPlacements,
    gnChooseGlobalTeamPlacement,
    chooseDurissimaCoordinatedAction,
    solveGnCoordinatedBestAction,
    solveGnBestAction,
    solveGnShallowBestAction,
    solveGnStateOutcome,
    durissimaUsesCompetitiveDraw,
    isDurissimaScartiNReshuffle,
    durissimaHandDrawCapLimit,
    durissimaHandBelowDrawCap,
    durissimaRecycleDiscardPileIfNeeded,
    durissimaDiscardFromHand,
    durissimaScartiDrawOne,
    durissimaRefillHandToCap,
    isBoardComplete,
    maybeCompleteDurissima,
    durissimaMoveIsFatal,
    durissimaPursueIdea,
    durissimaCanPursueIdeaThisTurn,
    chooseDurissimaIdeaPursuitPlacement,
    tryDurissimaEmergencyDraw,
    tryDurissimaAfterPlayDraw,
    tryDurissimaRefillHandToN,
    isDurissimaRefillToNEnabled,
    defaultDurissimaRefillToNAfterPlace,
    isDurissimaSoloWildEnabled,
    isPlayingSoloWildCard,
    isWildBlindBoardEntry,
    assignDurissimaSoloWildCard,
    defaultDurissimaSoloWildCard,
    gnSoloWildIsVisibleOnTop,
    gnSoloWildSmartAction,
    gnSoloWildSmartEnabled,
    isDurissimaVitaExtraEnabled,
    durissimaVitaExtraPoolLeft,
    canUseDurissimaVitaExtra,
    tryDurissimaVitaExtra,
    spendDurissimaVitaExtraUntilPlayable,
    spendDurissimaVitaExtraUntilSafe,
    gnSoloCountSafeLegalsNow,
    gnSoloHasSafeLegalNow,
    hasLegalPlacementsNow,
    resolveDurissimaStuck,
    canPassTurnVoluntarily,
    passTurn,
    drawForPlayer,
    endTurn,
    computeInitialDeal,
    defaultDurissimaExtraCards,
    defaultDurissimaFreeCellSlots,
    defaultDurissimaReserveEnabled,
    defaultDurissimaReserveSize,
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
    isTournamentGameOverStatus,
    tournamentTurnOrder,
    tournamentAddPoints,
    tournamentApplyMontePenalties,
    tournamentMarkFinished,
    tournamentCompleteGame,
    beginNextTournamentGame,
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
