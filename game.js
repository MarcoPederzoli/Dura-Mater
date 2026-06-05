"use strict";

const core = MPCardsCore;
const gameState = MPCardsGameState;
const COLOR_HEX = {
  Rosso: "#dc2626",
  Arancio: "#f97316",
  Giallo: "#facc15",
  Verde: "#16a34a",
  Azzurro: "#06b6d4",
  Blu: "#2563eb",
  Viola: "#7c3aed",
  Bianco: "#f1f5f9"
};
const COLOR_INK = {
  Bianco: "#111827",
  Giallo: "#111827",
  Arancio: "#111827",
  Azzurro: "#111827"
};
const COLOR_BY_INDEX = core.COLORS.map(color => COLOR_HEX[color]);
const INK_BY_INDEX = core.COLORS.map(color => COLOR_INK[color] || "#ffffff");
const SHAPE_SYMBOLS = ["●", "♥", "▲", "■", "★", "⬢", "⚡", "✚"];
const CANONICAL_DECK_CODES = core.deckCodesText();

function playerLabel(playerIndex) {
  return `Giocatore ${playerIndex + 1}`;
}

function formatTurnOrder(state) {
  if (!state || !state.turnOrder) return "";
  return state.turnOrder.map(playerLabel).join(" → ");
}

const els = {
  players: document.querySelector("#players"),
  size: document.querySelector("#size"),
  speed: document.querySelector("#speed"),
  speedLive: document.querySelector("#speed-live"),
  seed: document.querySelector("#seed"),
  newGame: document.querySelector("#new-game"),
  loadGameSetup: document.querySelector("#load-game-setup"),
  playerConfig: document.querySelector("#player-config"),
  gameShell: document.querySelector("#game-shell"),
  activePlayer: document.querySelector("#active-player"),
  drawCount: document.querySelector("#draw-count"),
  openPlayers: document.querySelector("#open-players"),
  openInfo: document.querySelector("#open-info"),
  modal: document.querySelector("#modal"),
  modalTitle: document.querySelector("#modal-title"),
  closeModal: document.querySelector("#close-modal"),
  tabPlayers: document.querySelector("#tab-players"),
  tabInfo: document.querySelector("#tab-info"),
  modalPlayers: document.querySelector("#modal-players"),
  modalInfo: document.querySelector("#modal-info"),
  status: document.querySelector("#status"),
  boardStatus: document.querySelector("#board-status"),
  turnStatus: document.querySelector("#turn-status"),
  board: document.querySelector("#board"),
  hand: document.querySelector("#hand"),
  handDock: document.querySelector("#hand-dock"),
  handDockTitle: document.querySelector("#hand-dock-title"),
  handDockStatus: document.querySelector("#hand-dock-status"),
  pass: document.querySelector("#pass"),
  botStep: document.querySelector("#bot-step"),
  undo: document.querySelector("#undo"),
  redo: document.querySelector("#redo"),
  saveGame: document.querySelector("#save-game"),
  loadGame: document.querySelector("#load-game"),
  loadGameFile: document.querySelector("#load-game-file"),
  strategyHintsPanel: document.querySelector("#strategy-hints-panel"),
  strategyHints: document.querySelector("#strategy-hints"),
  summary: document.querySelector("#summary"),
  log: document.querySelector("#log")
};

let game = null;
let timer = null;
let selectedCardUid = null;
let highlightedMoves = [];
let previewCardUid = null;
function state() {
  return game ? gameState.currentState(game.session) : null;
}

function syncGameState() {
  if (game) game.state = state();
}

function resetTransientUi() {
  selectedCardUid = null;
  highlightedMoves = [];
  previewCardUid = null;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function setStatus(text, className = "") {
  els.status.textContent = text;
  els.status.className = `status ${className}`.trim();
}

function syncSpeedControls(source) {
  const value = source.value;
  els.speed.value = value;
  els.speedLive.value = value;
}

function strategyOptions() {
  return core.STRATEGIES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function renderPlayerConfig() {
  const players = clampNumber(els.players.value, 1, 8, 3);
  const previousModes = Array.from(document.querySelectorAll(".player-mode")).map(item => item.value);
  const previousStrategies = Array.from(document.querySelectorAll(".player-strategy")).map(item => item.value);
  els.playerConfig.innerHTML = "";
  for (let player = 0; player < players; player++) {
    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <strong>${playerLabel(player)}<span class="hand-count"></span></strong>
      <label>Controllo
        <select class="player-mode">
          <option value="manual">Manuale</option>
          <option value="bot">Computer</option>
        </select>
      </label>
      <label>Strategia
        <select class="player-strategy">${strategyOptions()}</select>
      </label>
    `;
    row.querySelector(".player-mode").value = previousModes[player] || (player === 0 ? "manual" : "bot");
    row.querySelector(".player-strategy").value = previousStrategies[player] || "auto";
    row.querySelector(".player-mode").addEventListener("change", syncPlayersConfig);
    row.querySelector(".player-strategy").addEventListener("change", syncPlayersConfig);
    els.playerConfig.appendChild(row);
  }
  updatePlayerHandCounts();
}

function readPlayersConfig(players) {
  const modes = Array.from(document.querySelectorAll(".player-mode")).slice(0, players).map(item => item.value);
  const strategies = Array.from(document.querySelectorAll(".player-strategy")).slice(0, players).map(item => item.value);
  return { modes, strategies };
}

function startGame() {
  stopTimer();
  const players = clampNumber(els.players.value, 1, 8, 3);
  const size = clampNumber(els.size.value, 3, 8, 5);
  if (size < players) {
    setStatus("Il lato matrice deve essere almeno pari al numero di giocatori.", "bad");
    return;
  }
  const seed = els.seed.value.trim() || String(Date.now());
  const random = gameState.createRandom(seed);
  const config = readPlayersConfig(players);
  let deck;
  try {
    deck = core.simulationDeck();
  } catch (error) {
    setStatus(error.message, "bad");
    return;
  }
  let state;
  try {
    state = core.setupGame(deck, { players, size, random });
  } catch (error) {
    setStatus(error.message, "bad");
    return;
  }
  const strategies = core.resolveStrategies(config.strategies, players, random);
  const session = gameState.createSession({
    seed,
    deckCodes: CANONICAL_DECK_CODES,
    players,
    size,
    modes: config.modes,
    strategySettings: config.strategies,
    strategies
  }, state, random);
  game = {
    session,
    state: gameState.currentState(session),
    random,
    modes: config.modes,
    strategySettings: config.strategies,
    strategies,
    seed
  };
  enterPlayingMode();
  resetTransientUi();
  render();
  scheduleBotIfNeeded();
}

function enterPlayingMode() {
  document.body.classList.add("playing");
  els.gameShell.hidden = false;
  syncSpeedControls(els.speed);
  els.players.disabled = true;
  els.size.disabled = true;
  els.seed.disabled = true;
}

function syncPlayersConfig() {
  if (!game) return;
  const config = readPlayersConfig(game.state.players);
  game.modes = config.modes;
  game.strategySettings = config.strategies;
  game.strategies = core.resolveStrategies(config.strategies, game.state.players, game.random);
  gameState.updateConfig(game.session, {
    modes: game.modes,
    strategySettings: game.strategySettings,
    strategies: game.strategies
  });
  gameState.setCurrentState(game.session, game.state, game.random);
  render();
  scheduleBotIfNeeded();
}

function isBotTurn() {
  return game && game.modes[game.state.currentPlayer] === "bot" && game.state.status === "playing";
}

function currentRequirement() {
  return game.state.turnPlayed + 1;
}

function currentMoves() {
  if (!game || game.state.status !== "playing" || currentRequirement() > 4) return [];
  return core.legalPlacements(game.state, game.state.currentPlayer, currentRequirement());
}

function suggestionRandom(strategy) {
  const state = game.state;
  const boardKey = state.board.map(entry => `${entry.card.uid}@${entry.x},${entry.y}`).join("|");
  const handKey = (state.hands[state.currentPlayer] || []).map(card => card.uid).join("|");
  return core.mulberry32(core.hashSeed(`${game.seed}|${strategy}|${state.currentPlayer}|${state.turns}|${state.turnPlayed}|${boardKey}|${handKey}`));
}

function strategySuggestions() {
  if (!game || game.state.status !== "playing" || isBotTurn()) return [];
  const player = game.state.currentPlayer;
  const requirement = currentRequirement();
  if (requirement > 4) return [];
  const groups = new Map();
  for (const strategy of core.STRATEGY_KEYS) {
    const action = core.chooseAction(game.state, player, strategy, suggestionRandom(strategy));
    const key = action.type === "move" ? `${action.move.cardUid}|${action.move.x}|${action.move.y}` : "stop";
    if (!groups.has(key)) groups.set(key, { strategies: [], action });
    groups.get(key).strategies.push(strategy);
  }
  return Array.from(groups.values());
}

function applySuggestedAction(action) {
  if (!game || game.state.status !== "playing" || isBotTurn()) return;
  if (action.type === "move") {
    playManualMove(action.move);
    return;
  }
  passOrEndTurn();
}

function actionLabel(action) {
  if (action.type === "move") return `${action.move.card.code} in (${action.move.x}, ${action.move.y})`;
  return game.state.turnPlayed === 0 ? "Passa" : "Chiude turno";
}

function actionTitle(action, labels) {
  if (action.type === "move") {
    return `${labels}: gioca ${action.move.card.code} in (${action.move.x}, ${action.move.y}).`;
  }
  return `${labels}: ${game.state.turnPlayed === 0 ? "passa" : "chiude il turno"}.`;
}

function passOrEndTurn() {
  if (!game || game.state.status !== "playing") return;
  const player = game.state.currentPlayer;
  const label = game.state.turnPlayed === 0
    ? `${playerLabel(player)} passa.`
    : `${playerLabel(player)} chiude il turno.`;
  game.state = gameState.commit(game.session, label, game.random, nextState => {
    if (nextState.turnPlayed === 0) {
      core.passTurn(nextState);
    } else {
      core.endTurn(nextState);
    }
  });
  resetTransientUi();
  render();
  scheduleBotIfNeeded();
}

function runBotStep() {
  if (!isBotTurn()) return;
  const beforePlayer = game.state.currentPlayer;
  game.state = gameState.commit(game.session, `${playerLabel(beforePlayer)}: azione computer.`, game.random, nextState => {
    const result = core.botStep(nextState, game.strategies, game.random);
    if (result.played) {
      const move = result.move;
      return `${playerLabel(beforePlayer)} gioca ${move.card.code} in (${move.x}, ${move.y}).`;
    }
    if (result.passed) return `${playerLabel(beforePlayer)} passa.`;
    if (result.ended) return `${playerLabel(beforePlayer)} chiude il turno.`;
    return `${playerLabel(beforePlayer)}: nessuna azione.`;
  });
  resetTransientUi();
  render();
  scheduleBotIfNeeded();
}

function scheduleBotIfNeeded() {
  stopTimer();
  if (!isBotTurn()) return;
  const speed = els.speed.value;
  if (speed === "step") return;
  timer = setTimeout(runBotStep, Number(speed));
}

function stopTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function afterTimelineMove() {
  stopTimer();
  syncGameState();
  resetTransientUi();
  render();
  scheduleBotIfNeeded();
}

function undoMove() {
  if (!game || !gameState.undo(game.session, game.random)) return;
  afterTimelineMove();
}

function redoMove() {
  if (!game || !gameState.redo(game.session, game.random)) return;
  afterTimelineMove();
}

function saveGame() {
  if (!game) return;
  gameState.updateConfig(game.session, {
    seed: game.seed,
    deckCodes: CANONICAL_DECK_CODES,
    players: game.state.players,
    size: game.state.size,
    modes: game.modes,
    strategySettings: game.strategySettings,
    strategies: game.strategies
  });
  gameState.setCurrentState(game.session, game.state, game.random);
  const payload = JSON.stringify(gameState.exportSession(game.session), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mpcards-game-${game.seed || "partita"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadGame() {
  els.loadGameFile.value = "";
  els.loadGameFile.click();
}

function applyLoadedSession(session) {
  const config = session.config || {};
  const seed = config.seed || String(Date.now());
  const random = gameState.createRandom(seed);
  game = {
    session,
    state: gameState.currentState(session),
    random,
    modes: config.modes || [],
    strategySettings: config.strategySettings || [],
    strategies: config.strategies || [],
    seed
  };
  gameState.restoreRandom(game.session, game.random);
  if (!game.strategies.length) {
    game.strategies = core.resolveStrategies(game.strategySettings, game.state.players, game.random);
  }
  els.players.value = String(config.players || game.state.players);
  els.size.value = String(config.size || game.state.size);
  els.seed.value = seed;
  enterPlayingMode();
  renderPlayerConfig();
  Array.from(document.querySelectorAll(".player-mode")).forEach((item, index) => {
    item.value = game.modes[index] || (index === 0 ? "manual" : "bot");
  });
  Array.from(document.querySelectorAll(".player-strategy")).forEach((item, index) => {
    item.value = game.strategySettings[index] || "auto";
  });
  afterTimelineMove();
}

function readLoadedGameFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      applyLoadedSession(gameState.importSession(String(reader.result || "")));
    } catch (error) {
      setStatus(error.message, "bad");
    }
  });
  reader.readAsText(file);
}

function currentLegalMove(move) {
  if (!move) return null;
  return currentMoves().find(candidate =>
    candidate.cardUid === move.cardUid &&
    candidate.x === move.x &&
    candidate.y === move.y
  ) || null;
}

function playManualMove(move) {
  const player = game.state.currentPlayer;
  const legalMove = currentLegalMove(move);
  if (!legalMove) {
    resetTransientUi();
    setStatus("Mossa non legale.", "bad");
    render();
    return;
  }
  const baseLabel = `${playerLabel(player)} gioca ${legalMove.card.code} in (${legalMove.x}, ${legalMove.y}).`;
  game.state = gameState.commit(game.session, baseLabel, game.random, nextState => {
    core.applyPlacement(nextState, player, legalMove);
    if (nextState.status === "playing" && nextState.turnPlayed >= 4) {
      core.endTurn(nextState);
      return `${baseLabel} ${playerLabel(player)} chiude il turno.`;
    }
    return baseLabel;
  });
  resetTransientUi();
  render();
  scheduleBotIfNeeded();
}

function selectCard(cardUid) {
  selectedCardUid = cardUid;
  highlightedMoves = currentMoves().filter(move => move.cardUid === cardUid);
  if (highlightedMoves.length === 1) {
    playManualMove(highlightedMoves[0]);
    return;
  }
  render();
}

function hoverCard(cardUid) {
  if (!game || isBotTurn()) return;
  previewCardUid = null;
  highlightedMoves = currentMoves().filter(move => move.cardUid === cardUid);
  renderBoard();
  renderHand();
}

function clearHover() {
  previewCardUid = null;
  highlightedMoves = selectedCardUid
    ? currentMoves().filter(move => move.cardUid === selectedCardUid)
    : [];
  renderBoard();
  renderHand();
}

function hoverSuggestion(move) {
  if (!game || isBotTurn() || !move) return;
  previewCardUid = move.cardUid;
  highlightedMoves = [move];
  renderBoard();
  renderHand();
}

function clearSuggestionHover() {
  previewCardUid = null;
  highlightedMoves = selectedCardUid
    ? currentMoves().filter(move => move.cardUid === selectedCardUid)
    : [];
  renderBoard();
  renderHand();
}

function cardTile(card) {
  const tile = document.createElement("div");
  const colorIndex = Number(String(card.code).padStart(3, "0")[2]) - 1;
  const cardColor = COLOR_HEX[card.color] || COLOR_BY_INDEX[colorIndex] || "#111827";
  const cardInk = COLOR_INK[card.color] || INK_BY_INDEX[colorIndex] || "#ffffff";
  const shapeIndex = core.SHAPES.indexOf(card.shape);
  const artSrc = globalThis.MPCardsArt && MPCardsArt.imageForCode(card.code);
  tile.className = artSrc ? "card-tile has-art" : "card-tile";
  tile.style.setProperty("--card-bg", cardColor);
  tile.style.setProperty("--card-ink", cardInk);
  if (artSrc) {
    const img = document.createElement("img");
    img.src = artSrc;
    img.alt = `Carta ${card.code}`;
    img.loading = "lazy";
    img.decoding = "async";
    tile.appendChild(img);
    const fallback = document.createElement("div");
    fallback.className = "card-fallback";
    fallback.innerHTML = `${card.value}${SHAPE_SYMBOLS[shapeIndex] || ""}<small>${card.code}</small>`;
    tile.appendChild(fallback);
  } else {
    tile.innerHTML = `<div>${card.value}${SHAPE_SYMBOLS[shapeIndex] || ""}<small>${card.code}</small></div>`;
  }
  const nameLabel = globalThis.MPCardsNames
    ? MPCardsNames.formatCardName(card)
    : `${card.value} ${card.shape} ${card.color}`;
  tile.title = `${nameLabel} (${card.code})`;
  return tile;
}

function render() {
  renderBoard();
  renderHand();
  renderStrategyHints();
  renderSummary();
  renderActions();
  updatePlayerHandCounts();
  renderLog();
}

function renderBoard() {
  els.board.innerHTML = "";
  if (!game) return;
  const state = game.state;
  const view = boardViewBounds(state, highlightedMoves);
  const cellSize = boardCellSize();
  els.board.style.gridTemplateColumns = `repeat(${view.width}, ${cellSize}px)`;
  const offsetX = -view.minX;
  const offsetY = -view.minY;
  const placed = new Map();
  for (const entry of state.board) {
    placed.set(core.coordKey(entry.x + offsetX, entry.y + offsetY), entry);
  }
  const targets = new Map();
  for (const move of highlightedMoves) {
    targets.set(core.coordKey(move.x + offsetX, move.y + offsetY), move);
  }
  for (let y = view.minY; y <= view.maxY; y++) {
    for (let x = view.minX; x <= view.maxX; x++) {
      const cell = document.createElement("div");
      const entry = placed.get(core.coordKey(x + offsetX, y + offsetY));
      const target = targets.get(core.coordKey(x + offsetX, y + offsetY));
      cell.className = target ? "cell target" : "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      if (entry) {
        cell.className = "cell";
        cell.appendChild(cardTile(entry.card));
      } else if (target) {
        cell.title = `Gioca ${target.card.code} qui. Adiacenze compatibili: ${target.compatibleNeighbors}/${target.neighbors}. Caratteristiche condivise: ${target.matches}`;
        const score = document.createElement("span");
        score.className = "target-score";
        score.textContent = target.compatibleNeighbors;
        cell.appendChild(score);
        cell.addEventListener("click", () => playManualMove(target));
      }
      els.board.appendChild(cell);
    }
  }
  const footprint = core.boardFootprint(state);
  const closed = state.duraMaterClosed
    ? ` · Dura Mater chiusa (${playerLabel(state.closedByPlayer)})`
    : footprint.atAreaLimit
      ? " · ingombro al limite N×N"
      : footprint.atWidthLimit
        ? " · larghezza al limite N"
        : footprint.atHeightLimit
          ? " · altezza al limite N"
          : "";
  els.boardStatus.textContent = `${state.board.length}/${state.size * state.size} carte, pesca ${state.drawPile.length}${closed}`;
}

function boardCellSize() {
  if (window.matchMedia("(max-width: 420px)").matches) return 40;
  if (window.matchMedia("(max-width: 700px)").matches) return 46;
  return 58;
}

function boardViewBounds(state, moves) {
  if (state.board.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1 };
  }
  const bounds = core.boardBounds(state.board);
  let minX = bounds.minX;
  let maxX = bounds.maxX;
  let minY = bounds.minY;
  let maxY = bounds.maxY;
  if (bounds.width < state.size) {
    minX--;
    maxX++;
  }
  if (bounds.height < state.size) {
    minY--;
    maxY++;
  }
  for (const move of moves) {
    minX = Math.min(minX, move.x);
    maxX = Math.max(maxX, move.x);
    minY = Math.min(minY, move.y);
    maxY = Math.max(maxY, move.y);
  }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function renderHandInto(container) {
  if (!container) return;
  container.innerHTML = "";
  if (!game) return;
  const state = game.state;
  const hand = state.hands[state.currentPlayer] || [];
  const moves = currentMoves();
  const playable = new Set(moves.map(move => move.cardUid));
  const interactive = !isBotTurn();
  const useDockLayout = container === els.handDock;
  for (const card of hand) {
    const item = document.createElement("div");
    item.className = "hand-card";
    if (playable.has(card.uid) && interactive) item.classList.add("playable");
    if (selectedCardUid === card.uid) item.classList.add("selected");
    if (previewCardUid === card.uid) item.classList.add("preview");
    item.appendChild(cardTile(card));
    if (playable.has(card.uid) && interactive) {
      item.addEventListener("mouseenter", () => hoverCard(card.uid));
      item.addEventListener("mouseleave", clearHover);
      item.addEventListener("click", () => selectCard(card.uid));
    }
    if (useDockLayout) {
      const entry = document.createElement("div");
      entry.className = "hand-dock-entry";
      entry.appendChild(item);
      const name = document.createElement("p");
      name.className = "card-name";
      name.textContent = globalThis.MPCardsNames
        ? MPCardsNames.formatCardName(card)
        : card.code;
      entry.appendChild(name);
      container.appendChild(entry);
    } else {
      container.appendChild(item);
    }
  }
}

function renderHand() {
  if (!game) {
    renderHandInto(els.hand);
    renderHandInto(els.handDock);
    if (els.handDockStatus) els.handDockStatus.textContent = "";
    return;
  }
  const state = game.state;
  const player = state.currentPlayer;
  const hand = state.hands[player] || [];
  if (els.handDockTitle) {
    els.handDockTitle.textContent = `Mano — ${playerLabel(player)}`;
  }
  if (els.handDockStatus) {
    const modeLabel = game.modes[player] === "bot"
      ? core.strategyShortLabel(game.strategies[player])
      : "Manuale";
    els.handDockStatus.textContent = `${hand.length} carte · ${modeLabel}`;
  }
  renderHandInto(els.hand);
  renderHandInto(els.handDock);
}

function renderStrategyHints() {
  els.strategyHints.innerHTML = "";
  if (!game || game.state.status !== "playing" || isBotTurn()) {
    els.strategyHintsPanel.hidden = true;
    return;
  }
  els.strategyHintsPanel.hidden = false;
  const suggestions = strategySuggestions();
  for (const { strategies, action } of suggestions) {
    const shortLabels = strategies.map(strategy => core.strategyShortLabel(strategy)).join("/");
    const longLabels = strategies.map(strategy => core.strategyLabel(strategy)).join(", ");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "strategy-hint";
    button.innerHTML = "<strong></strong><span></span>";
    button.children[0].textContent = shortLabels;
    button.children[1].textContent = actionLabel(action);
    button.title = actionTitle(action, longLabels);
    if (action.type === "move") {
      button.addEventListener("mouseenter", () => hoverSuggestion(action.move));
      button.addEventListener("mouseleave", clearSuggestionHover);
      button.addEventListener("focus", () => hoverSuggestion(action.move));
      button.addEventListener("blur", clearSuggestionHover);
    }
    button.addEventListener("click", () => applySuggestedAction(action));
    els.strategyHints.appendChild(button);
  }
}

function renderActions() {
  const hasGame = !!game;
  els.undo.disabled = !hasGame || !gameState.canUndo(game.session);
  els.redo.disabled = !hasGame || !gameState.canRedo(game.session);
  els.saveGame.disabled = !hasGame;
  if (!game || game.state.status !== "playing") {
    els.pass.disabled = true;
    els.botStep.disabled = true;
    return;
  }
  const moves = currentMoves();
  els.pass.style.display = isBotTurn() ? "none" : "inline-grid";
  els.botStep.style.display = isBotTurn() ? "inline-grid" : "none";
  els.pass.disabled = isBotTurn();
  els.pass.className = moves.length === 0 || game.state.turnPlayed > 0 ? "warn" : "secondary";
  els.botStep.disabled = !isBotTurn() || els.speed.value !== "step";
}

function renderSummary() {
  els.summary.innerHTML = "";
  if (!game) return;
  const state = game.state;
  const player = state.currentPlayer;
  els.turnStatus.textContent = state.status === "playing"
    ? `${playerLabel(player)}, requisito ${Math.min(currentRequirement(), 4)}`
    : state.status === "success"
      ? `Vince ${playerLabel(state.winner)}`
      : "Stallo";
  els.activePlayer.textContent = state.status === "playing"
    ? `${playerLabel(player)} ${game.modes[player] === "bot" ? core.strategyShortLabel(game.strategies[player]) : "Manuale"}`
    : state.status === "success"
      ? `Vince ${playerLabel(state.winner)}`
      : "Stallo";
  els.drawCount.textContent = `Pesca: ${state.drawPile.length}`;
  const rows = [
    ["Stato", state.status],
    ["Turni", state.turns],
    ["Dura Mater", state.duraMaterClosed ? `Chiusa (da ${playerLabel(state.closedByPlayer)})` : "Aperta"],
    ...(state.duraMaterClosed ? [["Ordine turni", formatTurnOrder(state)]] : []),
    ["Giocatore", `${playerLabel(player)} (${game.modes[player]})`],
    ["Strategia", game.modes[player] === "bot" ? core.strategyLabel(game.strategies[player]) : "Manuale"],
    ["Mazzo pesca", state.drawPile.length],
    ["Carte giocate nel turno", state.turnPlayed],
    ["Passaggi consecutivi", state.consecutivePasses]
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.innerHTML = `<span></span><strong></strong>`;
    row.children[0].textContent = label;
    row.children[1].textContent = value;
    els.summary.appendChild(row);
  }
  setStatus(
    state.status === "playing" ? "Partita in corso." : state.status === "success" ? `Vince ${playerLabel(state.winner)}.` : "Partita in stallo.",
    state.status === "success" ? "good" : state.status === "stalled" ? "bad" : ""
  );
}

function updatePlayerHandCounts() {
  const rows = Array.from(els.playerConfig.querySelectorAll(".player-row"));
  rows.forEach((row, index) => {
    const count = game?.state.hands[index]?.length;
    const node = row.querySelector(".hand-count");
    if (node) node.textContent = count === undefined ? "" : ` · ${count} carte`;
  });
}

function openModal(tab) {
  els.modal.hidden = false;
  showModalTab(tab);
}

function closeModal() {
  els.modal.hidden = true;
}

function showModalTab(tab) {
  const isPlayers = tab === "players";
  els.modalTitle.textContent = isPlayers ? "Giocatori" : "Stato / log";
  els.modalPlayers.hidden = !isPlayers;
  els.modalInfo.hidden = isPlayers;
  if (isPlayers) {
    els.modalPlayers.appendChild(els.playerConfig);
    els.playerConfig.classList.remove("hidden");
    updatePlayerHandCounts();
  }
}

function renderLog() {
  els.log.textContent = game ? gameState.labels(game.session).slice().reverse().join("\n") : "";
}

els.players.addEventListener("input", renderPlayerConfig);
els.newGame.addEventListener("click", startGame);
els.loadGameSetup.addEventListener("click", loadGame);
els.openPlayers.addEventListener("click", () => openModal("players"));
els.openInfo.addEventListener("click", () => openModal("info"));
els.tabPlayers.addEventListener("click", () => showModalTab("players"));
els.tabInfo.addEventListener("click", () => showModalTab("info"));
els.closeModal.addEventListener("click", closeModal);
els.pass.addEventListener("click", passOrEndTurn);
els.botStep.addEventListener("click", runBotStep);
els.undo.addEventListener("click", undoMove);
els.redo.addEventListener("click", redoMove);
els.saveGame.addEventListener("click", saveGame);
els.loadGame.addEventListener("click", loadGame);
els.loadGameFile.addEventListener("change", readLoadedGameFile);
els.speed.addEventListener("change", () => {
  syncSpeedControls(els.speed);
  scheduleBotIfNeeded();
});
els.speedLive.addEventListener("change", () => {
  syncSpeedControls(els.speedLive);
  scheduleBotIfNeeded();
});
window.addEventListener("resize", renderBoard);

renderPlayerConfig();
