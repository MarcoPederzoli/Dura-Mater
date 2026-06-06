"use strict";

/** Etichetta build UI — se non la vedi in fondo alla pagina, non stai aprendo questo file. */
const DM_UI_BUILD = document.body.dataset.gameMode === "real"
  ? "Gioco reale 2026-06-05"
  : "UI layout mano 2026-06-05";

const GAME_MODE = document.body.dataset.gameMode === "real" ? "real" : "simulation";

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
const GAME_PREFS_STORAGE_KEY = document.body.dataset.prefsKey
  || (GAME_MODE === "real" ? "dura-mater-gioco-v1" : "dura-mater-game-v1");
const SPEED_VALUES = new Set(["step", "5000", "1000", "500"]);
const OPPONENT_NAMES = Object.freeze([
  "Dotto",
  "Brontolo",
  "Gongolo",
  "Pisolo",
  "Mammolo",
  "Eolo",
  "Cucciolo"
]);

const DEFAULT_GAME_PREFS = {
  version: 1,
  players: 3,
  size: 5,
  speed: "1000",
  seed: "",
  playerOneName: "Giocatore 1",
  modes: ["manual", "bot", "bot", "bot", "bot", "bot", "bot", "bot"],
  strategies: Array.from({ length: 8 }, () => "auto")
};

function readPlayerOneName() {
  const raw = els.playerOneName?.value?.trim();
  return raw || DEFAULT_GAME_PREFS.playerOneName;
}

function playerOneNameValue() {
  if (game?.playerOneName) return game.playerOneName;
  return readPlayerOneName();
}

function playerLabel(playerIndex) {
  if (playerIndex === 0) return playerOneNameValue();
  return OPPONENT_NAMES[playerIndex - 1] || `Giocatore ${playerIndex + 1}`;
}

function playerShortLabel(playerIndex) {
  return playerLabel(playerIndex);
}

function isRealGame() {
  return GAME_MODE === "real";
}

function handViewPlayer() {
  if (!game) return 0;
  const state = game.state;
  if (!isRealGame()) return state.currentPlayer;
  if (game.modes[state.currentPlayer] === "manual") return state.currentPlayer;
  const firstManual = game.modes.indexOf("manual");
  return firstManual >= 0 ? firstManual : state.currentPlayer;
}

function isHumanPlayerTurn() {
  if (!game || !isRealGame() || game.state.status !== "playing") return false;
  return game.modes[game.state.currentPlayer] === "manual";
}

function activeHandStatusElement() {
  if (isRealGame() && isHumanPlayerTurn() && els.sidebarHandStatus) return els.sidebarHandStatus;
  return els.handDockStatus;
}

function formatTurnOrder(state) {
  if (!state || !state.turnOrder) return "";
  const arrow = state.turnDirection === -1 ? " ← " : " → ";
  return state.turnOrder.map(playerLabel).join(arrow);
}

const els = {
  players: document.querySelector("#players"),
  size: document.querySelector("#size"),
  speed: document.querySelector("#speed"),
  speedLive: document.querySelector("#speed-live"),
  seed: document.querySelector("#seed"),
  playerOneName: document.querySelector("#player-one-name"),
  setupSection: document.querySelector("#setup-section"),
  newGame: document.querySelector("#new-game"),
  newGamePlay: document.querySelector("#new-game-play"),
  resetPrefs: document.querySelector("#reset-prefs"),
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
  turnFlow: document.querySelector("#turn-flow"),
  turnFlowCaption: document.querySelector("#turn-flow-caption"),
  inversionAlert: document.querySelector("#inversion-alert"),
  board: document.querySelector("#board"),
  handDockPanel: document.querySelector("#hand-dock-panel"),
  handDock: document.querySelector("#hand-dock"),
  handDockTitle: document.querySelector("#hand-dock-title"),
  handDockStatus: document.querySelector("#hand-dock-status"),
  playerHandsPanel: document.querySelector("#player-hands-panel"),
  sidebarHandPanel: document.querySelector("#sidebar-hand-panel"),
  sidebarHand: document.querySelector("#sidebar-hand"),
  sidebarHandTitle: document.querySelector("#sidebar-hand-title"),
  sidebarHandStatus: document.querySelector("#sidebar-hand-status"),
  handCountsList: document.querySelector("#hand-counts-list"),
  pass: document.querySelector("#pass"),
  botStep: document.querySelector("#bot-step"),
  undo: document.querySelector("#undo"),
  redo: document.querySelector("#redo"),
  saveGame: document.querySelector("#save-game"),
  loadGame: document.querySelector("#load-game"),
  loadGameFile: document.querySelector("#load-game-file"),
  strategyHintsPanel: document.querySelector("#strategy-hints-panel"),
  strategyHintsIntro: document.querySelector("#strategy-hints-intro"),
  strategyAssignments: document.querySelector("#strategy-assignments"),
  strategyHints: document.querySelector("#strategy-hints"),
  playerHandsList: document.querySelector("#player-hands-list"),
  summary: document.querySelector("#summary"),
  log: document.querySelector("#log"),
  playFeedback: document.querySelector("#play-feedback")
};

let game = null;
let timer = null;
let selectedCardUid = null;
let highlightedMoves = [];
let previewCardUid = null;
let inversionUiFlags = { firstAxisInversionDone: false, duraMaterClosed: false };
let loadedPlayerPrefs = null;
let saveGamePrefsTimer = null;

function resetInversionUiFlags(state) {
  inversionUiFlags = {
    firstAxisInversionDone: !!(state && state.firstAxisInversionDone),
    duraMaterClosed: !!(state && state.duraMaterClosed)
  };
}
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
  setPlayFeedback("");
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

function setPlayFeedback(text) {
  if (!els.playFeedback) return;
  els.playFeedback.textContent = text || "";
}

function updateHandSelectionStatus(handLength, player, modeLabel) {
  const statusEl = activeHandStatusElement();
  if (!statusEl) return;
  if (selectedCardUid && game) {
    const hand = game.state.hands[player] || [];
    const card = hand.find(entry => entry.uid === selectedCardUid);
    const name = card && globalThis.MPCardsNames
      ? MPCardsNames.formatCardName(card)
      : card?.code || "carta";
    statusEl.textContent = `${handLength} carte · Selezionata: ${name} — clicca una casella evidenziata`;
    statusEl.className = "status bad";
    return;
  }
  statusEl.className = "status";
  statusEl.textContent = `${handLength} carte · ${modeLabel}`;
}

function syncSpeedControls(source) {
  const value = source.value;
  els.speed.value = value;
  els.speedLive.value = value;
}

function strategyOptions() {
  return core.STRATEGIES.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function normalizeGamePrefs(prefs) {
  const normalized = { ...DEFAULT_GAME_PREFS, ...prefs };
  normalized.players = clampNumber(normalized.players, 1, 8, DEFAULT_GAME_PREFS.players);
  normalized.size = clampNumber(normalized.size, 3, 8, DEFAULT_GAME_PREFS.size);
  normalized.speed = SPEED_VALUES.has(normalized.speed) ? normalized.speed : DEFAULT_GAME_PREFS.speed;
  normalized.seed = typeof normalized.seed === "string" ? normalized.seed : DEFAULT_GAME_PREFS.seed;
  normalized.playerOneName = typeof normalized.playerOneName === "string"
    ? normalized.playerOneName.trim().slice(0, 32)
    : DEFAULT_GAME_PREFS.playerOneName;
  if (!normalized.playerOneName) normalized.playerOneName = DEFAULT_GAME_PREFS.playerOneName;
  const validModes = new Set(["manual", "bot"]);
  const validStrategy = new Set(core.STRATEGY_KEYS.concat(["auto"]));
  normalized.modes = Array.from({ length: 8 }, (_, index) => {
    const value = normalized.modes?.[index];
    if (validModes.has(value)) return value;
    return index === 0 ? "manual" : "bot";
  });
  normalized.strategies = Array.from({ length: 8 }, (_, index) => {
    const value = normalized.strategies?.[index];
    return validStrategy.has(value) ? value : "auto";
  });
  return normalized;
}

function collectGamePrefs() {
  const players = clampNumber(els.players.value, 1, 8, DEFAULT_GAME_PREFS.players);
  const config = readPlayersConfig(players);
  return normalizeGamePrefs({
    version: 1,
    players,
    size: els.size.value,
    speed: els.speed.value,
    seed: els.seed.value,
    playerOneName: readPlayerOneName(),
    modes: config.modes.concat(DEFAULT_GAME_PREFS.modes).slice(0, 8),
    strategies: config.strategies.concat(DEFAULT_GAME_PREFS.strategies).slice(0, 8)
  });
}

function applyGamePrefs(prefs) {
  const normalized = normalizeGamePrefs(prefs);
  els.players.value = String(normalized.players);
  els.size.value = String(normalized.size);
  els.speed.value = normalized.speed;
  els.speedLive.value = normalized.speed;
  els.seed.value = normalized.seed;
  if (els.playerOneName) els.playerOneName.value = normalized.playerOneName;
  loadedPlayerPrefs = {
    modes: normalized.modes,
    strategies: normalized.strategies
  };
  renderPlayerConfig();
  loadedPlayerPrefs = null;
  return normalized;
}

function loadSavedGamePrefs() {
  try {
    const raw = localStorage.getItem(GAME_PREFS_STORAGE_KEY);
    if (!raw) return applyGamePrefs(DEFAULT_GAME_PREFS);
    return applyGamePrefs(JSON.parse(raw));
  } catch {
    return applyGamePrefs(DEFAULT_GAME_PREFS);
  }
}

function saveGamePrefsNow() {
  try {
    localStorage.setItem(GAME_PREFS_STORAGE_KEY, JSON.stringify(collectGamePrefs()));
  } catch {
    // quota o storage disabilitato
  }
}

function scheduleSaveGamePrefs() {
  clearTimeout(saveGamePrefsTimer);
  saveGamePrefsTimer = setTimeout(saveGamePrefsNow, 250);
}

function resetGamePrefsToDefaults() {
  try {
    localStorage.removeItem(GAME_PREFS_STORAGE_KEY);
  } catch {
    // ignore
  }
  applyGamePrefs(DEFAULT_GAME_PREFS);
  setStatus("Opzioni ripristinate ai valori predefiniti.", "good");
}

function bindGamePrefsPersistence() {
  const fields = [els.players, els.size, els.speed, els.seed, els.playerOneName];
  for (const field of fields) {
    if (!field) continue;
    field.addEventListener("input", scheduleSaveGamePrefs);
    field.addEventListener("change", scheduleSaveGamePrefs);
  }
  if (els.playerConfig) {
    els.playerConfig.addEventListener("change", onPlayerConfigChange);
  }
  if (els.playerOneName) {
    els.playerOneName.addEventListener("input", onPlayerOneNameInput);
  }
}

function onPlayerOneNameInput() {
  scheduleSaveGamePrefs();
  if (game) {
    game.playerOneName = readPlayerOneName();
    render();
    return;
  }
  const firstRow = els.playerConfig.querySelector(".player-row strong");
  if (firstRow) {
    const count = firstRow.querySelector(".hand-count");
    const countText = count?.textContent || "";
    firstRow.innerHTML = `${playerLabel(0)}<span class="hand-count">${countText}</span>`;
  }
}

function onPlayerConfigChange() {
  if (game) syncPlayersConfig();
  scheduleSaveGamePrefs();
}

function renderPlayerConfig() {
  const players = clampNumber(els.players.value, 1, 8, 3);
  const previousModes = loadedPlayerPrefs?.modes
    || Array.from(document.querySelectorAll(".player-mode")).map(item => item.value);
  const previousStrategies = loadedPlayerPrefs?.strategies
    || Array.from(document.querySelectorAll(".player-strategy")).map(item => item.value);
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
  saveGamePrefsNow();
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
  const playerOneName = readPlayerOneName();
  const session = gameState.createSession({
    seed,
    deckCodes: CANONICAL_DECK_CODES,
    players,
    size,
    modes: config.modes,
    strategySettings: config.strategies,
    strategies,
    playerOneName
  }, state, random);
  game = {
    session,
    state: gameState.currentState(session),
    random,
    modes: config.modes,
    strategySettings: config.strategies,
    strategies,
    seed,
    playerOneName
  };
  enterPlayingMode();
  resetTransientUi();
  resetInversionUiFlags(state);
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
  if (els.playerOneName) els.playerOneName.disabled = true;
}

function exitPlayingMode() {
  stopTimer();
  closeModal();
  game = null;
  document.body.classList.remove("playing");
  els.gameShell.hidden = true;
  els.players.disabled = false;
  els.size.disabled = false;
  els.seed.disabled = false;
  if (els.playerOneName) els.playerOneName.disabled = false;
  resetTransientUi();
  render();
}

function prepareNewGame() {
  saveGamePrefsNow();
  exitPlayingMode();
  if (els.setupSection) {
    els.setupSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  setStatus("Impostazioni pronte: avvia una nuova partita.", "good");
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
    strategies: game.strategies,
    playerOneName: game.playerOneName || readPlayerOneName()
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
    seed,
    playerOneName: config.playerOneName || DEFAULT_GAME_PREFS.playerOneName
  };
  gameState.restoreRandom(game.session, game.random);
  if (!game.strategies.length) {
    game.strategies = core.resolveStrategies(game.strategySettings, game.state.players, game.random);
  }
  els.players.value = String(config.players || game.state.players);
  els.size.value = String(config.size || game.state.size);
  els.seed.value = seed;
  if (els.playerOneName) {
    els.playerOneName.value = game.playerOneName;
  }
  enterPlayingMode();
  resetInversionUiFlags(game.state);
  renderPlayerConfig();
  Array.from(document.querySelectorAll(".player-mode")).forEach((item, index) => {
    item.value = game.modes[index] || (index === 0 ? "manual" : "bot");
  });
  Array.from(document.querySelectorAll(".player-strategy")).forEach((item, index) => {
    item.value = game.strategySettings[index] || "auto";
  });
  saveGamePrefsNow();
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
  if (!game) return;
  if (isBotTurn()) {
    setPlayFeedback(`È il turno del computer: attendi, oppure imposta ${playerLabel(0)} su Manuale.`);
    return;
  }
  const hand = game.state.hands[game.state.currentPlayer] || [];
  const card = hand.find(entry => entry.uid === cardUid);
  const moves = currentMoves().filter(move => move.cardUid === cardUid);
  if (!card || moves.length === 0) {
    setPlayFeedback("Questa carta non si può posare ora.");
    return;
  }
  selectedCardUid = cardUid;
  previewCardUid = null;
  highlightedMoves = moves;
  const name = globalThis.MPCardsNames ? MPCardsNames.formatCardName(card) : card.code;
  setPlayFeedback(`Carta selezionata: ${name} — ora clicca sul tabellone.`);
  renderBoard();
  renderHand();
  renderActions();
}

function activateHandCard(cardUid, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  selectCard(cardUid);
}

function hoverCard(cardUid) {
  if (!game || isBotTurn()) return;
  if (selectedCardUid) return;
  previewCardUid = null;
  highlightedMoves = currentMoves().filter(move => move.cardUid === cardUid);
  renderBoard();
}

function clearHover() {
  previewCardUid = null;
  highlightedMoves = selectedCardUid
    ? currentMoves().filter(move => move.cardUid === selectedCardUid)
    : [];
  renderBoard();
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

function cardBackTile() {
  const tile = document.createElement("div");
  tile.className = "card-back";
  const backSrc = globalThis.MPCardsArt && MPCardsArt.back;
  if (backSrc) {
    const img = document.createElement("img");
    img.src = backSrc;
    img.alt = "Retro carta";
    img.draggable = false;
    img.loading = "lazy";
    img.decoding = "async";
    tile.appendChild(img);
  } else {
    tile.textContent = "?";
  }
  return tile;
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
    img.draggable = false;
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

function renderTurnFlow() {
  if (!els.turnFlow) return;
  els.turnFlow.innerHTML = "";
  if (!game) {
    if (els.turnFlowCaption) els.turnFlowCaption.textContent = "";
    if (els.inversionAlert) {
      els.inversionAlert.hidden = true;
      els.inversionAlert.innerHTML = "";
    }
    return;
  }
  const state = game.state;
  const current = state.currentPlayer;
  const next = core.nextPlayerId(state);
  const inverted = state.turnDirection === -1;
  const leftPlayer = inverted ? next : current;
  const rightPlayer = inverted ? current : next;
  const arrow = inverted ? "←" : "→";

  function playerNode(playerIndex, isCurrent) {
    const node = document.createElement("span");
    node.className = `turn-flow-player${isCurrent ? " current" : ""}`;
    node.textContent = playerShortLabel(playerIndex);
    node.title = playerLabel(playerIndex);
    return node;
  }

  els.turnFlow.appendChild(playerNode(leftPlayer, !inverted));
  const arrowNode = document.createElement("span");
  arrowNode.className = "turn-flow-arrow";
  arrowNode.textContent = arrow;
  arrowNode.setAttribute("aria-hidden", "true");
  els.turnFlow.appendChild(arrowNode);
  els.turnFlow.appendChild(playerNode(rightPlayer, inverted));

  if (els.turnFlowCaption) {
    const currentName = playerShortLabel(current);
    const nextName = playerShortLabel(next);
    els.turnFlowCaption.textContent = state.status === "playing"
      ? inverted
        ? `Al turno ${currentName} · dopo di lui tocca a ${nextName} (senso invertito)`
        : `Al turno ${currentName} · dopo di lui tocca a ${nextName}`
      : "";
  }

  renderInversionAlert(state);
}

function renderInversionAlert(state) {
  if (!els.inversionAlert) return;
  const messages = [];
  const axisJustClosed = state.firstAxisInversionDone && !inversionUiFlags.firstAxisInversionDone;
  const dmJustClosed = state.duraMaterClosed && !inversionUiFlags.duraMaterClosed;

  if (axisJustClosed) {
    messages.push(
      "<p><strong>Primo limite chiuso.</strong> Una fila o colonna di N carte ha fissato un lato della Dura Mater: l'ordine di gioco si inverte.</p>"
    );
  }
  if (dmJustClosed) {
    messages.push(
      "<p><strong>Dura Mater chiusa.</strong> L'ingombro ha raggiunto N×N: seconda inversione dell'ordine di gioco.</p>"
    );
  }
  if (axisJustClosed && dmJustClosed) {
    messages.push(
      "<p>Entrambi i limiti sono caduti con la stessa posa: le due inversioni si annullano e la direzione resta invariata.</p>"
    );
  }

  inversionUiFlags = {
    firstAxisInversionDone: !!state.firstAxisInversionDone,
    duraMaterClosed: !!state.duraMaterClosed
  };

  if (messages.length) {
    els.inversionAlert.hidden = false;
    els.inversionAlert.innerHTML = messages.join("");
    return;
  }

  const persistent = [];
  if (state.firstAxisInversionDone) {
    persistent.push("<p>Primo limite chiuso — ordine invertito.</p>");
  }
  if (state.duraMaterClosed) {
    persistent.push("<p>Dura Mater chiusa — ordine invertito di nuovo.</p>");
  }
  if (persistent.length) {
    els.inversionAlert.hidden = false;
    els.inversionAlert.innerHTML = persistent.join("");
    return;
  }

  els.inversionAlert.hidden = true;
  els.inversionAlert.innerHTML = "";
}

function render() {
  renderBoard();
  renderTurnFlow();
  renderRealGameSidebar();
  renderHandCountsBar();
  renderHand();
  renderStrategyHints();
  renderSummary();
  renderActions();
  updatePlayerHandCounts();
  renderLog();
  if (selectedCardUid && game && game.state.status === "playing") {
    const player = handViewPlayer();
    const hand = game.state.hands[player] || [];
    const modeLabel = game.modes[player] === "bot"
      ? core.strategyShortLabel(game.strategies[player])
      : "Manuale";
    updateHandSelectionStatus(hand.length, player, modeLabel);
  }
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
        cell.addEventListener("click", () => {
          if (!selectedCardUid) {
            setPlayFeedback("Seleziona prima una carta in mano (click sulla carta → bordo rosso).");
            return;
          }
          if (target.cardUid !== selectedCardUid) {
            setPlayFeedback("Questa casella non corrisponde alla carta selezionata.");
            return;
          }
          playManualMove(target);
        });
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
  if (window.matchMedia("(max-width: 420px)").matches) return 64;
  if (window.matchMedia("(max-width: 700px)").matches) return 74;
  return 93;
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

function renderRealGameSidebar() {
  if (!isRealGame()) return;
  const humanTurn = isHumanPlayerTurn();
  if (els.playerHandsPanel) els.playerHandsPanel.hidden = humanTurn;
  if (els.sidebarHandPanel) els.sidebarHandPanel.hidden = !humanTurn;
  if (humanTurn) {
    renderSidebarHand();
  } else {
    renderPlayerHandStacks();
  }
}

function appendHandCards(container, layout, player, hand, interactive) {
  const moves = currentMoves();
  const playable = new Set(moves.map(move => move.cardUid));
  const useSidebarLayout = layout === "sidebar";
  for (const card of hand) {
    const item = document.createElement("div");
    const isSelected = selectedCardUid === card.uid;
    const canPlay = playable.has(card.uid) && interactive;
    item.className = "hand-card";
    item.dataset.cardUid = card.uid;
    if (canPlay && !isSelected) item.classList.add("playable");
    if (isSelected) item.classList.add("selected");
    if (previewCardUid === card.uid) item.classList.add("preview");
    item.appendChild(cardTile(card));
    if (isSelected) {
      const badge = document.createElement("span");
      badge.className = "hand-card-selected-badge";
      badge.textContent = "Scelta";
      item.appendChild(badge);
    }
    const entry = document.createElement("div");
    entry.className = useSidebarLayout ? "sidebar-hand-entry" : "hand-dock-entry";
    if (canPlay) {
      item.addEventListener("mouseenter", () => hoverCard(card.uid));
      item.addEventListener("mouseleave", clearHover);
      entry.addEventListener("click", event => activateHandCard(card.uid, event));
    }
    entry.appendChild(item);
    const name = document.createElement("p");
    name.className = "card-name";
    name.textContent = globalThis.MPCardsNames
      ? MPCardsNames.formatCardName(card)
      : card.code;
    entry.appendChild(name);
    container.appendChild(entry);
  }
}

function renderHandCountsBar() {
  if (!els.handCountsList || !isRealGame()) return;
  els.handCountsList.innerHTML = "";
  if (!game) return;
  const state = game.state;
  for (let player = 0; player < state.players; player++) {
    const count = (state.hands[player] || []).length;
    const chip = document.createElement("div");
    chip.className = "hand-count-chip";
    if (state.status === "success" && player === state.winner) {
      chip.classList.add("winner");
    } else if (state.status === "playing" && player === state.currentPlayer) {
      chip.classList.add("current");
    }
    if (player === handViewPlayer()) chip.classList.add("you");
    const name = document.createElement("strong");
    name.textContent = playerShortLabel(player);
    const detail = document.createElement("span");
    if (state.status === "success" && player === state.winner && count === 0) {
      detail.textContent = "Vince";
    } else {
      detail.textContent = String(count);
      chip.title = count === 1 ? "1 carta in mano" : `${count} carte in mano`;
    }
    chip.appendChild(name);
    chip.appendChild(detail);
    els.handCountsList.appendChild(chip);
  }
}

function renderSidebarHand() {
  if (!els.sidebarHand) return;
  els.sidebarHand.innerHTML = "";
  if (!game) return;
  const state = game.state;
  const player = state.currentPlayer;
  const hand = state.hands[player] || [];
  const interactive = isHumanPlayerTurn();
  if (els.sidebarHandTitle) {
    els.sidebarHandTitle.textContent = `La tua mano — ${playerShortLabel(player)}`;
  }
  updateHandSelectionStatus(hand.length, player, "Manuale");
  appendHandCards(els.sidebarHand, "sidebar", player, hand, interactive);
}

function renderPlayerHandStacks() {
  if (!els.playerHandsList || !isRealGame()) return;
  els.playerHandsList.innerHTML = "";
  if (!game) return;
  const state = game.state;
  for (let player = 0; player < state.players; player++) {
    const hand = state.hands[player] || [];
    const row = document.createElement("div");
    row.className = "player-hand-row";
    if (state.status === "success" && player === state.winner) {
      row.classList.add("winner");
    } else if (state.status === "playing" && player === state.currentPlayer) {
      row.classList.add("current");
    }
    const head = document.createElement("div");
    head.className = "player-hand-row-head";
    const title = document.createElement("strong");
    title.textContent = playerShortLabel(player);
    const meta = document.createElement("span");
    meta.textContent = game.modes[player] === "bot"
      ? "Computer"
      : player === handViewPlayer()
        ? "Tu"
        : "Manuale";
    head.appendChild(title);
    head.appendChild(meta);
    row.appendChild(head);

    const backs = document.createElement("div");
    backs.className = "player-hand-backs";
    backs.setAttribute("aria-label", `${hand.length} carte`);
    if (hand.length === 0) {
      const empty = document.createElement("p");
      const isWinner = state.status === "success" && player === state.winner;
      empty.className = isWinner ? "player-hand-empty winner-label" : "player-hand-empty";
      empty.textContent = isWinner ? "Vince" : "Nessuna carta";
      backs.appendChild(empty);
    } else {
      for (let index = 0; index < hand.length; index++) {
        backs.appendChild(cardBackTile());
      }
    }
    row.appendChild(backs);
    els.playerHandsList.appendChild(row);
  }
}

function renderHand() {
  if (isRealGame()) {
    if (!game) {
      if (els.sidebarHandStatus) els.sidebarHandStatus.textContent = "";
      return;
    }
    if (isHumanPlayerTurn()) renderSidebarHand();
    return;
  }
  if (!els.handDock) return;
  els.handDock.innerHTML = "";
  if (!game) {
    if (els.handDockStatus) els.handDockStatus.textContent = "";
    return;
  }
  const state = game.state;
  const player = handViewPlayer();
  const hand = state.hands[player] || [];
  const interactive = !isBotTurn() && state.currentPlayer === player;
  if (els.handDockTitle) {
    els.handDockTitle.textContent = `Mano — ${playerLabel(player)}`;
  }
  const modeLabel = game.modes[player] === "bot"
    ? core.strategyLabel(game.strategies[player])
    : "Manuale";
  updateHandSelectionStatus(hand.length, player, modeLabel);
  appendHandCards(els.handDock, "dock", player, hand, interactive);
}

function playerAssignmentLabel(playerIndex) {
  if (!game) return "";
  return game.modes[playerIndex] === "bot"
    ? core.strategyLabel(game.strategies[playerIndex])
    : "Manuale";
}

function formatPlayerAssignments() {
  if (!game) return "";
  return Array.from({ length: game.state.players }, (_, index) =>
    `${playerShortLabel(index)}: ${playerAssignmentLabel(index)}`
  ).join(" · ");
}

function renderStrategyHints() {
  if (!els.strategyHints) return;
  els.strategyHints.innerHTML = "";
  if (isRealGame() || !game || game.state.status !== "playing" || isBotTurn()) {
    if (els.strategyHintsPanel) els.strategyHintsPanel.hidden = true;
    if (els.strategyHintsIntro) els.strategyHintsIntro.textContent = "";
    if (els.strategyAssignments) els.strategyAssignments.textContent = "";
    return;
  }
  if (els.strategyHintsPanel) els.strategyHintsPanel.hidden = false;
  const player = game.state.currentPlayer;
  if (els.strategyHintsIntro) {
    els.strategyHintsIntro.textContent =
      `Non sono le strategie impostate in partita per ogni giocatore. ` +
      `Mostra cosa giocherebbe ogni tipo di computer al posto di ${playerLabel(player)} (${playerShortLabel(player)}) ` +
      `con la mano e il tabellone attuali. Passa il mouse per l'anteprima, clicca per applicare la mossa.`;
  }
  if (els.strategyAssignments) {
    els.strategyAssignments.textContent = `Strategie in partita: ${formatPlayerAssignments()}`;
  }
  for (const strategy of core.STRATEGY_KEYS) {
    const action = core.chooseAction(
      game.state,
      player,
      strategy,
      suggestionRandom(strategy)
    );
    const label = core.strategyLabel(strategy);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "strategy-hint";
    button.innerHTML = "<p class=\"strategy-hint-desc\"></p><p class=\"strategy-hint-move\"></p>";
    button.children[0].textContent = label;
    button.children[1].textContent = actionLabel(action);
    button.title = actionTitle(action, label);
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
    ...(state.firstAxisInversionDone || state.duraMaterClosed
      ? [["Ordine turni", `${formatTurnOrder(state)}${state.turnDirection === -1 ? " · invertito" : ""}`]]
      : []),
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
  if (!selectedCardUid) {
    setStatus(
      state.status === "playing" ? "Partita in corso." : state.status === "success" ? `Vince ${playerLabel(state.winner)}.` : "Partita in stallo.",
      state.status === "success" ? "good" : state.status === "stalled" ? "bad" : ""
    );
  }
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

els.players.addEventListener("input", () => {
  renderPlayerConfig();
  scheduleSaveGamePrefs();
});
els.newGame.addEventListener("click", startGame);
if (els.newGamePlay) els.newGamePlay.addEventListener("click", prepareNewGame);
if (els.resetPrefs) els.resetPrefs.addEventListener("click", resetGamePrefsToDefaults);
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
  scheduleSaveGamePrefs();
  scheduleBotIfNeeded();
});
els.speedLive.addEventListener("change", () => {
  syncSpeedControls(els.speedLive);
  scheduleSaveGamePrefs();
  scheduleBotIfNeeded();
});
window.addEventListener("resize", renderBoard);

loadSavedGamePrefs();
bindGamePrefsPersistence();
