"use strict";

/** Etichetta build UI — se non la vedi in fondo alla pagina, non stai aprendo questo file. */
const DM_UI_BUILD = document.body.dataset.gameMode === "real"
  ? "Gioco reale 2026-07-23h"
  : "Simulazione 2026-07-23h";

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

/** Nomi base sedi 2–8 (dopo il giocatore 1 personalizzabile). Oltre l'ottavo: Nome2, Nome3, … */
const OPPONENT_NAMES = Object.freeze([
  "Dotto",
  "Brontolo",
  "Gongolo",
  "Pisolo",
  "Mammolo",
  "Eolo",
  "Cucciolo"
]);

/** competitive = Dura; coop / solo = Durissima (G>=2 / G=1). */
const PLAY_MODES = Object.freeze({
  COMPETITIVE: "competitive",
  COOP: "coop",
  SOLO: "solo"
});

function parsePlayMode(raw) {
  if (raw === PLAY_MODES.COOP || raw === PLAY_MODES.SOLO || raw === PLAY_MODES.COMPETITIVE) return raw;
  if (raw === "durissima" || raw === "collaborativo") return PLAY_MODES.COOP;
  if (raw === "solitario" || raw === "solo") return PLAY_MODES.SOLO;
  return PLAY_MODES.COMPETITIVE;
}

const DEFAULT_PLAY_MODE = parsePlayMode(
  document.body.dataset.defaultPlayMode || document.body.dataset.defaultVariant
);
const DEFAULT_VARIANT = DEFAULT_PLAY_MODE === PLAY_MODES.COMPETITIVE ? "dura" : "durissima";
const DEFAULT_SIZE = DEFAULT_PLAY_MODE === PLAY_MODES.COMPETITIVE ? 5 : 4;
const DEFAULT_PLAYERS = DEFAULT_PLAY_MODE === PLAY_MODES.SOLO
  ? 1
  : DEFAULT_PLAY_MODE === PLAY_MODES.COOP
    ? 4
    : 3;

const DEFAULT_GAME_PREFS = {
  version: 3,
  playMode: DEFAULT_PLAY_MODE,
  variant: DEFAULT_VARIANT,
  players: DEFAULT_PLAYERS,
  size: DEFAULT_SIZE,
  speed: "1000",
  seed: "",
  playerOneName: "Biancaneve",
  tournamentMode: false,
  durissimaVitaExtra: false,
  durissimaCoordinator: true,
  modes: Array.from({ length: MPCardsCore.MAX_PLAYERS }, (_, index) =>
    index === 0 &&
    (DEFAULT_PLAY_MODE === PLAY_MODES.COMPETITIVE || DEFAULT_PLAY_MODE === PLAY_MODES.SOLO)
      ? "manual"
      : "bot"
  ),
  strategies: Array.from({ length: MPCardsCore.MAX_PLAYERS }, (_, index) =>
    index === 0 &&
    (DEFAULT_PLAY_MODE === PLAY_MODES.COMPETITIVE || DEFAULT_PLAY_MODE === PLAY_MODES.SOLO)
      ? "auto"
      : defaultBotStrategySetting(DEFAULT_VARIANT)
  )
};

function getPlayMode() {
  const activeTab = document.querySelector("#play-mode-tabs [data-play-mode][aria-selected='true']");
  if (activeTab?.dataset?.playMode) return parsePlayMode(activeTab.dataset.playMode);
  if (els.playMode?.value) return parsePlayMode(els.playMode.value);
  if (els.gameVariant?.value === "durissima") {
    const players = Number(els.players?.value) || 2;
    return players === 1 ? PLAY_MODES.SOLO : PLAY_MODES.COOP;
  }
  return PLAY_MODES.COMPETITIVE;
}

function isDurissimaVariantSelected() {
  const mode = getPlayMode();
  return mode === PLAY_MODES.COOP || mode === PLAY_MODES.SOLO;
}

/** Solitario Durissima (G=1). */
function isDurissimaSoloRule(players, variant) {
  return (variant === "durissima" || getPlayMode() === PLAY_MODES.SOLO) && players === 1;
}

function defaultBotStrategySetting(variant = DEFAULT_VARIANT) {
  return variant === "durissima" || isDurissimaVariantSelected()
    ? "durissima-global-planner"
    : "auto";
}

function resolveStrategySettings(settings, players, variant) {
  const forceCoordinator = (variant === "durissima" || isDurissimaVariantSelected())
    && isCoordinatorBotEnabled();
  return Array.from({ length: players }, (_, index) => {
    if (forceCoordinator) return "durissima-global-planner";
    const value = settings[index] || defaultBotStrategySetting(variant);
    if (value === "auto" && (variant === "durissima" || isDurissimaVariantSelected())) {
      return "durissima-global-planner";
    }
    return value;
  });
}

function readPlayerOneName() {
  const raw = els.playerOneName?.value?.trim();
  return raw || DEFAULT_GAME_PREFS.playerOneName;
}

function playerOneNameValue() {
  if (game?.playerOneName) return game.playerOneName;
  return readPlayerOneName();
}

/**
 * Sede 0 = nome personalizzabile.
 * Sedi 1–7 = Dotto…Cucciolo (fino all'ottavo giocatore incluso).
 * Oltre l'ottavo: stessa serie con suffisso 2, 3, … (es. Eolo2).
 */
function playerLabel(playerIndex) {
  if (playerIndex === 0) return playerOneNameValue();
  const k = playerIndex - 1;
  const wave = Math.floor(k / OPPONENT_NAMES.length);
  const name = OPPONENT_NAMES[k % OPPONENT_NAMES.length];
  return wave === 0 ? name : `${name}${wave + 1}`;
}

function playerShortLabel(playerIndex) {
  return playerLabel(playerIndex);
}

function isRealGame() {
  return GAME_MODE === "real";
}

function isSeatManual(playerIndex) {
  return Boolean(game && game.modes[playerIndex] === "manual");
}

function isCompetitiveGameState(state = game?.state) {
  if (!state) return getPlayMode() === PLAY_MODES.COMPETITIVE;
  return !core.isDurissimaMater(state);
}

/** Collaborativo (Durissima G>=2): carte scoperte — tutte le mani visibili. */
function isCollaborativeOpenHands(state = game?.state) {
  return Boolean(state && core.isDurissimaMater(state) && state.players > 1);
}

/**
 * In competitivo: si vedono solo le carte della sede manuale di turno (hot-seat).
 * Bot e avversari competitivi: mai a faccia in su.
 * Solitario Durissima: si puo' vedere la mano.
 * Collaborativo: tutte le mani scoperte (miniature a destra).
 */
function shouldRevealOpenHand(playerIndex) {
  if (!game) return false;
  const state = game.state;
  if (playerIndex == null || playerIndex < 0) return false;
  if (isCollaborativeOpenHands(state)) return true;
  if (!isSeatManual(playerIndex)) return false;
  if (state.players === 1) return true;
  // Competitivo multi: solo la sede di turno manuale
  return state.currentPlayer === playerIndex;
}

function shouldShowOpenHandPanel() {
  if (!game) return false;
  const state = game.state;
  if (state.status !== "playing" && state.status !== "success" && state.status !== "stalled") {
    return false;
  }
  // Solitario: sempre
  if (state.players === 1) return true;
  // Collaborativo: le mani sono nelle miniature a destra; pannello grande solo se turno manuale
  if (isCollaborativeOpenHands(state)) {
    return state.status === "playing" && isSeatManual(state.currentPlayer);
  }
  if (state.status !== "playing") return false;
  // Competitivo: solo turno manuale
  return isSeatManual(state.currentPlayer);
}

function handViewPlayer() {
  if (!game) return 0;
  const state = game.state;
  // Competitivo / multi: sede di turno se manuale, altrimenti prima sede manuale
  if (isSeatManual(state.currentPlayer)) return state.currentPlayer;
  const firstManual = (game.modes || []).indexOf("manual");
  return firstManual >= 0 ? firstManual : state.currentPlayer;
}

function isHumanPlayerTurn() {
  if (!game || game.state.status !== "playing") return false;
  // In simulazione "reale" e non: turno umano = sede corrente impostata a Manuale
  return isSeatManual(game.state.currentPlayer);
}

function activeHandStatusElement() {
  if (isRealGame() && shouldShowOpenHandPanel() && els.sidebarHandStatus) {
    return els.sidebarHandStatus;
  }
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
  tournamentMode: document.querySelector("#tournament-mode"),
  gameVariant: document.querySelector("#game-variant"),
  playMode: document.querySelector("#play-mode"),
  playModeTabs: document.querySelector("#play-mode-tabs"),
  modeHint: document.querySelector("#mode-hint"),
  durissimaOptions: document.querySelector("#durissima-options"),
  soloOptions: document.querySelector("#solo-options"),
  durissimaVitaExtra: document.querySelector("#durissima-vita-extra"),
  durissimaSoloReserveNote: document.querySelector("#durissima-solo-reserve"),
  durissimaExtraCards: document.querySelector("#durissima-extra-cards"),
  durissimaExtraCardsLabel: document.querySelector("#durissima-extra-cards-label"),
  durissimaEasyMode: document.querySelector("#durissima-easy-mode"),
  durissimaCoordinator: document.querySelector("#durissima-coordinator"),
  playerOneName: document.querySelector("#player-one-name"),
  playerConfigHint: document.querySelector("#player-config-hint"),
  endgameBanner: document.querySelector("#endgame-banner"),
  setupSection: document.querySelector("#setup-section"),
  newGame: document.querySelector("#new-game"),
  newGamePlay: document.querySelector("#new-game-play"),
  resetPrefs: document.querySelector("#reset-prefs"),
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
  formatTierHint: document.querySelector("#format-tier-hint"),
  playersRangeHint: document.querySelector("#players-range-hint"),
  status: document.querySelector("#status"),
  boardStatus: document.querySelector("#board-status"),
  turnFlow: document.querySelector("#turn-flow"),
  turnFlowCaption: document.querySelector("#turn-flow-caption"),
  inversionAlert: document.querySelector("#inversion-alert"),
  board: document.querySelector("#board"),
  handDockPanel: document.querySelector("#hand-dock-panel"),
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
  strategyHintsPanel: document.querySelector("#strategy-hints-panel"),
  strategyHintsIntro: document.querySelector("#strategy-hints-intro"),
  strategyAssignments: document.querySelector("#strategy-assignments"),
  strategyHints: document.querySelector("#strategy-hints"),
  playerHandsList: document.querySelector("#player-hands-list"),
  summary: document.querySelector("#summary"),
  log: document.querySelector("#log"),
  playFeedback: document.querySelector("#play-feedback"),
  tournamentRankingPanel: document.querySelector("#tournament-ranking-panel"),
  tournamentRankingTitle: document.querySelector("#tournament-ranking-title"),
  tournamentRankingList: document.querySelector("#tournament-ranking-list"),
  tournamentScoresBar: document.querySelector("#tournament-scores-bar")
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

function setPlayFeedback(text, kind = "") {
  if (!els.playFeedback) return;
  els.playFeedback.textContent = text || "";
  els.playFeedback.className = kind
    ? `play-feedback play-feedback--${kind}`
    : "play-feedback";
}

/** Turno Idea: 4 carte gia' posate e ancora carte in mano. */
function isIdeaPhase(state = game?.state) {
  if (!state || !game || state.status !== "playing") return false;
  return typeof core.canOfferIdea === "function"
    ? core.canOfferIdea(state, state.currentPlayer)
    : state.turnPlayed === 4 && (state.hands[state.currentPlayer] || []).length > 0;
}

/**
 * Chi puo' "sbirciare" una carta Idea/jolly a faccia in giu' al passaggio del cursore.
 * - Collaborativo / solitario Durissima: tutti (conoscenza comune).
 * - Competitivo / torneo: solo chi l'ha posata (in hot-seat = sede corrente = placer).
 */
function canPeekBlindBoardCard(entry, state = game?.state) {
  if (!entry || !state) return false;
  const blind = entry.ideaBlind === true || entry.wildBlind === true;
  if (!blind) return true;
  if (!isCompetitiveGameState(state)) return true;
  return entry.playerId === state.currentPlayer;
}

function isBlindBoardEntry(entry) {
  return Boolean(entry && (entry.ideaBlind === true || entry.wildBlind === true));
}

function updateIdeaPhaseFeedback() {
  if (!game || game.state.status !== "playing") return;
  if (!isIdeaPhase(game.state) || isBotTurn()) return;
  if (selectedCardUid) {
    setPlayFeedback(
      "IDEA! Hai scelto la quinta carta jolly — clicca una casella adiacente (senza vincoli di tratto).",
      "idea"
    );
    return;
  }
  setPlayFeedback(
    "IDEA! Posa una quinta carta jolly! Sceglila in mano e posala adiacente senza vincoli (opzionale: Chiudi turno per saltare).",
    "idea"
  );
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

function playerCountBounds(size, playMode = getPlayMode()) {
  const grid = clampNumber(size, 3, 8, DEFAULT_GAME_PREFS.size);
  if (playMode === PLAY_MODES.SOLO) {
    return { min: 1, max: 1 };
  }
  if (playMode === PLAY_MODES.COOP) {
    return { min: 2, max: core.maxPlayersForSize(grid) };
  }
  // competitive
  return {
    min: Math.max(2, core.recommendedMinPlayers(grid)),
    max: core.maxPlayersForSize(grid)
  };
}

function clampPlayersToGrid(players, size, playMode = getPlayMode()) {
  const { min, max } = playerCountBounds(size, playMode);
  return clampNumber(players, min, max, min);
}

function playersRangeHintText(size, playMode = getPlayMode()) {
  const grid = clampNumber(size, 3, 8, DEFAULT_GAME_PREFS.size);
  const { min, max } = playerCountBounds(grid, playMode);
  if (playMode === PLAY_MODES.SOLO) {
    return "Solitario: 1 giocatore · mano N (easy mode opzionale: carte extra) · refill sempre";
  }
  if (playMode === PLAY_MODES.COOP) {
    return `Collaborativo: G da ${min} a ${max} (max 2N) · refill se posate · coordinatore bot opzionale`;
  }
  const rule =
    grid === 7
      ? "minimo 3 su 7x7 (eccezione a ceil(N/2))"
      : `minimo consigliato ${min}`;
  return `Competitivo: ${rule} · massimo 2N = ${max} · torneo a punteggio opzionale`;
}

/** In collaborativo/solitario il bot usa sempre il coordinatore (non e' scelta del giocatore). */
function isCoordinatorBotEnabled() {
  return isDurissimaVariantSelected();
}

function coordinatorBundleReady() {
  return globalThis.__DM_COORDINATOR_BROWSER__ === true
    && !!globalThis.DurissimaMatrixSolver
    && !!globalThis.DurissimaGnDecoupledOracle;
}

function syncPlayModeTabs(mode = getPlayMode()) {
  const tabs = document.querySelectorAll("[data-play-mode]");
  tabs.forEach(tab => {
    const selected = tab.dataset.playMode === mode;
    tab.setAttribute("aria-selected", selected ? "true" : "false");
    tab.classList.toggle("is-active", selected);
  });
  if (els.playMode) els.playMode.value = mode;
  if (els.gameVariant) {
    els.gameVariant.value = mode === PLAY_MODES.COMPETITIVE ? "dura" : "durissima";
  }
}

function applyPlayMode(mode, options = {}) {
  const next = parsePlayMode(mode);
  if (els.playMode) els.playMode.value = next;
  if (els.gameVariant) {
    els.gameVariant.value = next === PLAY_MODES.COMPETITIVE ? "dura" : "durissima";
  }
  syncPlayModeTabs(next);
  if (next === PLAY_MODES.SOLO && els.players) {
    els.players.value = "1";
  } else if (next !== PLAY_MODES.SOLO && els.players) {
    const n = Number(els.players.value);
    if (!Number.isFinite(n) || n < 2) {
      els.players.value = String(next === PLAY_MODES.COOP ? 4 : 3);
    }
  }
  // Non chiamare getPlayMode() finche' i tab non sono sincronizzati
  syncVariantUi(next);
  syncPlayersInputBounds({ renderConfig: options.renderConfig !== false });
  updateFormatTierHint();
  if (els.status && !game) {
    const labels = {
      [PLAY_MODES.COMPETITIVE]: "Sezione Competitivo.",
      [PLAY_MODES.COOP]: "Sezione Collaborativo.",
      [PLAY_MODES.SOLO]: "Sezione Solitario."
    };
    setStatus(labels[next] || "Configura e avvia una partita.", "");
  }
  if (options.save !== false) scheduleSaveGamePrefs();
}

function syncVariantUi(forcedMode) {
  const mode = forcedMode ? parsePlayMode(forcedMode) : getPlayMode();
  const durissima = mode === PLAY_MODES.COOP || mode === PLAY_MODES.SOLO;
  const solo = mode === PLAY_MODES.SOLO;
  const competitive = mode === PLAY_MODES.COMPETITIVE;

  syncPlayModeTabs(mode);

  // Opzioni solo solitario (easy mode / carte extra)
  if (els.soloOptions) {
    els.soloOptions.hidden = !solo;
  } else if (els.durissimaOptions) {
    // fallback: blocco legacy
    els.durissimaOptions.hidden = !solo;
  }
  if (els.durissimaSoloReserveNote) {
    els.durissimaSoloReserveNote.hidden = !solo;
  }
  if (els.durissimaExtraCardsLabel) {
    els.durissimaExtraCardsLabel.hidden = !solo;
  }
  // Coordinatore: non selezionabile dal giocatore (sempre on in Durissima lato bot)
  if (els.durissimaCoordinator) {
    els.durissimaCoordinator.checked = true;
    const coordLabel = els.durissimaCoordinator.closest("label");
    if (coordLabel) coordLabel.hidden = true;
  }
  // Torneo: SOLO competitivo (display:none perché label.option-check ha display:flex che vince su [hidden])
  const tournamentWrap =
    document.getElementById("tournament-mode-label") ||
    (els.tournamentMode && (els.tournamentMode.closest("label") || els.tournamentMode.parentElement));
  if (tournamentWrap) {
    tournamentWrap.hidden = !competitive;
    tournamentWrap.style.display = competitive ? "" : "none";
  }
  if (els.tournamentMode && !competitive) {
    els.tournamentMode.checked = false;
  }
  if (els.players) {
    els.players.disabled = solo;
    const playersLabel = els.players.closest("label");
    if (playersLabel) playersLabel.hidden = solo;
  }
  // Solitario: nome + Manuale/Computer (G=1 fisso, niente lista multi)
  if (els.playerOneName) {
    const nameLabel = els.playerOneName.closest("label");
    if (nameLabel) nameLabel.hidden = false;
  }
  if (els.playerConfig) {
    els.playerConfig.hidden = false;
  }
  if (els.playerConfigHint) {
    els.playerConfigHint.hidden = solo;
  }
  if (els.durissimaVitaExtra?.closest("label")) {
    els.durissimaVitaExtra.closest("label").hidden = true;
    els.durissimaVitaExtra.checked = false;
  }
  if (els.modeHint) {
    if (competitive) {
      els.modeHint.textContent =
        "Competitivo (Dura Mater): vince chi svuota per primo la mano. Torneo a punteggio opzionale.";
    } else if (mode === PLAY_MODES.COOP) {
      els.modeHint.textContent =
        "Collaborativo (Durissima): obiettivo griglia piena. Refill se posate. Bot in modalita' coordinata.";
    } else {
      els.modeHint.textContent =
        "Solitario (Durissima): griglia piena. Mano N o easy mode (carte extra). Refill se posate.";
    }
  }
}

function syncPlayersInputBounds(options = {}) {
  if (!els.players || !els.size) return DEFAULT_GAME_PREFS.players;
  const size = clampNumber(els.size.value, 3, 8, DEFAULT_GAME_PREFS.size);
  const { min, max } = playerCountBounds(size);
  const cappedMax = Math.min(MPCardsCore.MAX_PLAYERS, max);
  els.players.min = String(min);
  els.players.max = String(cappedMax);
  const current = clampPlayersToGrid(els.players.value, size);
  if (String(current) !== els.players.value) {
    els.players.value = String(current);
  }
  // Sempre ricostruire le righe giocatori quando richiesto (prima solo se clamp cambiava il valore)
  if (options.renderConfig) renderPlayerConfig();
  if (els.playersRangeHint) {
    els.playersRangeHint.textContent = playersRangeHintText(size);
  }
  return current;
}

function normalizeGamePrefs(prefs) {
  const normalized = { ...DEFAULT_GAME_PREFS, ...prefs };
  // Migrazione v2: solo variant dura/durissima → playMode
  if (!prefs?.playMode && prefs?.variant) {
    if (prefs.variant === "durissima") {
      normalized.playMode = Number(prefs.players) === 1 ? PLAY_MODES.SOLO : PLAY_MODES.COOP;
    } else {
      normalized.playMode = PLAY_MODES.COMPETITIVE;
    }
  }
  normalized.playMode = parsePlayMode(normalized.playMode);
  normalized.variant = normalized.playMode === PLAY_MODES.COMPETITIVE ? "dura" : "durissima";
  normalized.size = clampNumber(normalized.size, 3, 8, DEFAULT_GAME_PREFS.size);
  if (normalized.playMode === PLAY_MODES.SOLO) normalized.players = 1;
  normalized.players = clampPlayersToGrid(normalized.players, normalized.size, normalized.playMode);
  normalized.speed = SPEED_VALUES.has(normalized.speed) ? normalized.speed : DEFAULT_GAME_PREFS.speed;
  normalized.seed = typeof normalized.seed === "string" ? normalized.seed : DEFAULT_GAME_PREFS.seed;
  normalized.tournamentMode =
    normalized.playMode === PLAY_MODES.COMPETITIVE && normalized.tournamentMode === true;
  normalized.durissimaVitaExtra = false;
  // Coordinatore sempre attivo in Durissima (non e' preferenza UI)
  normalized.durissimaCoordinator = normalized.variant === "durissima";
  normalized.playerOneName = typeof normalized.playerOneName === "string"
    ? normalized.playerOneName.trim().slice(0, 32)
    : DEFAULT_GAME_PREFS.playerOneName;
  if (!normalized.playerOneName) normalized.playerOneName = DEFAULT_GAME_PREFS.playerOneName;
  const validModes = new Set(["manual", "bot"]);
  const validStrategy = new Set(core.STRATEGY_KEYS.concat(["auto"]));
  const defaultMode0 =
    normalized.playMode === PLAY_MODES.COMPETITIVE || normalized.playMode === PLAY_MODES.SOLO
      ? "manual"
      : "bot";
  normalized.modes = Array.from({ length: MPCardsCore.MAX_PLAYERS }, (_, index) => {
    const value = normalized.modes?.[index];
    if (validModes.has(value)) return value;
    return index === 0 ? defaultMode0 : "bot";
  });
  normalized.strategies = Array.from({ length: MPCardsCore.MAX_PLAYERS }, (_, index) => {
    const value = normalized.strategies?.[index];
    return validStrategy.has(value) ? value : defaultBotStrategySetting(normalized.variant);
  });
  return normalized;
}

function collectGamePrefs() {
  const size = clampNumber(els.size.value, 3, 8, DEFAULT_GAME_PREFS.size);
  const playMode = getPlayMode();
  const players = clampPlayersToGrid(els.players.value, size, playMode);
  const config = readPlayersConfig(players);
  return normalizeGamePrefs({
    version: 3,
    playMode,
    players,
    size,
    speed: els.speed.value,
    seed: els.seed.value,
    playerOneName: readPlayerOneName(),
    variant: playMode === PLAY_MODES.COMPETITIVE ? "dura" : "durissima",
    tournamentMode: Boolean(els.tournamentMode?.checked),
    durissimaVitaExtra: false,
    durissimaCoordinator: isCoordinatorBotEnabled(),
    modes: config.modes.concat(DEFAULT_GAME_PREFS.modes).slice(0, MPCardsCore.MAX_PLAYERS),
    strategies: config.strategies.concat(DEFAULT_GAME_PREFS.strategies).slice(0, MPCardsCore.MAX_PLAYERS)
  });
}

function applyGamePrefs(prefs) {
  const normalized = normalizeGamePrefs(prefs);
  els.size.value = String(normalized.size);
  els.players.value = String(normalized.players);
  els.speed.value = normalized.speed;
  els.speedLive.value = normalized.speed;
  els.seed.value = normalized.seed;
  if (els.playerOneName) els.playerOneName.value = normalized.playerOneName;
  if (els.playMode) els.playMode.value = normalized.playMode;
  if (els.gameVariant) els.gameVariant.value = normalized.variant;
  if (els.durissimaVitaExtra) els.durissimaVitaExtra.checked = false;
  if (els.durissimaCoordinator) els.durissimaCoordinator.checked = true;
  if (els.tournamentMode) els.tournamentMode.checked = normalized.tournamentMode;
  syncPlayModeTabs(normalized.playMode);
  syncVariantUi(normalized.playMode);
  syncPlayersInputBounds();
  loadedPlayerPrefs = {
    modes: normalized.modes,
    strategies: normalized.strategies
  };
  renderPlayerConfig();
  loadedPlayerPrefs = null;
  updateFormatTierHint();
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
  const fields = [
    els.players, els.size, els.speed, els.seed, els.playerOneName, els.tournamentMode,
    els.gameVariant, els.durissimaVitaExtra, els.durissimaCoordinator
  ];
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
  if (!els.playerConfig) return;
  const playMode = getPlayMode();
  els.playerConfig.hidden = false;
  // Solitario: sempre 1 sola riga (nome + manuale/computer)
  const players =
    playMode === PLAY_MODES.SOLO
      ? 1
      : clampNumber(els.players.value, 1, MPCardsCore.MAX_PLAYERS, 3);
  const previousModes = loadedPlayerPrefs?.modes
    || Array.from(document.querySelectorAll(".player-mode")).map(item => item.value);
  const previousStrategies = loadedPlayerPrefs?.strategies
    || Array.from(document.querySelectorAll(".player-strategy")).map(item => item.value);
  els.playerConfig.innerHTML = "";
  for (let player = 0; player < players; player++) {
    const row = document.createElement("div");
    row.className = "player-row";
    const defaultMode = defaultModeForSeat(player, playMode);
    const defaultStrategy = defaultBotStrategySetting(
      playMode === PLAY_MODES.COMPETITIVE ? "dura" : "durissima"
    );
    const seatName =
      player === 0
        ? (playMode === PLAY_MODES.SOLO ? "Tu" : playerLabel(player))
        : playerLabel(player);
    row.innerHTML = `
      <strong>${seatName}<span class="hand-count"></span></strong>
      <label>Controllo
        <select class="player-mode" aria-label="Controllo ${seatName}">
          <option value="manual">Manuale</option>
          <option value="bot">Computer</option>
        </select>
      </label>
      <label>Strategia
        <select class="player-strategy" aria-label="Strategia ${seatName}">${strategyOptions()}</select>
      </label>
    `;
    const modeSelect = row.querySelector(".player-mode");
    const stratSelect = row.querySelector(".player-strategy");
    const prevMode = previousModes[player];
    modeSelect.value =
      prevMode === "manual" || prevMode === "bot" ? prevMode : defaultMode;
    stratSelect.value = previousStrategies[player] || defaultStrategy;
    const syncStratEnabled = () => {
      stratSelect.disabled = modeSelect.value === "manual";
    };
    modeSelect.addEventListener("change", syncStratEnabled);
    syncStratEnabled();
    els.playerConfig.appendChild(row);
  }
  updatePlayerHandCounts();
}

function defaultModeForSeat(index, playMode = getPlayMode()) {
  // Competitivo e Solitario: sede 0 di default Manuale (puoi passare a Computer).
  // Collaborativo: di default computer (coordinatore).
  if (playMode === PLAY_MODES.COMPETITIVE || playMode === PLAY_MODES.SOLO) {
    return index === 0 ? "manual" : "bot";
  }
  return "bot";
}

function padPlayersConfig(config, players, playMode = getPlayMode()) {
  const modes = Array.from({ length: players }, (_, index) => {
    const value = config.modes?.[index];
    return value === "manual" || value === "bot" ? value : defaultModeForSeat(index, playMode);
  });
  const strategies = Array.from({ length: players }, (_, index) => {
    const value = config.strategies?.[index];
    return value || defaultBotStrategySetting(
      playMode === PLAY_MODES.COMPETITIVE ? "dura" : "durissima"
    );
  });
  return { modes, strategies };
}

function readPlayersConfig(players) {
  const rawModes = Array.from(document.querySelectorAll(".player-mode"))
    .slice(0, players)
    .map(item => item.value);
  const rawStrategies = Array.from(document.querySelectorAll(".player-strategy"))
    .slice(0, players)
    .map(item => item.value);
  return padPlayersConfig(
    { modes: rawModes, strategies: rawStrategies },
    players,
    getPlayMode()
  );
}

function durissimaGnTierLabel(size) {
  if (size <= 4) return { level: "core", text: "giocabile" };
  if (size === 5) return { level: "hard", text: "molto difficile" };
  if (size === 6) return { level: "extreme", text: "estremo / quasi impossibile" };
  return { level: "epic", text: "epico / non standard" };
}

function isTournamentEnabled() {
  return Boolean(els.tournamentMode?.checked);
}

function tournamentRankingEntries(state) {
  if (!state?.tournamentScores) return [];
  return state.tournamentScores
    .map((score, player) => ({ player, score }))
    .sort((a, b) => b.score - a.score || a.player - b.player)
    .map((entry, index) => ({ ...entry, place: index + 1 }));
}

function formatTournamentRanking(state) {
  return tournamentRankingEntries(state)
    .map(entry => `${entry.place}. ${playerLabel(entry.player)} (${entry.score})`)
    .join(" · ");
}

function renderTournamentScoresBar() {
  if (!els.tournamentScoresBar) return;
  if (!game || !core.isTournamentMode(game.state)) {
    els.tournamentScoresBar.hidden = true;
    els.tournamentScoresBar.replaceChildren();
    return;
  }
  const state = game.state;
  const done = state.status === "tournament_complete";
  els.tournamentScoresBar.hidden = false;
  els.tournamentScoresBar.removeAttribute("hidden");
  els.tournamentScoresBar.replaceChildren();
  const label = document.createElement("span");
  label.className = "tournament-scores-label";
  label.textContent = done ? "Classifica torneo" : "Punteggi torneo";
  els.tournamentScoresBar.append(label);
  for (const entry of tournamentRankingEntries(state)) {
    const chip = document.createElement("span");
    chip.className = "tournament-score-chip";
    if (done && entry.player === state.winner) chip.classList.add("leader");
    if (state.status === "playing" && entry.player === state.currentPlayer) chip.classList.add("current");
    const handDelta = state.tournamentGameScores?.[entry.player] || 0;
    const handHint = state.status === "playing" && handDelta !== 0
      ? ` (${handDelta >= 0 ? "+" : ""}${handDelta} partita)`
      : "";
    chip.textContent = `${playerShortLabel(entry.player)} ${entry.score}${handHint}`;
    chip.title = `${entry.place}° posto · ${entry.score} punti totali`;
    els.tournamentScoresBar.append(chip);
  }
}

function renderTournamentRanking() {
  if (!els.tournamentRankingPanel) return;
  if (!game || !core.isTournamentMode(game.state)) {
    els.tournamentRankingPanel.hidden = true;
    return;
  }
  const state = game.state;
  const done = state.status === "tournament_complete";
  els.tournamentRankingPanel.hidden = false;
  els.tournamentRankingPanel.removeAttribute("hidden");
  if (els.tournamentRankingTitle) {
    els.tournamentRankingTitle.textContent = done ? "Classifica finale" : "Punteggi torneo";
  }
  if (!els.tournamentRankingList) return;
  els.tournamentRankingList.replaceChildren();
  for (const entry of tournamentRankingEntries(state)) {
    const row = document.createElement("li");
    row.className = "tournament-ranking-row";
    if (done && entry.player === state.winner) row.classList.add("rank-winner");
    const place = document.createElement("span");
    place.className = "rank-place";
    place.textContent = `${entry.place}°`;
    const name = document.createElement("span");
    name.className = "rank-name";
    name.textContent = playerLabel(entry.player);
    const score = document.createElement("span");
    score.className = "rank-score";
    score.textContent = String(entry.score);
    row.append(place, name, score);
    els.tournamentRankingList.append(row);
  }
  if (done && els.playFeedback) {
    setPlayFeedback(`Torneo concluso — ${formatTournamentRanking(state)}`);
  }
}

/** Easy mode solitario: sempre esattamente N carte extra (mano 2N). Checkbox on/off. */
function isSoloEasyModeEnabled() {
  return Boolean(els.durissimaEasyMode?.checked || els.durissimaExtraCards?.checked);
}

function buildDurissimaSetupOptions(size, players) {
  const solo = players === 1;
  // Solo solitario: easy mode = esattamente N carte extra (mai nel competitivo/coop)
  const extraCards = solo && isSoloEasyModeEnabled() ? size : 0;
  return {
    durissimaMater: true,
    players,
    drawOnlyAfterPlacement: true,
    durissimaVitaExtraEnabled: false,
    durissimaReserveEnabled: false,
    durissimaExtraCards: Math.max(0, extraCards)
  };
}

function describeFormatTier(size, players) {
  const mode = getPlayMode();
  const variant = mode === PLAY_MODES.COMPETITIVE ? "dura" : "durissima";
  const tournament = mode === PLAY_MODES.COMPETITIVE && isTournamentEnabled();
  if (mode === PLAY_MODES.COMPETITIVE && players < 2) {
    return {
      level: "invalid",
      text: "Competitivo richiede almeno 2 giocatori. Per G=1 usa la sezione Solitario."
    };
  }
  if (mode === PLAY_MODES.SOLO || (variant === "durissima" && players === 1)) {
    const tier = durissimaGnTierLabel(size);
    const extra = isSoloEasyModeEnabled() ? size : 0;
    const deal = core.computeInitialDeal(size, 1, {
      durissimaMater: true,
      players: 1,
      durissimaExtraCards: extra
    });
    const tall = deal.drawCount;
    const hand = deal.cardsPerPlayer;
    return {
      level: tall <= 12 ? "core" : tier.level,
      text:
        `Solitario ${size}x${size}: mano ${hand}` +
        (extra ? ` (easy mode: 2N)` : " (standard N)") +
        `, tallone ${tall}, refill ON. ${tier.text}`
    };
  }
  if (mode === PLAY_MODES.COOP && isCoordinatorBotEnabled()) {
    const bundle = coordinatorBundleReady() ? "solver browser ok" : "solver browser mancante — ricarica pagina";
    const deal = core.computeInitialDeal(size, players);
    let text = `Coordinatore una mente (TG): piano dal pool noto (mani${deal.drawCount ? " + tallone" : ""}), G>=2. ${bundle}.`;
    if (players === size) text += " G=N: formato ideale.";
    else text += ` Tallone ${deal.drawCount}.`;
    return { level: deal.drawCount <= 20 ? "core" : "hard", text };
  }
  const gMin = mode === PLAY_MODES.COMPETITIVE
    ? Math.max(2, core.recommendedMinPlayers(size))
    : 2;
  if (mode === PLAY_MODES.COMPETITIVE && players < gMin) {
    const rule =
      size === 7
        ? `minimo ${gMin} giocatori su 7x7 (eccezione a ceil(N/2))`
        : `minimo ${gMin} giocatori (ceil(N/2) su ${size}x${size})`;
    return { level: "invalid", text: `Configurazione non ammessa: ${rule}.` };
  }
  if (!core.isPlayableSetup(size, players)) {
    const maxG = core.maxPlayersForSize(size);
    if (players > maxG) {
      return {
        level: "invalid",
        text: `Configurazione non ammessa: massimo ${maxG} giocatori con griglia ${size}x${size}.`
      };
    }
    return {
      level: "invalid",
      text: `Configurazione non ammessa: servono almeno ${core.MIN_INITIAL_HAND} carte a testa.`
    };
  }
  if (mode === PLAY_MODES.COOP) {
    const deal = core.computeInitialDeal(size, players);
    const tier = durissimaGnTierLabel(size);
    let text = "Collaborativo: griglia piena, refill se posate.";
    if (players === size) {
      text += ` G=N (${size}x${size}, tallone 0).`;
      return { level: "core", text };
    }
    text += ` Tallone ${deal.drawCount}, mano ${deal.cardsPerPlayer}. ${tier.text}.`;
    return { level: deal.drawCount <= 20 ? "core" : tier.level, text };
  }

  let text = tournament
    ? `Torneo competitivo: ${players} partite, classifica a punteggio.`
    : "Competitivo: vince chi svuota per primo la mano.";
  if (!tournament && players === size) {
    return {
      level: "core",
      text: `${text} Formato ideale G=N (${size}x${size}, nessun tallone iniziale).`
    };
  }

  if (!tournament && players < size) {
    return { level: "extra", text: `${text} Variante sotto-G (under).` };
  }
  if (!tournament) {
    return { level: "extra", text: `${text} Variante overcrowd.` };
  }
  const gMax = core.recommendedMaxPlayers(size);
  if (players < size) {
    return {
      level: players === size - 1 && players >= gMin ? "core" : "extra",
      text: `${text} Sotto-G consigliato: ${gMin}-${gMax} giocatori.`
    };
  }
  if (players > size) {
    return { level: "extra", text: `${text} Variante overcrowd (consigliato fino a ${gMax}).` };
  }
  return { level: "core", text };
}

function updateFormatTierHint() {
  if (!els.formatTierHint) return;
  const size = clampNumber(els.size.value, 3, 8, 5);
  const players = clampPlayersToGrid(els.players.value, size);
  const tier = describeFormatTier(size, players);
  els.formatTierHint.textContent = tier.text;
  els.formatTierHint.dataset.tier = tier.level;
}

function startGame() {
  stopTimer();
  saveGamePrefsNow();
  const playMode = getPlayMode();
  const variant = playMode === PLAY_MODES.COMPETITIVE ? "dura" : "durissima";
  const size = clampNumber(els.size.value, 3, 8, 5);
  const players = clampPlayersToGrid(els.players.value, size, playMode);
  els.players.value = String(players);
  if (playMode === PLAY_MODES.COMPETITIVE && players < 2) {
    setStatus(
      "Competitivo richiede almeno 2 giocatori. Per giocare da soli usa la sezione Solitario.",
      "bad"
    );
    return;
  }
  if (variant === "durissima" && isCoordinatorBotEnabled()) {
    if (!coordinatorBundleReady()) {
      setStatus("Solver coordinatore non caricato — ricarica la pagina (Ctrl+F5).", "bad");
      return;
    }
  }
  const gMin = playMode === PLAY_MODES.COMPETITIVE
    ? Math.max(2, core.recommendedMinPlayers(size))
    : playMode === PLAY_MODES.SOLO
      ? 1
      : 2;
  if (playMode === PLAY_MODES.COMPETITIVE && players < gMin) {
    const rule =
      size === 7
        ? `minimo ${gMin} su 7x7 (eccezione a ceil(N/2))`
        : `minimo ${gMin} (ceil(N/2))`;
    setStatus(`Con ${size}x${size} servono almeno ${rule}.`, "bad");
    return;
  }
  if (!core.isPlayableSetup(size, players)) {
    const maxG = core.maxPlayersForSize(size);
    if (players > maxG) {
      setStatus(`Con ${size}x${size} il massimo e' ${maxG} giocatori (G <= 2N).`, "bad");
    } else {
      setStatus(
        `Con ${size}x${size} e ${players} giocatori servono almeno ${core.MIN_INITIAL_HAND} carte a testa.`,
        "bad"
      );
    }
    return;
  }
  const tournamentMode = playMode === PLAY_MODES.COMPETITIVE && isTournamentEnabled();
  const seed = els.seed.value.trim() || String(Date.now());
  const random = gameState.createRandom(seed);
  // Assicura N righe config prima di leggere (se l'utente ha cambiato G senza rebuild)
  renderPlayerConfig();
  const config = padPlayersConfig(readPlayersConfig(players), players, playMode);
  const strategySettings = resolveStrategySettings(config.strategies, players, variant);
  let deck;
  try {
    deck = core.simulationDeck();
  } catch (error) {
    setStatus(error.message, "bad");
    return;
  }
  let state;
  try {
    const setupOptions = {
      players,
      size,
      random,
      tournamentMode,
      // Competitivo al tavolo: inizia sempre la sede 0 (Biancaneve / giocatore 1)
      randomizeTurnOrder: playMode === PLAY_MODES.COMPETITIVE ? false : true,
      ...(variant === "durissima" ? buildDurissimaSetupOptions(size, players) : {})
    };
    state = core.setupGame(deck, setupOptions);
  } catch (error) {
    setStatus(error.message, "bad");
    return;
  }
  const strategies = core.resolveStrategies(strategySettings, players, random);
  const playerOneName = readPlayerOneName();
  const session = gameState.createSession({
    seed,
    deckCodes: CANONICAL_DECK_CODES,
    players,
    size,
    tournamentMode,
    variant,
    durissimaVitaExtra: false,
    durissimaCoordinator: isCoordinatorBotEnabled(),
    modes: config.modes.slice(),
    strategySettings,
    strategies,
    playerOneName
  }, state, random);
  game = {
    session,
    state: gameState.currentState(session),
    random,
    variant,
    modes: config.modes.slice(),
    strategySettings: strategySettings.slice(),
    strategies,
    seed,
    playerOneName,
    deck,
    tournamentMode
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

function isTerminalGameStatus(status) {
  return status === "success" || status === "stalled" || status === "tournament_complete";
}

function isTournamentGamePaused() {
  return Boolean(
    game?.tournamentMode
    && core.isTournamentMode(game.state)
    && (typeof core.isTournamentGameOverStatus === "function"
      ? core.isTournamentGameOverStatus(game.state.status)
      : game.state.status === "game_over" || game.state.status === "hand_over")
  );
}

function tournamentGamePauseMessage() {
  const state = game.state;
  const reason = state.tournamentLastGameReason === "monte" ? "monte" : "tutti finiti";
  return `Partita ${state.tournamentGameIndex}/${state.players} conclusa (${reason}). `
    + (els.speed?.value === "step"
      ? "Clicca «Step computer» per la prossima partita."
      : "Metti «Step by step» e clicca «Step computer», oppure avvia una nuova partita.");
}

function notifyAutoPlayEnded() {
  stopTimer();
  if (!game) return;
  const state = game.state;
  if (isTournamentGamePaused()) {
    setPlayFeedback(tournamentGamePauseMessage());
    return;
  }
  if (!isTerminalGameStatus(state.status)) return;
  if (state.status === "tournament_complete") {
    setPlayFeedback(`Torneo concluso — ${formatTournamentRanking(state)}`);
    return;
  }
  if (core.isDurissimaMater(state)) {
    if (state.status === "success") {
      setPlayFeedback(
        state.players === 1
          ? "Vittoria! Griglia completata."
          : "Vittoria! Griglia completata."
      );
    } else {
      setPlayFeedback(
        state.players === 1
          ? "Fine partita: nessuna mossa legale, griglia non completata."
          : "Fine partita."
      );
    }
    return;
  }
  if (state.status === "success" && state.winner != null) {
    setPlayFeedback(`Partita conclusa — vince ${playerLabel(state.winner)}.`);
    return;
  }
  setPlayFeedback("Partita conclusa in stallo.");
}

function currentRequirement() {
  if (!game || game.state.turnPlayed >= 5) return null;
  return core.placementRequirement(game.state);
}

function currentMoves() {
  if (!game || game.state.status !== "playing" || game.state.turnPlayed >= 5) return [];
  const requirement = currentRequirement();
  if (requirement === null || (requirement > 4 && requirement !== 1)) return [];
  return core.legalPlacements(game.state, game.state.currentPlayer, requirement);
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
  if (game.state.turnPlayed === 0) {
    if (core.isDurissimaMater(game.state) && game.state.players === 1) return "Sconfitta";
    return "Passa";
  }
  if (core.canOfferIdea(game.state, game.state.currentPlayer)) return "Chiude (salta idea)";
  return "Chiude turno";
}

function actionTitle(action, labels) {
  if (action.type === "move") {
    return `${labels}: gioca ${action.move.card.code} in (${action.move.x}, ${action.move.y}).`;
  }
  return `${labels}: ${game.state.turnPlayed === 0 ? "passa" : "chiude il turno"}.`;
}

function ensureVitaExtraButton() {
  if (els.vitaExtra || !els.pass?.parentNode) return;
  const btn = document.createElement("button");
  btn.id = "vita-extra";
  btn.type = "button";
  btn.className = "secondary";
  btn.textContent = "Vita extra";
  btn.hidden = true;
  els.pass.parentNode.insertBefore(btn, els.pass);
  els.vitaExtra = btn;
  btn.addEventListener("click", useDurissimaVitaExtra);
}

function useDurissimaVitaExtra() {
  if (!game || game.state.status !== "playing" || isBotTurn()) return;
  const player = game.state.currentPlayer;
  if (!core.canUseDurissimaVitaExtra(game.state, player)) return;
  game.state = gameState.commit(game.session, `${playerLabel(player)}: vita extra.`, game.random, nextState => {
    core.tryDurissimaVitaExtra(nextState, player, game.random);
  });
  resetTransientUi();
  render();
  scheduleBotIfNeeded();
}

function passOrEndTurn() {
  if (!game || game.state.status !== "playing") return;
  const player = game.state.currentPlayer;
  const label = game.state.turnPlayed === 0
    ? `${playerLabel(player)} passa.`
    : `${playerLabel(player)} chiude il turno.`;
  game.state = gameState.commit(game.session, label, game.random, nextState => {
    if (nextState.turnPlayed === 0) {
      if (core.isDurissimaMater(nextState)) {
        const stuck = core.resolveDurissimaStuck(nextState, game.random, { useVitaExtra: false });
        if (stuck === "lost") return;
      } else {
        core.passTurn(nextState);
      }
    } else {
      core.endTurn(nextState);
    }
  });
  resetTransientUi();
  render();
  scheduleBotIfNeeded();
}

function runBotStep() {
  stopTimer();
  if (!game) return;
  if (isTournamentGamePaused()) {
    if (advanceTournamentGameIfNeeded()) {
      scheduleBotIfNeeded();
    }
    return;
  }
  if (!isBotTurn()) return;
  const beforePlayer = game.state.currentPlayer;
  let botResult = null;
  game.state = gameState.commit(game.session, `${playerLabel(beforePlayer)}: azione computer.`, game.random, nextState => {
    botResult = core.botStep(nextState, game.strategies, game.random);
    if (botResult.played) {
      const move = botResult.move;
      return `${playerLabel(beforePlayer)} gioca ${move.card.code} in (${move.x}, ${move.y}).`;
    }
    if (botResult.passed) return `${playerLabel(beforePlayer)} passa.`;
    if (botResult.ended) return `${playerLabel(beforePlayer)} chiude il turno.`;
    if (botResult.lost) return `${playerLabel(beforePlayer)}: sconfitta.`;
    return `${playerLabel(beforePlayer)}: nessuna azione.`;
  });
  if (
    game.state.status === "playing"
    && botResult
    && !botResult.played
    && !botResult.passed
    && !botResult.ended
    && !botResult.lost
  ) {
    setPlayFeedback("Il computer non ha potuto avanzare: partita in pausa.");
    setStatus("Bot bloccato (nessuna mossa legale).", "bad");
    return;
  }
  resetTransientUi();
  render();
  notifyAutoPlayEnded();
  scheduleBotIfNeeded();
}

function advanceTournamentGameIfNeeded() {
  if (!game?.tournamentMode || !core.isTournamentMode(game.state)) return false;
  if (!(typeof core.isTournamentGameOverStatus === "function"
    ? core.isTournamentGameOverStatus(game.state.status)
    : game.state.status === "game_over" || game.state.status === "hand_over")) {
    return false;
  }
  const gameDone = game.state.tournamentGameIndex;
  const total = game.state.players;
  game.state = gameState.commit(game.session, `Fine partita ${gameDone}/${total}.`, game.random, next => {
    core.beginNextTournamentGame(next, game.deck, game.random);
  });
  resetInversionUiFlags(game.state);
  resetTransientUi();
  render();
  return true;
}

function scheduleBotIfNeeded() {
  stopTimer();
  if (!game) return;
  if (isTerminalGameStatus(game.state.status)) {
    notifyAutoPlayEnded();
    return;
  }
  if (isTournamentGamePaused()) {
    notifyAutoPlayEnded();
    return;
  }
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
  const wasIdea = game.state.turnPlayed === 4;
  const baseLabel = wasIdea
    ? `${playerLabel(player)} IDEA (jolly): ${legalMove.card.code} in (${legalMove.x}, ${legalMove.y}).`
    : `${playerLabel(player)} gioca ${legalMove.card.code} in (${legalMove.x}, ${legalMove.y}).`;
  game.state = gameState.commit(game.session, baseLabel, game.random, nextState => {
    core.applyPlacement(nextState, player, legalMove);
    if (nextState.status === "playing" && nextState.turnPlayed >= 5) {
      core.endTurn(nextState);
      return `${baseLabel} ${playerLabel(player)} chiude il turno.`;
    }
    if (nextState.status === "playing" && core.canOfferIdea(nextState, player)) {
      return `${baseLabel} IDEA: puo' posare una quinta carta jolly.`;
    }
    return baseLabel;
  });
  resetTransientUi();
  render();
  if (wasIdea) {
    setPlayFeedback("Idea realizzata: quinta carta jolly posata a faccia in giu'.", "idea");
  } else {
    updateIdeaPhaseFeedback();
  }
  scheduleBotIfNeeded();
}

function selectCard(cardUid) {
  if (!game) return;
  if (isBotTurn()) {
    setPlayFeedback(`È il turno del computer: attendi, oppure imposta ${playerLabel(0)} su Manuale.`);
    return;
  }
  const state = game.state;
  const hand = state.hands[state.currentPlayer] || [];
  const reserve = core.isDurissimaMater(state) ? (state.durissimaReserve || []) : [];
  const card = hand.find(entry => entry.uid === cardUid) || reserve.find(entry => entry.uid === cardUid);
  const moves = currentMoves().filter(move => move.cardUid === cardUid);
  if (!card || moves.length === 0) {
    setPlayFeedback("Questa carta non si può posare ora.");
    return;
  }
  selectedCardUid = cardUid;
  previewCardUid = null;
  highlightedMoves = moves;
  const name = globalThis.MPCardsNames ? MPCardsNames.formatCardName(card) : card.code;
  if (isIdeaPhase()) {
    setPlayFeedback(
      `IDEA! Quinta jolly: ${name} — clicca una casella adiacente (nessun vincolo di tratto).`,
      "idea"
    );
  } else {
    setPlayFeedback(`Carta selezionata: ${name} — ora clicca sul tabellone.`);
  }
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

function cardBackTile(options = {}) {
  const tile = document.createElement("div");
  tile.className = options.idea ? "card-back card-back--idea" : "card-back";
  const backSrc = globalThis.MPCardsArt && MPCardsArt.back;
  if (backSrc) {
    const img = document.createElement("img");
    img.src = backSrc;
    img.alt = options.idea ? "Carta Idea (faccia in giu')" : "Retro carta";
    img.draggable = false;
    img.loading = "lazy";
    img.decoding = "async";
    tile.appendChild(img);
  } else {
    tile.textContent = options.idea ? "J" : "?";
  }
  if (options.idea) {
    tile.title = options.peekTitle || "Idea / jolly a faccia in giu'";
  }
  return tile;
}

/**
 * Cella Idea/jolly: di default dorso; hover rivela il fronte se permesso.
 */
function boardBlindCardElement(entry) {
  const wrap = document.createElement("div");
  wrap.className = "board-blind-card";
  const canPeek = canPeekBlindBoardCard(entry);
  const faceName = globalThis.MPCardsNames
    ? MPCardsNames.formatCardName(entry.card)
    : entry.card.code;
  const secretHint = isCompetitiveGameState()
    ? " (solo chi l'ha posata la conosce)"
    : "";
  wrap.title = canPeek
    ? `Idea/jolly — passa per rivelare: ${faceName}`
    : `Idea/jolly a faccia in giu'${secretHint}`;

  let showingFace = false;
  const showBack = () => {
    wrap.innerHTML = "";
    wrap.appendChild(cardBackTile({
      idea: true,
      peekTitle: wrap.title
    }));
    showingFace = false;
  };
  const showFace = () => {
    if (!canPeek) return;
    wrap.innerHTML = "";
    const face = cardTile(entry.card);
    face.classList.add("board-blind-face");
    wrap.appendChild(face);
    showingFace = true;
  };

  showBack();
  if (canPeek) {
    wrap.addEventListener("mouseenter", showFace);
    wrap.addEventListener("mouseleave", showBack);
    wrap.addEventListener("focus", showFace);
    wrap.addEventListener("blur", showBack);
    wrap.tabIndex = 0;
  }
  return wrap;
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
      "<p><strong>Dura Mater chiusa.</strong> L'ingombro ha raggiunto NxN: seconda inversione dell'ordine di gioco.</p>"
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

function renderEndgameBanner() {
  if (!els.endgameBanner) return;
  if (!game || game.state.status === "playing" || isTournamentGamePaused()) {
    els.endgameBanner.hidden = true;
    els.endgameBanner.style.display = "none";
    els.endgameBanner.textContent = "";
    els.endgameBanner.className = "endgame-banner";
    return;
  }
  const state = game.state;
  let title = "Fine partita";
  let kind = "end";
  if (state.status === "success") {
    if (core.isDurissimaMater(state)) {
      title = "Vittoria!";
      kind = "win";
    } else if (state.winner != null) {
      title = `Vittoria — ${playerLabel(state.winner)}`;
      kind = "win";
    } else {
      title = "Vittoria!";
      kind = "win";
    }
  } else if (state.status === "tournament_complete") {
    title = `Torneo finito — vince ${playerLabel(state.winner)}`;
    kind = "win";
  } else if (state.status === "stalled") {
    title = core.isDurissimaMater(state) && state.players === 1
      ? "Fine partita"
      : core.isDurissimaMater(state)
        ? "Fine partita"
        : "Fine partita (monte / stallo)";
    kind = "end";
  }
  els.endgameBanner.hidden = false;
  els.endgameBanner.style.display = "";
  els.endgameBanner.className = `endgame-banner endgame-banner--${kind}`;
  els.endgameBanner.textContent = title;
}

function soloHasAnyLegalPlacement(state, playerId) {
  if (!state || state.status !== "playing") return false;
  if (state.turnPlayed >= 5) return false;
  if (state.turnPlayed === 0 && typeof core.hasLegalPlacementsNow === "function") {
    return core.hasLegalPlacementsNow(state, playerId);
  }
  const req = core.placementRequirement(state);
  if (req == null) return false;
  return core.legalPlacements(state, playerId, req).length > 0;
}

/**
 * Solitario: se non restano mosse legali, chiude il turno (refill) oppure
 * dichiara fine partita. Prima restava bloccata senza banner.
 * Non interrompe la fase Idea se restano pose jolly legali (le vede soloHasAnyLegalPlacement).
 */
function maybeEndSoloWhenStuck() {
  if (!game || game.state.status !== "playing") return false;
  if (!core.isDurissimaMater(game.state) || game.state.players !== 1) return false;
  const playerId = game.state.currentPlayer;
  if (soloHasAnyLegalPlacement(game.state, playerId)) return false;

  // A meta' turno senza altre posate: chiudi il turno (pesca/refill) una volta
  if ((game.state.turnPlayed || 0) > 0) {
    try {
      game.state = gameState.commit(
        game.session,
        "Fine turno (nessuna altra posa).",
        game.random,
        next => {
          core.endTurn(next);
        }
      );
    } catch (_err) {
      /* ignore */
    }
    // Dopo endTurn, se ora ci sono mosse, continua; se no, termina sotto
    if (game.state.status !== "playing") {
      notifyAutoPlayEnded();
      return true;
    }
    if (soloHasAnyLegalPlacement(game.state, game.state.currentPlayer)) return true;
  }

  // Inizio turno (o ancora bloccato dopo endTurn): partita persa
  try {
    game.state = gameState.commit(
      game.session,
      "Solitario bloccato: nessuna mossa legale.",
      game.random,
      next => {
        if (typeof core.resolveDurissimaStuck === "function") {
          core.resolveDurissimaStuck(next, game.random, { useVitaExtra: false });
        }
        if (next.status === "playing") next.status = "stalled";
      }
    );
  } catch (_err) {
    game.state.status = "stalled";
  }
  notifyAutoPlayEnded();
  return true;
}

function render() {
  if (maybeEndSoloWhenStuck()) {
    // ricorsione una sola volta con status gia' terminale
  }
  renderBoard();
  renderTurnFlow();
  renderRealGameSidebar();
  renderHandCountsBar();
  renderHand();
  renderStrategyHints();
  renderSummary();
  renderTournamentScoresBar();
  renderTournamentRanking();
  renderActions();
  renderEndgameBanner();
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
  // A griglia piena non allargare la vista: evita cella "fantasma" e carte fuori schermo
  const movesForView =
    state.board.length >= state.size * state.size || state.status !== "playing"
      ? []
      : highlightedMoves;
  const view = boardViewBounds(state, movesForView);
  const cellSize = boardCellSize();
  els.board.style.gridTemplateColumns = `repeat(${view.width}, ${cellSize}px)`;
  // Chiavi assolute (x,y) — niente offset misto che poteva perdere l'ultima posa
  const placed = new Map();
  for (const entry of state.board) {
    placed.set(core.coordKey(entry.x, entry.y), entry);
  }
  const targets = new Map();
  for (const move of movesForView) {
    targets.set(core.coordKey(move.x, move.y), move);
  }
  for (let y = view.minY; y <= view.maxY; y++) {
    for (let x = view.minX; x <= view.maxX; x++) {
      const cell = document.createElement("div");
      const entry = placed.get(core.coordKey(x, y));
      const target = targets.get(core.coordKey(x, y));
      cell.className = target && !entry ? "cell target" : "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      if (entry) {
        cell.className = isBlindBoardEntry(entry)
          ? "cell filled cell-idea-blind"
          : "cell filled";
        if (isBlindBoardEntry(entry)) {
          cell.appendChild(boardBlindCardElement(entry));
        } else {
          cell.appendChild(cardTile(entry.card));
        }
      } else if (target) {
        const ideaTarget = isIdeaPhase(state) || target.ideaBlind === true;
        cell.title = ideaTarget
          ? `IDEA / jolly: posa ${target.card.code} qui (solo adiacenza, senza vincoli di tratto).`
          : `Gioca ${target.card.code} qui. Adiacenze compatibili: ${target.compatibleNeighbors}/${target.neighbors}. Caratteristiche condivise: ${target.matches}`;
        const score = document.createElement("span");
        score.className = ideaTarget ? "target-score target-score--idea" : "target-score";
        score.textContent = ideaTarget ? "J" : target.compatibleNeighbors;
        cell.appendChild(score);
        cell.addEventListener("click", () => {
          if (!selectedCardUid) {
            setPlayFeedback(
              ideaTarget
                ? "IDEA! Seleziona prima la quinta carta jolly in mano."
                : "Seleziona prima una carta in mano (click sulla carta → bordo rosso).",
              ideaTarget ? "idea" : ""
            );
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
      ? " · ingombro al limite NxN"
      : footprint.atWidthLimit
        ? " · larghezza al limite N"
        : footprint.atHeightLimit
          ? " · altezza al limite N"
          : "";
  const reserveCount = core.isDurissimaMater(state) ? (state.durissimaReserve || []).length : 0;
  const reserveLabel = reserveCount ? `, legacy-riserva ${reserveCount}` : "";
  const handN = (state.hands && state.hands[0] ? state.hands[0].length : 0);
  const extraHint =
    core.isDurissimaMater(state) && state.players === 1 && handN > state.size
      ? `, mano ${handN}`
      : "";
  els.boardStatus.textContent = `${state.board.length}/${state.size * state.size} carte, pesca ${state.drawPile.length}${extraHint}${reserveLabel}${closed}`;
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
  const multi = game && game.state.players > 1;
  const competitive = game && isCompetitiveGameState(game.state);
  const openCoop = game && isCollaborativeOpenHands(game.state);
  // Multi: sempre elenco a destra (competitivo = dorsi; collaborativo = scoperte)
  if (els.playerHandsPanel) {
    els.playerHandsPanel.hidden = !multi;
  }
  const showOpen = shouldShowOpenHandPanel();
  if (els.sidebarHandPanel) {
    // In collaborativo le mini-mani a destra bastano; pannello grande solo per giocare il turno manuale
    els.sidebarHandPanel.hidden = !showOpen;
  }
  if (showOpen) {
    renderSidebarHand();
  } else if (els.sidebarHand) {
    els.sidebarHand.innerHTML = "";
    if (els.sidebarHandTitle) {
      if (openCoop && isBotTurn()) {
        els.sidebarHandTitle.textContent = "Carte di tutti (scoperte, a destra)";
      } else if (competitive && multi && isBotTurn()) {
        els.sidebarHandTitle.textContent = "Mano avversaria nascosta (computer)";
      } else {
        els.sidebarHandTitle.textContent = "Mano";
      }
    }
    if (els.sidebarHandStatus) {
      els.sidebarHandStatus.textContent = isBotTurn()
        ? (openCoop ? "Turno del computer — mani scoperte a destra" : "In attesa del computer…")
        : "";
    }
  }
  if (multi) renderPlayerHandStacks();
}

function appendReserveCards(container, layout, interactive) {
  if (!game || !core.isDurissimaMater(game.state)) return;
  const reserve = game.state.durissimaReserve || [];
  if (!reserve.length) return;
  const moves = currentMoves();
  const playable = new Set(
    moves.filter(move => move.fromReserve).map(move => move.cardUid)
  );
  const useSidebarLayout = layout === "sidebar";
  const heading = document.createElement("p");
  heading.className = "hand-section-label";
  heading.textContent = "Riserva (condivisa)";
  container.appendChild(heading);
  for (const card of reserve) {
    const item = document.createElement("div");
    const isSelected = selectedCardUid === card.uid;
    const canPlay = playable.has(card.uid) && interactive;
    item.className = "hand-card reserve-card";
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

function appendHandCards(container, layout, player, hand, interactive) {
  const moves = currentMoves();
  const playable = new Set(
    moves.filter(move => !move.fromReserve).map(move => move.cardUid)
  );
  const useSidebarLayout = layout === "sidebar";
  const ideaPhase = isIdeaPhase();
  for (const card of hand) {
    const item = document.createElement("div");
    const isSelected = selectedCardUid === card.uid;
    const canPlay = playable.has(card.uid) && interactive;
    item.className = "hand-card";
    item.dataset.cardUid = card.uid;
    if (canPlay && !isSelected) item.classList.add("playable");
    if (canPlay && ideaPhase) item.classList.add("idea-ready");
    if (isSelected) item.classList.add("selected");
    if (previewCardUid === card.uid) item.classList.add("preview");
    item.appendChild(cardTile(card));
    if (isSelected) {
      const badge = document.createElement("span");
      badge.className = "hand-card-selected-badge";
      badge.textContent = ideaPhase ? "Jolly" : "Scelta";
      item.appendChild(badge);
    } else if (canPlay && ideaPhase) {
      const badge = document.createElement("span");
      badge.className = "hand-card-idea-badge";
      badge.textContent = "IDEA";
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
  if (!els.handCountsList) return;
  els.handCountsList.innerHTML = "";
  if (!game) return;
  const state = game.state;
  const tournament = core.isTournamentMode(state);
  if (!isRealGame() && !tournament) return;
  for (let player = 0; player < state.players; player++) {
    const count = (state.hands[player] || []).length;
    const exited = tournament && state.tournamentExited?.[player];
    const chip = document.createElement("div");
    chip.className = "hand-count-chip";
    if (state.status === "tournament_complete" && player === state.winner) {
      chip.classList.add("winner");
    } else if (state.status === "success" && player === state.winner) {
      chip.classList.add("winner");
    } else if (state.status === "playing" && player === state.currentPlayer) {
      chip.classList.add("current");
    }
    if (player === handViewPlayer()) chip.classList.add("you");
    const name = document.createElement("strong");
    name.textContent = playerShortLabel(player);
    const detail = document.createElement("span");
    if (tournament && state.tournamentScores) {
      const score = state.tournamentScores[player] || 0;
      const handDelta = state.tournamentGameScores?.[player] || 0;
      if (exited) {
        detail.textContent = `${score} pt`;
        chip.title = `${score} punti torneo · uscito da questa partita`;
      } else {
        detail.textContent = `${count} · ${score} pt`;
        const gameHint = handDelta !== 0 ? ` · partita ${handDelta >= 0 ? "+" : ""}${handDelta}` : "";
        chip.title = `${count} carte in mano · ${score} punti torneo${gameHint}`;
      }
    } else if (state.status === "success" && core.isDurissimaMater(state) && state.players > 1) {
      detail.textContent = "OK";
      chip.classList.add("winner");
    } else if (state.status === "success" && player === state.winner && count === 0) {
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
  // Solo sedi manuali: in multi, la sede di turno se manuale
  let player = state.currentPlayer;
  if (state.players === 1) {
    player = 0;
  } else if (!isSeatManual(player)) {
    // non dovremmo essere chiamati per un bot; safety
    return;
  }
  if (!shouldRevealOpenHand(player) && state.players > 1 && state.status === "playing") {
    return;
  }
  const hand = state.hands[player] || [];
  const interactive = isHumanPlayerTurn() && state.status === "playing" && state.currentPlayer === player;
  if (els.sidebarHandTitle) {
    if (state.players === 1) {
      els.sidebarHandTitle.textContent = "La tua mano";
    } else {
      els.sidebarHandTitle.textContent = `Mano di ${playerShortLabel(player)}`;
    }
  }
  updateHandSelectionStatus(hand.length, player, "Manuale");
  appendHandCards(els.sidebarHand, "sidebar", player, hand, interactive);
  appendReserveCards(els.sidebarHand, "sidebar", interactive);
}

function renderPlayerHandStacks() {
  if (!els.playerHandsList || !isRealGame()) return;
  els.playerHandsList.innerHTML = "";
  if (!game) return;
  const state = game.state;
  const competitive = isCompetitiveGameState(state);
  const openCoop = isCollaborativeOpenHands(state);
  for (let player = 0; player < state.players; player++) {
    const hand = state.hands[player] || [];
    // Competitivo: non duplicare la mano aperta del manuale di turno
    if (
      competitive &&
      shouldShowOpenHandPanel() &&
      player === state.currentPlayer &&
      isSeatManual(player)
    ) {
      continue;
    }
    const row = document.createElement("div");
    row.className = "player-hand-row";
    if (openCoop) row.classList.add("open-hands");
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
      : "Manuale";
    head.appendChild(title);
    head.appendChild(meta);
    row.appendChild(head);

    const cardsWrap = document.createElement("div");
    cardsWrap.className = openCoop ? "player-hand-faces" : "player-hand-backs";
    cardsWrap.setAttribute(
      "aria-label",
      openCoop
        ? `${hand.length} carte scoperte`
        : competitive
          ? `${hand.length} carte nascoste`
          : `${hand.length} carte`
    );
    if (hand.length === 0) {
      const empty = document.createElement("p");
      const isWinner = state.status === "success" && player === state.winner;
      empty.className = isWinner ? "player-hand-empty winner-label" : "player-hand-empty";
      empty.textContent = isWinner ? "Vince" : "Nessuna carta";
      cardsWrap.appendChild(empty);
    } else if (openCoop) {
      // Collaborativo: tutte le mani a faccia in su (carte scoperte)
      for (const card of hand) {
        const mini = document.createElement("div");
        mini.className = "player-hand-mini";
        mini.appendChild(cardTile(card));
        mini.title = globalThis.MPCardsNames
          ? MPCardsNames.formatCardName(card)
          : card.code;
        cardsWrap.appendChild(mini);
      }
    } else {
      for (let index = 0; index < hand.length; index++) {
        cardsWrap.appendChild(cardBackTile());
      }
    }
    row.appendChild(cardsWrap);
    els.playerHandsList.appendChild(row);
  }
}

function renderHand() {
  if (isRealGame()) {
    if (!game) {
      if (els.sidebarHandStatus) els.sidebarHandStatus.textContent = "";
      return;
    }
    // Gioco reale: pannello laterale (renderRealGameSidebar)
    return;
  }
  if (!els.handDock) return;
  els.handDock.innerHTML = "";
  if (!game) {
    if (els.handDockStatus) els.handDockStatus.textContent = "";
    return;
  }
  const state = game.state;
  const competitive = isCompetitiveGameState(state);
  // Competitivo multi: niente mani bot scoperte; solo sede manuale di turno
  if (competitive && state.players > 1) {
    if (!shouldShowOpenHandPanel()) {
      if (els.handDockPanel) els.handDockPanel.hidden = false;
      if (els.handDockTitle) {
        els.handDockTitle.textContent = isBotTurn()
          ? `${playerLabel(state.currentPlayer)} (computer) — carte nascoste`
          : "Mano nascosta";
      }
      if (els.handDockStatus) {
        els.handDockStatus.textContent = isBotTurn() ? "In attesa del computer…" : "";
      }
      return;
    }
  }
  const player =
    state.players === 1
      ? 0
      : isSeatManual(state.currentPlayer)
        ? state.currentPlayer
        : handViewPlayer();
  // Solitario Durissima con bot: mostra ancora la mano per seguire (non e' competitivo)
  if (competitive && state.players > 1 && !isSeatManual(player)) {
    if (els.handDockTitle) {
      els.handDockTitle.textContent = `${playerLabel(player)} — carte nascoste`;
    }
    return;
  }
  const hand = state.hands[player] || [];
  const interactive =
    state.status === "playing" && isHumanPlayerTurn() && state.currentPlayer === player;
  if (els.handDockTitle) {
    els.handDockTitle.textContent =
      state.players === 1 && game.modes[0] === "bot"
        ? "Mano (computer)"
        : `Mano — ${playerLabel(player)}`;
  }
  if (els.handDockPanel) els.handDockPanel.hidden = false;
  const modeLabel = game.modes[player] === "bot"
    ? core.strategyLabel(game.strategies[player])
    : "Manuale";
  updateHandSelectionStatus(hand.length, player, modeLabel);
  appendHandCards(els.handDock, "dock", player, hand, interactive);
  appendReserveCards(els.handDock, "dock", interactive);
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
  ensureVitaExtraButton();
  const hasGame = !!game;
  els.undo.disabled = !hasGame || !gameState.canUndo(game.session);
  els.redo.disabled = !hasGame || !gameState.canRedo(game.session);
  const tournamentGamePaused = isTournamentGamePaused();
  const botStepMode = isBotTurn() || tournamentGamePaused;
  if (!game || (game.state.status !== "playing" && !tournamentGamePaused)) {
    els.pass.disabled = true;
    els.botStep.disabled = true;
    els.botStep.style.display = "none";
    if (els.vitaExtra) els.vitaExtra.hidden = true;
    return;
  }
  const moves = currentMoves();
  const durissima = core.isDurissimaMater(game.state);
  const durissimaSolo = durissima && game.state.players === 1 && game.state.turnPlayed === 0;
  const canVita = durissima
    && game.state.turnPlayed === 0
    && core.canUseDurissimaVitaExtra(game.state, game.state.currentPlayer);
  els.pass.style.display = isBotTurn() ? "none" : "inline-grid";
  els.botStep.style.display = botStepMode ? "inline-grid" : "none";
  els.pass.disabled = isBotTurn() || durissimaSolo;
  els.pass.className = moves.length === 0 || game.state.turnPlayed > 0 ? "warn" : "secondary";
  if (isIdeaPhase(game.state) && !isBotTurn()) {
    els.pass.textContent = "Chiudi (salta Idea)";
    els.pass.title = "Chiudi il turno senza posare la quinta carta jolly";
  } else if (game.state.turnPlayed > 0 && !isBotTurn()) {
    els.pass.textContent = "Chiudi turno";
    els.pass.removeAttribute("title");
  } else {
    els.pass.textContent = "Passa";
    els.pass.removeAttribute("title");
  }
  if (els.vitaExtra) {
    els.vitaExtra.hidden = isBotTurn() || !canVita;
    els.vitaExtra.disabled = !canVita;
    els.vitaExtra.className = canVita ? "secondary" : "secondary";
  }
  els.botStep.disabled = !botStepMode || els.speed.value !== "step";
  if (tournamentGamePaused && els.speed.value !== "step") {
    els.botStep.title = "Metti Step by step per avanzare mano torneo";
  } else {
    els.botStep.removeAttribute("title");
  }
}

function renderSummary() {
  els.summary.innerHTML = "";
  if (!game) return;
  const state = game.state;
  const player = state.currentPlayer;
  const tournament = core.isTournamentMode(state);
  const tournamentDone = state.status === "tournament_complete";
  const durissima = core.isDurissimaMater(state);
  const reserveCount = durissima ? (state.durissimaReserve || []).length : 0;
  els.activePlayer.textContent = state.status === "playing"
    ? `${playerLabel(player)} ${game.modes[player] === "bot" ? core.strategyShortLabel(game.strategies[player]) : "Manuale"}`
    : tournamentDone
      ? `Torneo: vince ${playerLabel(state.winner)}`
      : state.status === "success"
        ? durissima
          ? (state.players === 1 ? "Solitario: griglia completata" : "Durissima: griglia completata")
          : `Vince ${playerLabel(state.winner)}`
        : (state.status === "game_over" || state.status === "hand_over")
          ? `Partita ${state.tournamentGameIndex}/${state.players} conclusa`
          : "Stallo";
  els.drawCount.textContent = tournament
    ? `Pesca: ${state.drawPile.length} · Partita ${Math.min(state.tournamentGameIndex + (state.status === "playing" ? 1 : 0), state.players)}/${state.players}`
    : `Pesca: ${state.drawPile.length}`;
  const rows = [
    ...(durissima ? [["Modalita'", "Durissima Mater"]] : [["Modalita'", "Dura Mater"]]),
    ...(tournament
      ? [["Torneo", tournamentDone ? "Completato" : `Partita ${Math.min(state.tournamentGameIndex + (state.status === "playing" ? 1 : 0), state.players)}/${state.players}`]]
      : []),
    ["Stato", state.status === "hand_over" ? "game_over" : state.status],
    ["Turni", state.turns],
    ["Dura Mater", state.duraMaterClosed ? `Chiusa (da ${playerLabel(state.closedByPlayer)})` : "Aperta"],
    ...(state.firstAxisInversionDone || state.duraMaterClosed
      ? [["Ordine turni", `${formatTurnOrder(state)}${state.turnDirection === -1 ? " · invertito" : ""}`]]
      : []),
    ["Giocatore", `${playerLabel(player)} (${game.modes[player]})`],
    ["Strategia", game.modes[player] === "bot" ? core.strategyLabel(game.strategies[player]) : "Manuale"],
    ["Mazzo pesca", state.drawPile.length],
    ...(durissima && reserveCount ? [["Legacy riserva", reserveCount]] : []),
    ...(durissima && state.players === 1
      ? [["Mano (carte extra incluse)", (state.hands[0] || []).length]]
      : []),
    ...(durissima && state.durissimaVitaExtraEnabled
      ? [["Vita extra", `${core.durissimaVitaExtraPoolLeft(state)} rimaste`]]
      : []),
    ["Carte giocate nel turno", state.turnPlayed],
    ...(core.canOfferIdea(state, player)
      ? [["Idea", "ATTIVA — quinta jolly opzionale (faccia in giu')"]]
      : []),
    ["Passaggi consecutivi", state.consecutivePasses],
    ...(tournament
      ? state.tournamentScores.map((score, index) => [
          `Punti ${playerLabel(index)}`,
          state.status === "playing"
            ? `${score} (partita: ${state.tournamentGameScores[index] >= 0 ? "+" : ""}${state.tournamentGameScores[index]})`
            : String(score)
        ])
      : [])
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.innerHTML = `<span></span><strong></strong>`;
    row.children[0].textContent = label;
    row.children[1].textContent = value;
    els.summary.appendChild(row);
  }
  if (!selectedCardUid) {
    if (tournamentDone) {
      setStatus(`Classifica: ${formatTournamentRanking(state)}`, "good");
    } else if (state.status === "game_over" || state.status === "hand_over") {
      setStatus(`Partita conclusa (${state.tournamentLastGameReason === "monte" ? "monte" : "tutti finiti"}). Prossima partita…`, "");
    } else if (state.status === "playing" && isIdeaPhase(state) && !isBotTurn()) {
      setStatus("IDEA! Puoi posare una quinta carta jolly (faccia in giu').", "good");
      updateIdeaPhaseFeedback();
    } else {
      setStatus(
        state.status === "playing"
          ? tournament ? "Torneo in corso." : "Partita in corso."
          : state.status === "success"
            ? durissima
              ? (state.players === 1 ? "Solitario completato." : "Griglia Durissima completata.")
              : `Vince ${playerLabel(state.winner)}.`
            : durissima && state.status === "lost"
              ? "Durissima: sconfitta."
              : "Partita in stallo.",
        state.status === "success" || tournamentDone ? "good" : state.status === "stalled" ? "bad" : ""
      );
    }
  } else if (state.status === "playing" && isIdeaPhase(state) && !isBotTurn()) {
    updateIdeaPhaseFeedback();
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

function bindPlayModeTabs() {
  const root = els.playModeTabs || document.getElementById("play-mode-tabs");
  if (!root) return;
  const onPick = mode => {
    if (!mode) return;
    applyPlayMode(mode, { renderConfig: true, save: true });
  };
  root.addEventListener("click", event => {
    const tab = event.target.closest("[data-play-mode]");
    if (!tab || !root.contains(tab)) return;
    event.preventDefault();
    onPick(tab.getAttribute("data-play-mode") || tab.dataset.playMode);
  });
  // Click diretto su ogni tab (piu' affidabile se il bubbling fallisce)
  root.querySelectorAll("[data-play-mode]").forEach(tab => {
    tab.addEventListener("click", event => {
      event.preventDefault();
      onPick(tab.getAttribute("data-play-mode") || tab.dataset.playMode);
    });
  });
}
bindPlayModeTabs();
if (els.tournamentMode) {
  els.tournamentMode.addEventListener("change", () => {
    updateFormatTierHint();
    scheduleSaveGamePrefs();
  });
}
if (els.players) {
  els.players.addEventListener("input", () => {
    syncPlayersInputBounds({ renderConfig: true });
    updateFormatTierHint();
    scheduleSaveGamePrefs();
  });
  els.players.addEventListener("change", () => {
    syncPlayersInputBounds({ renderConfig: true });
    updateFormatTierHint();
    scheduleSaveGamePrefs();
  });
}
if (els.size) {
  const onSize = () => {
    syncPlayersInputBounds({ renderConfig: true });
    updateFormatTierHint();
    scheduleSaveGamePrefs();
  };
  els.size.addEventListener("input", onSize);
  els.size.addEventListener("change", onSize);
}
if (els.durissimaEasyMode) {
  els.durissimaEasyMode.addEventListener("change", () => {
    updateFormatTierHint();
    scheduleSaveGamePrefs();
  });
}
if (els.durissimaExtraCards && els.durissimaExtraCards.type === "checkbox") {
  els.durissimaExtraCards.addEventListener("change", () => {
    updateFormatTierHint();
    scheduleSaveGamePrefs();
  });
}
els.newGame.addEventListener("click", startGame);
if (els.newGamePlay) els.newGamePlay.addEventListener("click", prepareNewGame);
if (els.resetPrefs) els.resetPrefs.addEventListener("click", resetGamePrefsToDefaults);
els.openPlayers.addEventListener("click", () => openModal("players"));
els.openInfo.addEventListener("click", () => openModal("info"));
els.tabPlayers.addEventListener("click", () => showModalTab("players"));
els.tabInfo.addEventListener("click", () => showModalTab("info"));
els.closeModal.addEventListener("click", closeModal);
els.pass.addEventListener("click", passOrEndTurn);
els.botStep.addEventListener("click", runBotStep);
els.undo.addEventListener("click", undoMove);
els.redo.addEventListener("click", redoMove);
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
syncVariantUi();
syncPlayersInputBounds({ renderConfig: true });
updateFormatTierHint();
bindGamePrefsPersistence();

(function renderUiBuildLabel() {
  const target = document.getElementById("app-version");
  if (!target) return;
  const base = target.textContent || "";
  if (!base.includes(DM_UI_BUILD)) {
    target.textContent = base ? `${base} · ${DM_UI_BUILD}` : DM_UI_BUILD;
  }
})();
