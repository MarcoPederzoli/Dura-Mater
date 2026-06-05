"use strict";

const { STRATEGIES, STRATEGY_KEYS, hashSeed, strategyShortLabel } = MPCardsCore;

const PREFS_STORAGE_KEY = "dura-mater-simulator-v1";

const DEFAULT_PREFS = {
  version: 1,
  count: 100,
  lMin: 3,
  lMax: 8,
  gMin: 1,
  gMax: 8,
  workers: null,
  seed: "",
  invertTurnOrderOnClose: true,
  drawAtTurnStart: false,
  durissimaMater: false,
  fixedTurnOrder: false,
  deckEditOpen: false,
  deckCodes: "",
  strategies: Array.from({ length: 8 }, () => "auto")
};

const els = {
  count: document.querySelector("#count"),
  lMin: document.querySelector("#l-min"),
  lMax: document.querySelector("#l-max"),
  gMin: document.querySelector("#g-min"),
  gMax: document.querySelector("#g-max"),
  workers: document.querySelector("#workers"),
  seed: document.querySelector("#seed"),
  invertOrderOnClose: document.querySelector("#invert-order-on-close"),
  drawAtTurnStart: document.querySelector("#draw-at-turn-start"),
  durissimaMater: document.querySelector("#durissima-mater"),
  fixedTurnOrder: document.querySelector("#fixed-turn-order"),
  deckCodes: document.querySelector("#deck-codes"),
  run: document.querySelector("#run"),
  stop: document.querySelector("#stop"),
  resetPrefs: document.querySelector("#reset-prefs"),
  presetSelect: document.querySelector("#preset-select"),
  applyPreset: document.querySelector("#apply-preset"),
  status: document.querySelector("#status"),
  progress: document.querySelector("#progress"),
  progressText: document.querySelector("#progress-text"),
  playerStrategies: document.querySelector("#player-strategies"),
  playerTable: document.querySelector("#player-table"),
  strategyTable: document.querySelector("#strategy-table"),
  turnTable: document.querySelector("#turn-table"),
  deckEditPanel: document.querySelector("#deck-edit-panel"),
  toggleDeckEdit: document.querySelector("#toggle-deck-edit"),
  deckReset: document.querySelector("#deck-reset"),
  deckInfo: document.querySelector("#deck-info"),
  analysisContent: document.querySelector("#analysis-content"),
  exportResults: document.querySelector("#export-results"),
  copyAnalysis: document.querySelector("#copy-analysis"),
  workflowSelect: document.querySelector("#workflow-select"),
  applyWorkflow: document.querySelector("#apply-workflow"),
  runWorkflow: document.querySelector("#run-workflow"),
  importWorkflow: document.querySelector("#import-workflow"),
  importWorkflowBtn: document.querySelector("#import-workflow-btn")
};

let activeRun = null;
let savePrefsTimer = null;
let analysisTimer = null;
let lastResults = null;
let lastAnalysisText = "";

const SIM_PRESETS = {
  "scan-456": {
    label: "Sweep 4×4–6×6",
    count: 500,
    lMin: 4,
    lMax: 6,
    gMin: 2,
    gMax: 6,
    invertTurnOrderOnClose: true,
    drawAtTurnStart: false,
    durissimaMater: false,
    fixedTurnOrder: false,
    strategy: "planner"
  },
  "scan-56": {
    label: "Sweep 5×5–6×6",
    count: 500,
    lMin: 5,
    lMax: 6,
    gMin: 2,
    gMax: 6,
    invertTurnOrderOnClose: true,
    drawAtTurnStart: false,
    durissimaMater: false,
    fixedTurnOrder: false,
    strategy: "planner"
  },
  "scan-468": {
    label: "Sweep 4×4–8×8",
    count: 300,
    lMin: 4,
    lMax: 8,
    gMin: 2,
    gMax: 8,
    invertTurnOrderOnClose: true,
    drawAtTurnStart: false,
    durissimaMater: false,
    fixedTurnOrder: false,
    strategy: "planner"
  },
  "solo-55": {
    label: "Solo 5×5",
    count: 10000,
    lMin: 5,
    lMax: 5,
    gMin: 4,
    gMax: 4,
    invertTurnOrderOnClose: true,
    drawAtTurnStart: false,
    durissimaMater: false,
    fixedTurnOrder: false,
    strategy: "planner"
  },
  "solo-66": {
    label: "Solo 6×6",
    count: 2000,
    lMin: 6,
    lMax: 6,
    gMin: 4,
    gMax: 6,
    invertTurnOrderOnClose: true,
    drawAtTurnStart: false,
    durissimaMater: false,
    fixedTurnOrder: false,
    strategy: "planner"
  }
};

function emptyStrategyWins() {
  return Object.fromEntries(STRATEGY_KEYS.map(key => [key, 0]));
}

function emptySeatStrategyMaps() {
  return { played: {}, wins: {}, points: {} };
}

function seatStrategyKey(player, strategy) {
  return `${player}:${strategy}`;
}

function bumpSeatStrategy(map, player, strategy, amount = 1) {
  const key = seatStrategyKey(player, strategy);
  map[key] = (map[key] || 0) + amount;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function pct(value, total) {
  if (!total) return "0%";
  return `${(value / total * 100).toFixed(1)}%`;
}

function formatAreaLabel(size) {
  return `${size}×${size}`;
}

function readConfig() {
  const lMin = clampNumber(els.lMin.value, 3, 8, 3);
  const lMax = clampNumber(els.lMax.value, 3, 8, 8);
  const gMin = clampNumber(els.gMin.value, 1, 8, 1);
  const gMax = clampNumber(els.gMax.value, 1, 8, 8);
  const config = {
    count: clampNumber(els.count.value, 1, 100000, 100),
    lMin: Math.min(lMin, lMax),
    lMax: Math.max(lMin, lMax),
    gMin: Math.min(gMin, gMax),
    gMax: Math.max(gMin, gMax),
    workers: clampNumber(els.workers.value, 1, 32, defaultWorkerCount()),
    seed: els.seed.value.trim() || String(Date.now()),
    invertTurnOrderOnClose: Boolean(els.invertOrderOnClose?.checked),
    drawAtTurnStart: Boolean(els.drawAtTurnStart?.checked),
    durissimaMater: Boolean(els.durissimaMater?.checked),
    randomizeTurnOrder: !Boolean(els.fixedTurnOrder?.checked),
    deckCodes: readDeckCodesText(),
    strategies: readStrategies()
  };
  MPCardsCore.parseDeckCodes(config.deckCodes);
  if (els.deckCodes && els.deckEditPanel && !els.deckEditPanel.hidden) {
    els.deckCodes.value = config.deckCodes;
  }
  els.lMin.value = config.lMin;
  els.lMax.value = config.lMax;
  els.gMin.value = config.gMin;
  els.gMax.value = config.gMax;
  els.count.value = config.count;
  els.workers.value = config.workers;
  return config;
}

function defaultWorkerCount() {
  return Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
}

function activePlayerCount() {
  const gMin = clampNumber(els.gMin.value, 1, 8, 1);
  const gMax = clampNumber(els.gMax.value, 1, 8, 8);
  return Math.max(gMin, gMax);
}

function readDeckCodesText() {
  const usingOverride = els.deckEditPanel && !els.deckEditPanel.hidden && els.deckCodes;
  const text = usingOverride ? els.deckCodes.value.trim() : MPCardsCore.deckCodesText();
  const deck = MPCardsCore.parseDeckCodes(text);
  return MPCardsCore.deckCodesText(deck.map(card => card.code));
}

function normalizePrefs(raw) {
  const prefs = { ...DEFAULT_PREFS, ...(raw && typeof raw === "object" ? raw : {}) };
  prefs.count = clampNumber(prefs.count, 1, 100000, DEFAULT_PREFS.count);
  prefs.lMin = clampNumber(prefs.lMin, 3, 8, DEFAULT_PREFS.lMin);
  prefs.lMax = clampNumber(prefs.lMax, 3, 8, DEFAULT_PREFS.lMax);
  prefs.gMin = clampNumber(prefs.gMin, 1, 8, DEFAULT_PREFS.gMin);
  prefs.gMax = clampNumber(prefs.gMax, 1, 8, DEFAULT_PREFS.gMax);
  prefs.lMin = Math.min(prefs.lMin, prefs.lMax);
  prefs.lMax = Math.max(prefs.lMin, prefs.lMax);
  prefs.gMin = Math.min(prefs.gMin, prefs.gMax);
  prefs.gMax = Math.max(prefs.gMin, prefs.gMax);
  const workersFallback = defaultWorkerCount();
  prefs.workers = prefs.workers == null
    ? workersFallback
    : clampNumber(prefs.workers, 1, 32, workersFallback);
  prefs.seed = typeof prefs.seed === "string" ? prefs.seed : DEFAULT_PREFS.seed;
  prefs.invertTurnOrderOnClose = prefs.invertTurnOrderOnClose !== false;
  prefs.drawAtTurnStart = prefs.drawAtTurnStart === true;
  prefs.durissimaMater = prefs.durissimaMater === true;
  prefs.fixedTurnOrder = prefs.fixedTurnOrder === true || prefs.randomizeTurnOrder === false;
  prefs.deckEditOpen = Boolean(prefs.deckEditOpen);
  prefs.deckCodes = typeof prefs.deckCodes === "string" ? prefs.deckCodes : DEFAULT_PREFS.deckCodes;
  const validStrategy = new Set(STRATEGY_KEYS.concat(["auto"]));
  prefs.strategies = Array.from({ length: 8 }, (_, index) => {
    const value = prefs.strategies?.[index];
    return validStrategy.has(value) ? value : "auto";
  });
  return prefs;
}

function collectPrefs() {
  let deckCodes = "";
  if (els.deckEditPanel && !els.deckEditPanel.hidden && els.deckCodes) {
    try {
      deckCodes = readDeckCodesText();
    } catch {
      deckCodes = els.deckCodes.value.trim();
    }
  }
  return normalizePrefs({
    version: 1,
    count: els.count.value,
    lMin: els.lMin.value,
    lMax: els.lMax.value,
    gMin: els.gMin.value,
    gMax: els.gMax.value,
    workers: els.workers.value,
    seed: els.seed.value,
    invertTurnOrderOnClose: Boolean(els.invertOrderOnClose?.checked),
    drawAtTurnStart: Boolean(els.drawAtTurnStart?.checked),
    durissimaMater: Boolean(els.durissimaMater?.checked),
    fixedTurnOrder: Boolean(els.fixedTurnOrder?.checked),
    deckEditOpen: Boolean(els.deckEditPanel && !els.deckEditPanel.hidden),
    deckCodes,
    strategies: readStrategies()
  });
}

function applyPrefs(prefs) {
  const normalized = normalizePrefs(prefs);
  els.count.value = normalized.count;
  els.lMin.value = String(normalized.lMin);
  els.lMax.value = String(normalized.lMax);
  els.gMin.value = normalized.gMin;
  els.gMax.value = normalized.gMax;
  els.workers.value = normalized.workers;
  els.seed.value = normalized.seed;
  if (els.invertOrderOnClose) els.invertOrderOnClose.checked = normalized.invertTurnOrderOnClose;
  if (els.drawAtTurnStart) els.drawAtTurnStart.checked = normalized.drawAtTurnStart;
  if (els.durissimaMater) els.durissimaMater.checked = normalized.durissimaMater;
  if (els.fixedTurnOrder) els.fixedTurnOrder.checked = normalized.fixedTurnOrder;
  if (els.deckCodes) {
    els.deckCodes.value = normalized.deckEditOpen && normalized.deckCodes
      ? normalized.deckCodes
      : MPCardsCore.deckCodesText();
  }
  setDeckEditVisible(normalized.deckEditOpen);
  renderStrategyInputs(normalized.strategies);
  return normalized;
}

function loadSavedPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return applyPrefs(DEFAULT_PREFS);
    return applyPrefs(JSON.parse(raw));
  } catch {
    return applyPrefs(DEFAULT_PREFS);
  }
}

function savePrefsNow() {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(collectPrefs()));
  } catch {
    // quota o storage disabilitato: la sessione corrente resta comunque valida
  }
}

function scheduleSavePrefs() {
  clearTimeout(savePrefsTimer);
  savePrefsTimer = setTimeout(savePrefsNow, 250);
}

function resetPrefsToDefaults() {
  try {
    localStorage.removeItem(PREFS_STORAGE_KEY);
  } catch {
    // ignore
  }
  applyPrefs(DEFAULT_PREFS);
  setStatus("Opzioni ripristinate ai valori predefiniti.", "good");
}

function bindPrefsPersistence() {
  const fields = [
    els.count, els.lMin, els.lMax, els.gMin, els.gMax, els.workers, els.seed,
    els.invertOrderOnClose, els.drawAtTurnStart, els.durissimaMater, els.fixedTurnOrder
  ];
  for (const field of fields) {
    if (!field) continue;
    field.addEventListener("input", scheduleSavePrefs);
    field.addEventListener("change", scheduleSavePrefs);
  }
  if (els.playerStrategies) {
    els.playerStrategies.addEventListener("change", scheduleSavePrefs);
  }
  if (els.deckCodes) els.deckCodes.addEventListener("input", scheduleSavePrefs);
}

function renderStrategyInputs(strategiesOverride) {
  const previous = strategiesOverride || readStrategies();
  const players = activePlayerCount();
  els.playerStrategies.innerHTML = "";
  for (let player = 0; player < players; player++) {
    const label = document.createElement("label");
    const select = document.createElement("select");
    select.className = "player-strategy";
    select.dataset.player = String(player);
    for (const [value, text] of STRATEGIES) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }
    select.value = previous[player] || "auto";
    label.append(`Giocatore ${player + 1}`, select);
    els.playerStrategies.appendChild(label);
  }
}

function readStrategies() {
  const selects = Array.from(document.querySelectorAll(".player-strategy"));
  return Array.from({ length: 8 }, (_, index) => selects[index]?.value || "auto");
}

function setAllStrategies(value) {
  renderStrategyInputs();
  document.querySelectorAll(".player-strategy").forEach(select => {
    select.value = value;
  });
  scheduleSavePrefs();
}

function countValidJobs(lMin, lMax, gMin, gMax) {
  let jobs = 0;
  for (let size = lMin; size <= lMax; size++) {
    for (let players = gMin; players <= gMax; players++) {
      if (size >= players) jobs++;
    }
  }
  return jobs;
}

function applySimulationPreset(key) {
  const preset = SIM_PRESETS[key];
  if (!preset) return;
  els.count.value = preset.count;
  els.lMin.value = String(preset.lMin);
  els.lMax.value = String(preset.lMax);
  els.gMin.value = preset.gMin;
  els.gMax.value = preset.gMax;
  if (els.invertOrderOnClose) els.invertOrderOnClose.checked = preset.invertTurnOrderOnClose;
  if (els.drawAtTurnStart) els.drawAtTurnStart.checked = preset.drawAtTurnStart;
  if (els.durissimaMater) els.durissimaMater.checked = preset.durissimaMater;
  if (els.fixedTurnOrder) els.fixedTurnOrder.checked = preset.fixedTurnOrder;
  setAllStrategies(preset.strategy);
  const jobs = countValidJobs(preset.lMin, preset.lMax, preset.gMin, preset.gMax);
  const total = jobs * preset.count;
  setStatus(`Preset «${preset.label}»: ${jobs} casi L×G, ${total.toLocaleString("it-IT")} partite previste.`, "good");
  scheduleSavePrefs();
}

function makeJobs(config, stepId = "") {
  const jobs = [];
  for (let size = config.lMin; size <= config.lMax; size++) {
    for (let players = config.gMin; players <= config.gMax; players++) {
      if (size >= players) {
        const cellId = `${size}x${players}`;
        jobs.push({
          id: stepId ? `${stepId}::${cellId}` : cellId,
          cellId,
          stepId: stepId || null,
          size,
          players,
          count: config.count,
          seed: stepId
            ? `${config.seed}:${stepId}:${size}:${players}`
            : `${config.seed}:${size}:${players}`,
          deckCodes: config.deckCodes,
          strategies: config.strategies.slice(0, players),
          invertTurnOrderOnClose: config.invertTurnOrderOnClose,
          drawAtTurnStart: config.drawAtTurnStart,
          durissimaMater: config.durissimaMater,
          randomizeTurnOrder: config.randomizeTurnOrder !== false,
          shuffleStrategiesAmongSeats: config.shuffleStrategiesAmongSeats === true
        });
      }
    }
  }
  return jobs;
}

function normalizeStepStrategies(raw) {
  const valid = new Set(STRATEGY_KEYS.concat(["auto"]));
  return Array.from({ length: 8 }, (_, index) => {
    const value = raw?.[index];
    return valid.has(value) ? value : "auto";
  });
}

function stepConfigFromWorkflowStep(step, shared, uiConfig) {
  const lMin = clampNumber(step.lMin, 3, 8, 4);
  const lMax = clampNumber(step.lMax, 3, 8, lMin);
  const gMin = clampNumber(step.gMin, 1, 8, 2);
  const gMax = clampNumber(step.gMax, 1, 8, gMin);
  const strategies = step.strategies
    ? normalizeStepStrategies(step.strategies)
    : Array.from({ length: 8 }, () => (step.strategy && STRATEGY_KEYS.includes(step.strategy) ? step.strategy : "auto"));
  if (step.strategy && !step.strategies) {
    for (let i = 0; i < 8; i++) strategies[i] = step.strategy;
  }
  return {
    count: clampNumber(step.count, 1, 100000, 100),
    lMin: Math.min(lMin, lMax),
    lMax: Math.max(lMin, lMax),
    gMin: Math.min(gMin, gMax),
    gMax: Math.max(gMin, gMax),
    workers: uiConfig.workers,
    seed: uiConfig.seed,
    invertTurnOrderOnClose: step.invertTurnOrderOnClose ?? shared?.invertTurnOrderOnClose ?? true,
    drawAtTurnStart: step.drawAtTurnStart ?? shared?.drawAtTurnStart ?? false,
    durissimaMater: step.durissimaMater ?? shared?.durissimaMater ?? false,
    randomizeTurnOrder: !(step.fixedTurnOrder ?? shared?.fixedTurnOrder ?? false),
    shuffleStrategiesAmongSeats: step.shuffleStrategiesAmongSeats === true
      || shared?.shuffleStrategiesAmongSeats === true,
    deckCodes: uiConfig.deckCodes,
    strategies
  };
}

function initStepState(stepMeta, config) {
  const jobs = makeJobs(config, stepMeta.id);
  const stepState = {
    stepId: stepMeta.id,
    stepLabel: stepMeta.label || stepMeta.id,
    config,
    jobs,
    cells: new Map(),
    rowTotals: new Map(),
    columnTotals: new Map(),
    grandTotal: emptyAggregateStats(),
    done: 0,
    total: jobs.reduce((sum, job) => sum + job.count, 0)
  };
  for (const job of jobs) {
    stepState.cells.set(job.cellId, emptyStats(job.players));
    if (!stepState.rowTotals.has(job.size)) stepState.rowTotals.set(job.size, emptyAggregateStats());
    if (!stepState.columnTotals.has(job.players)) {
      stepState.columnTotals.set(job.players, emptyAggregateStats());
    }
  }
  return stepState;
}

function getWorkflowByKey(key) {
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  return catalog[key] || null;
}

function validateImportedWorkflow(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Workflow JSON non valido.");
  if (!Array.isArray(raw.steps) || !raw.steps.length) throw new Error("Il workflow deve avere almeno uno step.");
  return {
    id: String(raw.id || "imported"),
    label: String(raw.label || raw.id || "Workflow importato"),
    description: String(raw.description || ""),
    shared: raw.shared && typeof raw.shared === "object" ? raw.shared : {},
    steps: raw.steps
  };
}

function applyWorkflowToUi(key) {
  const workflow = getWorkflowByKey(key);
  if (!workflow || !workflow.steps.length) return;
  const first = workflow.steps[0];
  const ui = readConfig();
  const stepConfig = stepConfigFromWorkflowStep(first, workflow.shared, ui);
  els.count.value = stepConfig.count;
  els.lMin.value = String(stepConfig.lMin);
  els.lMax.value = String(stepConfig.lMax);
  els.gMin.value = stepConfig.gMin;
  els.gMax.value = stepConfig.gMax;
  if (els.invertOrderOnClose) els.invertOrderOnClose.checked = stepConfig.invertTurnOrderOnClose;
  if (els.drawAtTurnStart) els.drawAtTurnStart.checked = stepConfig.drawAtTurnStart;
  if (els.durissimaMater) els.durissimaMater.checked = stepConfig.durissimaMater;
  if (els.fixedTurnOrder) els.fixedTurnOrder.checked = !stepConfig.randomizeTurnOrder;
  renderStrategyInputs(stepConfig.strategies);
  const total = workflow.steps.reduce((sum, step) => {
    const cfg = stepConfigFromWorkflowStep(step, workflow.shared, ui);
    return sum + countValidJobs(cfg.lMin, cfg.lMax, cfg.gMin, cfg.gMax) * cfg.count;
  }, 0);
  setStatus(
    `Workflow «${workflow.label}»: ${workflow.steps.length} step, ${total.toLocaleString("it-IT")} partite totali. Primo step caricato nei campi.`,
    "good"
  );
  scheduleSavePrefs();
}

function runWorkflowDefinition(workflowDef) {
  stopSimulations();
  let uiConfig;
  try {
    uiConfig = readConfig();
  } catch (error) {
    setStatus(error.message, "bad");
    return;
  }
  const stepStates = workflowDef.steps.map(step => {
    const config = stepConfigFromWorkflowStep(step, workflowDef.shared, uiConfig);
    return initStepState({ id: step.id, label: step.label }, config);
  });
  const jobs = stepStates.flatMap(step => step.jobs);
  const jobById = new Map(jobs.map(job => [job.id, job]));
  const stepById = new Map(stepStates.map(step => [step.stepId, step]));
  const state = {
    workflow: workflowDef,
    workflowShared: {
      seed: uiConfig.seed,
      workers: uiConfig.workers,
      deckVariant: Boolean(uiConfig.deckCodes && uiConfig.deckCodes !== MPCardsCore.deckCodesText())
    },
    stepStates,
    stepById,
    jobById,
    activeStepId: null,
    config: stepStates[0].config,
    jobs,
    queue: jobs.slice(),
    done: 0,
    total: jobs.reduce((sum, job) => sum + job.count, 0),
    completedJobs: 0,
    cells: stepStates[0].cells,
    rowTotals: stepStates[0].rowTotals,
    columnTotals: stepStates[0].columnTotals,
    grandTotal: stepStates[0].grandTotal,
    workers: [],
    stopped: false
  };
  startSimulationRun(state, { workflowLabel: workflowDef.label });
}

function runSelectedWorkflow() {
  const key = els.workflowSelect?.value;
  if (!key) {
    setStatus("Scegli un workflow dal menu.", "bad");
    return;
  }
  const workflow = getWorkflowByKey(key);
  if (!workflow) {
    setStatus("Workflow non trovato.", "bad");
    return;
  }
  savePrefsNow();
  runWorkflowDefinition(workflow);
}

function switchActiveStepUi(state, stepId) {
  const step = state.stepById.get(stepId);
  if (!step || state.activeStepId === stepId) return;
  state.activeStepId = stepId;
  state.config = step.config;
  state.cells = step.cells;
  state.rowTotals = step.rowTotals;
  state.columnTotals = step.columnTotals;
  state.grandTotal = step.grandTotal;
  resetTables(step.config, step.jobs, state);
  for (const job of step.jobs) {
    updateCell(job.size, job.players, state);
    updateAggregateCells(job.size, job.players, state);
  }
  setStatus(`Workflow: step «${step.stepLabel}» (${state.workflow.label}).`, "");
}

function emptyStats(players) {
  return {
    done: 0,
    players,
    winsByPlayer: Array.from({ length: players }, () => 0),
    playedByPlayer: Array.from({ length: players }, () => 0),
    pointsByPlayer: Array.from({ length: players }, () => 0),
    winsByStrategy: emptyStrategyWins(),
    playedByStrategy: emptyStrategyWins(),
    pointsByStrategy: emptyStrategyWins(),
    seatStrategy: emptySeatStrategyMaps(),
    stalls: 0,
    turnMin: null,
    turnMax: null,
    turnSum: 0
  };
}

function emptyAggregateStats() {
  return emptyStats(8);
}

function mergeStats(target, patch) {
  target.done += patch.done;
  target.stalls += patch.stalls;
  target.turnSum += patch.turnSum;
  target.turnMin = target.turnMin === null ? patch.turnMin : Math.min(target.turnMin, patch.turnMin);
  target.turnMax = target.turnMax === null ? patch.turnMax : Math.max(target.turnMax, patch.turnMax);
  patch.winsByPlayer.forEach((count, index) => {
    target.winsByPlayer[index] += count;
  });
  if (patch.playedByPlayer) {
    patch.playedByPlayer.forEach((count, index) => {
      target.playedByPlayer[index] += count;
    });
  } else {
    for (let index = 0; index < patch.winsByPlayer.length; index++) {
      target.playedByPlayer[index] += patch.done;
    }
  }
  if (patch.pointsByPlayer) {
    patch.pointsByPlayer.forEach((count, index) => {
      target.pointsByPlayer[index] += count;
    });
  } else {
    patch.winsByPlayer.forEach((count, index) => {
      target.pointsByPlayer[index] += count * target.players;
    });
  }
  for (const key of STRATEGY_KEYS) {
    target.winsByStrategy[key] += patch.winsByStrategy[key] || 0;
    target.playedByStrategy[key] += patch.playedByStrategy?.[key] || 0;
    target.pointsByStrategy[key] += patch.pointsByStrategy?.[key] || 0;
  }
  if (patch.seatStrategy) {
    if (!target.seatStrategy) target.seatStrategy = emptySeatStrategyMaps();
    for (const [key, count] of Object.entries(patch.seatStrategy.played || {})) {
      target.seatStrategy.played[key] = (target.seatStrategy.played[key] || 0) + count;
    }
    for (const [key, count] of Object.entries(patch.seatStrategy.wins || {})) {
      target.seatStrategy.wins[key] = (target.seatStrategy.wins[key] || 0) + count;
    }
    for (const [key, count] of Object.entries(patch.seatStrategy.points || {})) {
      target.seatStrategy.points[key] = (target.seatStrategy.points[key] || 0) + count;
    }
  }
}

function setStatus(text, className = "") {
  els.status.textContent = text;
  els.status.className = `status ${className}`.trim();
}

function resetTables(config, jobs, state) {
  const columns = Array.from({ length: config.gMax - config.gMin + 1 }, (_, i) => config.gMin + i);
  const rows = Array.from({ length: config.lMax - config.lMin + 1 }, (_, i) => config.lMin + i);
  renderTableSkeleton(els.playerTable, rows, columns, "player", state);
  renderTableSkeleton(els.strategyTable, rows, columns, "strategy", state);
  renderTableSkeleton(els.turnTable, rows, columns, "turn", state);
  for (const job of jobs) {
    updateCell(job.size, job.players, state);
  }
}

function renderTableSkeleton(table, rows, columns, type, state) {
  table.innerHTML = "";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  for (const players of columns) {
    const th = document.createElement("th");
    th.textContent = `${players} gioc.`;
    headRow.appendChild(th);
  }
  const totalHead = document.createElement("th");
  totalHead.textContent = "Totale";
  headRow.appendChild(totalHead);
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const size of rows) {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = formatAreaLabel(size);
    row.appendChild(th);
    for (const players of columns) {
      const td = document.createElement("td");
      td.dataset.type = type;
      td.dataset.size = String(size);
      td.dataset.players = String(players);
      if (size < players) {
        td.className = "invalid";
        td.textContent = "-";
      } else if (!state.cells.has(`${size}x${players}`)) {
        td.className = "invalid";
        td.textContent = "-";
      } else {
        td.innerHTML = `<span class="pending">In attesa</span>`;
      }
      row.appendChild(td);
    }
    row.appendChild(totalCell(type, "row", size));
    tbody.appendChild(row);
  }

  const totalRow = document.createElement("tr");
  const totalTh = document.createElement("th");
  totalTh.textContent = "Totale";
  totalRow.appendChild(totalTh);
  for (const players of columns) {
    totalRow.appendChild(totalCell(type, "column", players));
  }
  totalRow.appendChild(totalCell(type, "grand", "all"));
  tbody.appendChild(totalRow);
  table.appendChild(tbody);
}

function totalCell(type, totalKind, totalKey) {
  const td = document.createElement("td");
  td.dataset.type = type;
  td.dataset.total = totalKind;
  td.dataset.key = String(totalKey);
  td.innerHTML = `<span class="pending">In attesa</span>`;
  return td;
}

function updateCell(size, players, state) {
  const stats = state.cells.get(`${size}x${players}`);
  if (!stats) return;
  for (const type of ["player", "strategy", "turn"]) {
    const cell = document.querySelector(`td[data-type="${type}"][data-size="${size}"][data-players="${players}"]`);
    if (!cell) continue;
    cell.className = "";
    cell.replaceChildren(renderCellContent(type, stats));
  }
}

function updateAggregateCells(size, players, state) {
  const aggregateKeys = [
    ["row", String(size), state.rowTotals.get(size)],
    ["column", String(players), state.columnTotals.get(players)],
    ["grand", "all", state.grandTotal]
  ];
  for (const [totalKind, key, stats] of aggregateKeys) {
    for (const type of ["player", "strategy", "turn"]) {
      const cell = document.querySelector(`td[data-type="${type}"][data-total="${totalKind}"][data-key="${key}"]`);
      if (!cell) continue;
      cell.className = "";
      cell.replaceChildren(renderCellContent(type, stats));
    }
  }
}

function renderCellContent(type, stats) {
  const box = document.createElement("div");
  box.className = "cell-lines";
  if (stats.done === 0) {
    const pending = document.createElement("span");
    pending.className = "pending";
    pending.textContent = "In attesa";
    box.appendChild(pending);
    return box;
  }

  if (type === "player") {
    stats.winsByPlayer.forEach((count, index) => {
      const played = stats.playedByPlayer[index] || 0;
      const points = stats.pointsByPlayer[index] || 0;
      if (played > 0) {
        const ratio = points / played;
        box.appendChild(line(`G${index + 1}: ${pct(points, played)}`, disparityClass(ratio)));
      }
    });
    if (stats.stalls > 0) box.appendChild(line(`Stallo: ${pct(stats.stalls, stats.done)}`));
    return box;
  }

  if (type === "strategy") {
    for (const key of STRATEGY_KEYS) {
      const played = stats.playedByStrategy[key] || 0;
      const points = stats.pointsByStrategy[key] || 0;
      if (played > 0) {
        const ratio = points / played;
        box.appendChild(line(`${strategyShortLabel(key)}: ${pct(points, played)}`, disparityClass(ratio)));
      }
    }
    if (stats.stalls > 0) box.appendChild(line(`Stallo: ${pct(stats.stalls, stats.done)}`));
    return box;
  }

  const avg = stats.done ? stats.turnSum / stats.done : 0;
  box.appendChild(line(`Min: ${stats.turnMin ?? "-"}`));
  box.appendChild(line(`Media: ${avg.toFixed(1)}`));
  box.appendChild(line(`Max: ${stats.turnMax ?? "-"}`));
  return box;
}

function disparityClass(ratio) {
  if (ratio > 3 || ratio < 1 / 3) return "disparity-line level-3";
  if (ratio > 2 || ratio < 0.5) return "disparity-line level-2";
  if (ratio > 1.5 || ratio < 0.67) return "disparity-line level-1";
  return "";
}

function cloneStats(stats) {
  return {
    done: stats.done,
    players: stats.players,
    winsByPlayer: stats.winsByPlayer.slice(),
    playedByPlayer: stats.playedByPlayer.slice(),
    pointsByPlayer: stats.pointsByPlayer.slice(),
    winsByStrategy: { ...stats.winsByStrategy },
    playedByStrategy: { ...stats.playedByStrategy },
    pointsByStrategy: { ...stats.pointsByStrategy },
    seatStrategy: stats.seatStrategy
      ? {
          played: { ...stats.seatStrategy.played },
          wins: { ...stats.seatStrategy.wins },
          points: { ...stats.seatStrategy.points }
        }
      : emptySeatStrategyMaps(),
    stalls: stats.stalls,
    turnMin: stats.turnMin,
    turnMax: stats.turnMax,
    turnSum: stats.turnSum
  };
}

function serializeSeatAssignment(config) {
  const maxPlayers = config.gMax || config.strategies?.length || 8;
  return Array.from({ length: maxPlayers }, (_, index) => {
    const setting = config.strategies?.[index] || "auto";
    return {
      seat: index,
      seatLabel: `G${index + 1}`,
      strategySetting: setting,
      strategyLabel: setting === "auto" ? "Auto" : strategyShortLabel(setting)
    };
  }).filter((_, index) => index < maxPlayers);
}

function serializeConfig(config) {
  return {
    count: config.count,
    lMin: config.lMin,
    lMax: config.lMax,
    gMin: config.gMin,
    gMax: config.gMax,
    workers: config.workers,
    seed: config.seed,
    invertTurnOrderOnClose: config.invertTurnOrderOnClose,
    drawAtTurnStart: config.drawAtTurnStart,
    durissimaMater: config.durissimaMater,
    randomizeTurnOrder: config.randomizeTurnOrder !== false,
    shuffleStrategiesAmongSeats: config.shuffleStrategiesAmongSeats === true,
    strategies: config.strategies.slice(),
    seatAssignment: serializeSeatAssignment(config),
    deckVariant: Boolean(config.deckCodes && config.deckCodes !== MPCardsCore.deckCodesText())
  };
}

function parseSeatStrategyKey(key) {
  const colon = key.indexOf(":");
  if (colon < 0) return { player: 0, strategy: key };
  return {
    player: Number(key.slice(0, colon)),
    strategy: key.slice(colon + 1)
  };
}

function buildSeatStrategyBreakdown(stats, config) {
  const maps = stats.seatStrategy || emptySeatStrategyMaps();
  const rows = [];
  for (const [key, played] of Object.entries(maps.played || {})) {
    if (!played) continue;
    const { player, strategy } = parseSeatStrategyKey(key);
    const points = maps.points[key] || 0;
    const wins = maps.wins[key] || 0;
    const ratio = points / played;
    rows.push({
      key,
      seat: player,
      seatLabel: `G${player + 1}`,
      strategy,
      strategyLabel: strategyShortLabel(strategy),
      played,
      wins,
      winRate: wins / played,
      ratio,
      performancePct: ratio * 100,
      deviationPct: (ratio - 1) * 100
    });
  }
  rows.sort((a, b) => b.deviationPct - a.deviationPct);
  const assigned = (config.strategies || []).slice(0, config.gMax || 8);
  const distinctSeats = new Set(assigned.filter((_, i) => i < (config.gMax || 8)).map((s, i) => `${i}:${s}`));
  const fixedPerSeat = assigned.some(s => s !== "auto") && new Set(assigned.filter(s => s !== "auto")).size > 1;
  let interpretation = "Usa posto (G1…Gn) e strategia insieme: se solo una riga per strategia ma più posti, il vantaggio è della strategia; se un posto domina ma la strategia su quel posto è media, conta la posizione.";
  if (config.shuffleStrategiesAmongSeats) {
    interpretation =
      "Rotazione strategie: a ogni partita le quattro strategie dello step sono assegnate a posti casuali. Se «posto» e «strategia» divergono rispetto al mix fisso, vince la strategia; se restano allineati, c’è ancora bias di posto.";
  } else if (!config.randomizeTurnOrder && config.randomizeTurnOrder !== undefined) {
    interpretation = "Ordine fisso G1 primo: le righe «posto» misurano il ruolo nel turno, non il posto al tavolo.";
  } else if (config.randomizeTurnOrder !== false) {
    interpretation = "Ordine iniziale casuale: G1…Gn = posto fisso al tavolo; la strategia resta sul posto ogni partita. Confronta winsByPlayer (posto) vs righe per strategy (aggregato su tutti i posti con quella strategia) vs righe seat+strategy (accoppiamento esatto).";
  }
  if (!fixedPerSeat) {
    interpretation += " Attenzione: stessa strategia su più posti o «auto» — separare posto e strategia è più difficile.";
  }
  return { rows, fixedPerSeat, interpretation };
}

function buildResultsSnapshot(state, meta = {}) {
  const cells = {};
  for (const [id, stats] of state.cells.entries()) {
    if (stats.done > 0) cells[id] = cloneStats(stats);
  }
  const rowTotals = {};
  for (const [size, stats] of state.rowTotals.entries()) {
    if (stats.done > 0) rowTotals[size] = cloneStats(stats);
  }
  const columnTotals = {};
  for (const [players, stats] of state.columnTotals.entries()) {
    if (stats.done > 0) columnTotals[players] = cloneStats(stats);
  }
  return {
    format: "dura-mater-simulator-results",
    version: 1,
    exportedAt: new Date().toISOString(),
    partial: Boolean(meta.partial),
    simulationsDone: state.grandTotal.done,
    simulationsTarget: state.total,
    config: serializeConfig(state.config),
    grandTotal: cloneStats(state.grandTotal),
    cells,
    rowTotals,
    columnTotals,
    analysis: buildAnalysisReport(state.grandTotal, state.config, state.cells),
    seatStrategyBreakdown: buildSeatStrategyBreakdown(state.grandTotal, state.config)
  };
}

function buildStepSnapshot(stepState, meta = {}) {
  const snapshot = buildResultsSnapshot(
    { ...stepState, total: stepState.total },
    meta
  );
  snapshot.stepId = stepState.stepId;
  snapshot.stepLabel = stepState.stepLabel;
  return snapshot;
}

function buildWorkflowSnapshot(state, meta = {}) {
  const steps = [];
  for (const stepState of state.stepStates) {
    if (stepState.grandTotal.done > 0) {
      steps.push(buildStepSnapshot(stepState, { partial: meta.partial }));
    }
  }
  return {
    format: "dura-mater-simulator-workflow-results",
    version: 2,
    exportedAt: new Date().toISOString(),
    partial: Boolean(meta.partial),
    simulationsDone: state.done,
    simulationsTarget: state.total,
    workflow: {
      id: state.workflow.id,
      label: state.workflow.label,
      description: state.workflow.description || ""
    },
    shared: state.workflowShared,
    steps,
    auditGuide: state.workflow.auditGuide || null,
    hints: {
      forAnalysis:
        "Passa questo file intero all'assistente: ogni elemento in `steps` è un blocco scenario; `seatStrategyBreakdown` separa posto+strategia; `analysis.positions` misura solo il posto; `auditGuide` spiega come leggere l'audit MASTER."
    }
  };
}

function activePlayerSlots(stats, config) {
  let max = 0;
  for (let index = 0; index < stats.playedByPlayer.length; index++) {
    if (stats.playedByPlayer[index] > 0) max = index + 1;
  }
  return max || config.gMax || 1;
}

function performanceRatio(points, played) {
  if (!played) return null;
  return points / played;
}

function formatRatioPct(ratio) {
  if (ratio === null) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatDeviationPct(ratio) {
  if (ratio === null) return "—";
  const deviation = (ratio - 1) * 100;
  const sign = deviation > 0 ? "+" : "";
  return `${sign}${deviation.toFixed(1)}%`;
}

function sampleStrength(done) {
  if (done < 100) return { level: "low", text: "Campione piccolo (<100): interpretare con cautela." };
  if (done < 1000) return { level: "medium", text: "Campione medio (100–999): trend indicativi." };
  return { level: "high", text: "Campione ampio (≥1000): stime più affidabili." };
}

function scenarioOutcomeLabels(durissima) {
  if (durissima) {
    return {
      sectionTitle: "Completamento matrice per scenario",
      sectionHint: "Durissima Mater attiva: % di partite in cui tutte le carte sono state posate (matrice L×L piena).",
      rowVerb: "completate",
      exportHeading: "Completamento matrice per scenario (dal più difficile):"
    };
  }
  return {
    sectionTitle: "Esito per scenario",
    sectionHint: "Modalità competitiva: % di partite con un vincitore (primo che esaurisce la mano). Stallo = nessun vincitore.",
    rowVerb: "con vincitore",
    exportHeading: "Esito per scenario (dal peggiore al migliore):"
  };
}

function buildAnalysisContext(config, grandTotal) {
  const stallPct = grandTotal.done ? grandTotal.stalls / grandTotal.done * 100 : 0;
  const successPct = grandTotal.done
    ? (grandTotal.done - grandTotal.stalls) / grandTotal.done * 100
    : 0;
  const durissima = config.durissimaMater === true;
  const randomizeTurnOrder = config.randomizeTurnOrder !== false;
  const competitiveBiasReliable = !durissima && stallPct < 70 && successPct >= 15;
  const warnings = [];
  if (!randomizeTurnOrder) {
    warnings.push(
      "Ordine iniziale fisso (G1 sempre primo): le % per G1…Gn misurano il ruolo nel turno, non un posto al tavolo come in partita reale."
    );
  }
  if (durissima) {
    warnings.push(
      "Durissima Mater: l'obiettivo è riempire tutta la matrice. Le percentuali «vittoria per G1…Gn» non misurano il vantaggio di posto (in caso di successo collaborativo tutti vincono insieme)."
    );
  }
  if (stallPct >= 70) {
    warnings.push(
      `Stallo ${stallPct.toFixed(1)}%: la maggior parte delle partite non arriva a completamento — i confronti per posizione/strategia sono poco affidabili.`
    );
  }
  if (durissima && successPct < 15) {
    warnings.push(
      `Completamento ${successPct.toFixed(1)}%: con questi parametri la griglia resta spesso incompleta (stallo o mosse impossibili).`
    );
  }
  return {
    stallPct,
    successPct,
    durissima,
    randomizeTurnOrder,
    competitiveBiasReliable,
    strategyBiasReliable: competitiveBiasReliable,
    warnings
  };
}

function analyzePlayerPositions(stats, config, ctx) {
  if (!ctx.competitiveBiasReliable) {
    return {
      rows: [],
      spread: 0,
      skipped: true,
      verdict: ctx.durissima
        ? "Bias di posizione non applicabile in Durissima Mater. Guarda completamento globale e tabella per scenario (L×G)."
        : "Bias di posizione non calcolabile: troppi stalli o poche partite con vincitore."
    };
  }
  const slots = activePlayerSlots(stats, config);
  const rows = [];
  for (let index = 0; index < slots; index++) {
    const played = stats.playedByPlayer[index] || 0;
    if (!played) continue;
    const points = stats.pointsByPlayer[index] || 0;
    const wins = stats.winsByPlayer[index] || 0;
    const ratio = performanceRatio(points, played);
    rows.push({
      index,
      label: `G${index + 1}`,
      role: ctx.randomizeTurnOrder
        ? "posto al tavolo (ordine di partenza randomizzato ogni partita)"
        : index === 0 ? "primo a giocare all'inizio partita" : `turno iniziale ${index + 1}°`,
      played,
      wins,
      winRate: wins / played,
      ratio,
      performancePct: ratio * 100,
      deviationPct: (ratio - 1) * 100
    });
  }
  rows.sort((a, b) => b.deviationPct - a.deviationPct);
  const deviations = rows.map(row => row.deviationPct);
  const spread = deviations.length ? Math.max(...deviations) - Math.min(...deviations) : 0;
  let verdict = "Nessun bias di posizione evidente nel campione.";
  if (rows.length >= 2) {
    const best = rows[0];
    const worst = rows[rows.length - 1];
    if (spread >= 12) {
      verdict = `Bias posizione marcato: ${best.label} ${formatDeviationPct(best.ratio)} vs ${worst.label} ${formatDeviationPct(worst.ratio)} (spread ${spread.toFixed(1)} punti).`;
    } else if (spread >= 6) {
      verdict = `Bias posizione moderato (spread ${spread.toFixed(1)} punti): meglio ${best.label}, peggio ${worst.label}.`;
    } else if (Math.abs(best.deviationPct) >= 4 || Math.abs(worst.deviationPct) >= 4) {
      verdict = `Leggero scostamento posizione (spread ${spread.toFixed(1)} punti); G1 non necessariamente dominante.`;
    }
  }
  return { rows, spread, skipped: false, verdict };
}

function analyzeStrategies(stats, ctx) {
  if (!ctx.strategyBiasReliable) {
    return {
      rows: [],
      spread: 0,
      skipped: true,
      verdict: ctx.durissima
        ? "Confronto strategie per «vittoria» non ha senso in Durissima Mater con molti stalli."
        : "Confronto strategie non affidabile finché prevalgono gli stalli."
    };
  }
  const rows = [];
  for (const key of STRATEGY_KEYS) {
    const played = stats.playedByStrategy[key] || 0;
    if (!played) continue;
    const points = stats.pointsByStrategy[key] || 0;
    const wins = stats.winsByStrategy[key] || 0;
    const ratio = performanceRatio(points, played);
    rows.push({
      key,
      label: strategyShortLabel(key),
      played,
      wins,
      ratio,
      performancePct: ratio * 100,
      deviationPct: (ratio - 1) * 100
    });
  }
  rows.sort((a, b) => b.deviationPct - a.deviationPct);
  const spread = rows.length >= 2
    ? rows[0].deviationPct - rows[rows.length - 1].deviationPct
    : 0;
  let verdict = "Strategie nel campione omogenee o dati insufficienti.";
  if (rows.length >= 2 && spread >= 10) {
    verdict = `Strategia più forte: ${rows[0].label} (${formatDeviationPct(rows[0].ratio)}); più debole: ${rows[rows.length - 1].label} (${formatDeviationPct(rows[rows.length - 1].ratio)}).`;
  } else if (rows.length >= 2 && spread >= 5) {
    verdict = `Differenza moderata tra strategie (spread ${spread.toFixed(1)} punti).`;
  }
  return { rows, spread, skipped: false, verdict };
}

function analyzeScenarioCompletions(cells) {
  const rows = [];
  for (const [id, stats] of cells.entries()) {
    if (!stats.done) continue;
    const successes = stats.done - stats.stalls;
    rows.push({
      id,
      done: stats.done,
      successes,
      successPct: successes / stats.done * 100,
      stallPct: stats.stalls / stats.done * 100,
      avgTurns: stats.turnSum / stats.done
    });
  }
  rows.sort((a, b) => a.successPct - b.successPct);
  return rows;
}

function analyzeScenarios(cells, config, ctx) {
  if (!ctx.competitiveBiasReliable) return [];
  const scenarios = [];
  for (const [id, stats] of cells.entries()) {
    if (!stats.done) continue;
    const positions = analyzePlayerPositions(stats, config, ctx);
    if (positions.skipped || positions.rows.length < 2) continue;
    const best = positions.rows[0];
    const worst = positions.rows[positions.rows.length - 1];
    scenarios.push({
      id,
      done: stats.done,
      spread: positions.spread,
      best,
      worst,
      stallsPct: stats.stalls / stats.done * 100
    });
  }
  scenarios.sort((a, b) => b.spread - a.spread);
  return scenarios.slice(0, 5);
}

function buildAnalysisReport(grandTotal, config, cells) {
  const sample = sampleStrength(grandTotal.done);
  const context = buildAnalysisContext(config, grandTotal);
  const positions = analyzePlayerPositions(grandTotal, config, context);
  const strategies = analyzeStrategies(grandTotal, context);
  const scenarios = analyzeScenarios(cells, config, context);
  const scenarioCompletions = analyzeScenarioCompletions(cells);
  const avgTurns = grandTotal.done ? grandTotal.turnSum / grandTotal.done : 0;

  const seatStrategy = buildSeatStrategyBreakdown(grandTotal, config);

  return {
    sample,
    context,
    positions,
    strategies,
    seatStrategy,
    scenarios,
    scenarioCompletions,
    summary: {
      simulations: grandTotal.done,
      successPct: context.successPct,
      stallPct: context.stallPct,
      avgTurns,
      goalLabel: context.durissima ? "Completamento matrice" : "Partite con vincitore",
      scenarioOutcome: scenarioOutcomeLabels(context.durissima),
      options: {
        invertTurnOrderOnClose: config.invertTurnOrderOnClose,
        drawAtTurnStart: config.drawAtTurnStart,
        durissimaMater: config.durissimaMater,
        randomizeTurnOrder: config.randomizeTurnOrder !== false
      }
    }
  };
}

function formatAnalysisPlainText(snapshot) {
  const { analysis, config, simulationsDone, partial } = snapshot;
  const lines = [
    "Dura Mater — riepilogo analisi simulatore",
    partial ? "(run parziale)" : "",
    `Partite aggregate: ${simulationsDone}`,
    `Parametri: area ${formatAreaLabel(config.lMin)} – ${formatAreaLabel(config.lMax)}, giocatori ${config.gMin}–${config.gMax}, ${config.count} sim/caso`,
    `Opzioni: ordine DM ${config.invertTurnOrderOnClose ? "on" : "off"}, pesca inizio turno ${config.drawAtTurnStart ? "on" : "off"}, Durissima Mater ${config.durissimaMater ? "on" : "off"}, ordine iniziale ${config.randomizeTurnOrder !== false ? "casuale" : "fisso G1"}`,
    "",
    analysis.sample.text,
    ...analysis.context.warnings.map(note => `⚠ ${note}`),
    "",
    analysis.summary.options.durissimaMater
      ? "Modalità: Durissima Mater (matrice piena)."
      : "Modalità: competitiva (vince chi finisce le carte).",
    `${analysis.summary.goalLabel}: ${analysis.summary.successPct.toFixed(1)}% · Stallo: ${analysis.summary.stallPct.toFixed(1)}%`,
    `Turni medi: ${analysis.summary.avgTurns.toFixed(1)}`
  ];
  if (analysis.scenarioCompletions.length) {
    const outcome = analysis.summary.scenarioOutcome;
    lines.push("", outcome.exportHeading);
    for (const row of analysis.scenarioCompletions.slice(0, 12)) {
      lines.push(
        `- ${row.id}: ${outcome.rowVerb} ${row.successPct.toFixed(1)}% (${row.successes}/${row.done}), stallo ${row.stallPct.toFixed(1)}%, turni medi ${row.avgTurns.toFixed(1)}`
      );
    }
  }
  if (!analysis.positions.skipped && analysis.positions.rows.length) {
    lines.push(
      "",
      analysis.context.randomizeTurnOrder
        ? "Posto al tavolo G1…Gn (ordine iniziale casuale ogni partita; 100% = atteso):"
        : "Posizione (G1 = sempre primo; 100% = atteso in modalità competitiva):",
      ...analysis.positions.rows.map(row =>
        `- ${row.label}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)} vs atteso), ${row.wins}/${row.played} vittorie, ${row.role}`
      ),
      analysis.positions.verdict
    );
  } else {
    lines.push("", "Posizione:", analysis.positions.verdict);
  }
  if (!analysis.strategies.skipped && analysis.strategies.rows.length) {
    lines.push(
      "",
      "Strategie:",
      ...analysis.strategies.rows.map(row =>
        `- ${row.label}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)}), ${row.wins}/${row.played}`
      ),
      analysis.strategies.verdict
    );
  } else {
    lines.push("", "Strategie:", analysis.strategies.verdict);
  }
  if (analysis.scenarios.length) {
    lines.push("", "Scenari con maggior spread posizione (solo modalità competitiva):");
    for (const scenario of analysis.scenarios) {
      lines.push(
        `- ${scenario.id}: spread ${scenario.spread.toFixed(1)} pt (${scenario.best.label} ${formatDeviationPct(scenario.best.ratio)} vs ${scenario.worst.label} ${formatDeviationPct(scenario.worst.ratio)}), stallo ${scenario.stallsPct.toFixed(1)}%`
      );
    }
  }
  if (analysis.seatStrategy?.rows?.length) {
    lines.push("", "Accoppiamento posto + strategia (ogni partita):", analysis.seatStrategy.interpretation);
    for (const row of analysis.seatStrategy.rows) {
      lines.push(
        `- ${row.seatLabel}+${row.strategyLabel}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)}), ${row.wins}/${row.played}`
      );
    }
  }
  return lines.filter(line => line !== undefined).join("\n");
}

function formatWorkflowStepSummary(step) {
  const a = step.analysis.summary;
  return `${step.stepLabel}: ${a.goalLabel} ${a.successPct.toFixed(1)}%, stallo ${a.stallPct.toFixed(1)}%, ${step.simulationsDone} partite — ${step.analysis.positions.verdict}`;
}

function formatWorkflowPlainText(snapshot) {
  const lines = [
    "Dura Mater — riepilogo workflow simulatore",
    snapshot.partial ? "(run parziale)" : "",
    `Workflow: ${snapshot.workflow.label} (${snapshot.workflow.id})`,
    snapshot.workflow.description,
    `Partite totali: ${snapshot.simulationsDone}/${snapshot.simulationsTarget}`,
    "",
    "Step:"
  ];
  for (const step of snapshot.steps) {
    lines.push(`- ${formatWorkflowStepSummary(step)}`);
  }
  lines.push("", "Dettaglio ultimo step con dati:", "");
  const last = snapshot.steps[snapshot.steps.length - 1];
  if (last) lines.push(formatAnalysisPlainText(last));
  return lines.filter(line => line !== undefined).join("\n");
}

function renderWorkflowAnalysis(snapshot) {
  if (!els.analysisContent) return;
  els.analysisContent.classList.remove("empty");
  els.analysisContent.replaceChildren();

  const meta = document.createElement("p");
  meta.className = "analysis-meta";
  meta.textContent = snapshot.partial
    ? `Workflow in corso: ${snapshot.simulationsDone}/${snapshot.simulationsTarget} partite.`
    : `Workflow «${snapshot.workflow.label}» completato — ${snapshot.simulationsDone} partite. Usa «Esporta JSON» e incolla il file in chat.`;
  els.analysisContent.appendChild(meta);

  if (snapshot.workflow.description) {
    const desc = document.createElement("p");
    desc.className = "analysis-meta";
    desc.textContent = snapshot.workflow.description;
    els.analysisContent.appendChild(desc);
  }

  const stepsBlock = document.createElement("div");
  stepsBlock.className = "analysis-block";
  stepsBlock.innerHTML = "<h3>Step del workflow</h3>";
  stepsBlock.appendChild(renderAnalysisList(snapshot.steps, step => formatWorkflowStepSummary(step)));
  els.analysisContent.appendChild(stepsBlock);

  const last = snapshot.steps[snapshot.steps.length - 1];
  if (last?.analysis?.seatStrategy?.rows?.length) {
    const seatBlock = document.createElement("div");
    seatBlock.className = "analysis-block";
    seatBlock.innerHTML = `<h3>Posto + strategia (${last.stepLabel})</h3><p>${last.analysis.seatStrategy.interpretation}</p>`;
    seatBlock.appendChild(renderAnalysisList(last.analysis.seatStrategy.rows, row =>
      `${row.seatLabel}+${row.strategyLabel}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)}), ${row.wins}/${row.played}`
    ));
    els.analysisContent.appendChild(seatBlock);
  }

  const hint = document.createElement("p");
  hint.className = "analysis-verdict";
  hint.textContent = "Il JSON contiene tutti gli step con matrici, analisi e seatStrategyBreakdown per ogni blocco.";
  els.analysisContent.appendChild(hint);

  lastAnalysisText = formatWorkflowPlainText(snapshot);
  const done = snapshot.simulationsDone > 0;
  if (els.exportResults) els.exportResults.disabled = !done;
  if (els.copyAnalysis) els.copyAnalysis.disabled = !done;
}

function publishRunResults(state, partial = false) {
  if (state.workflow) {
    const done = state.stepStates.reduce((sum, step) => sum + step.grandTotal.done, 0);
    if (done === 0) return;
    lastResults = buildWorkflowSnapshot(state, { partial });
    renderWorkflowAnalysis(lastResults);
    return;
  }
  if (!state || state.grandTotal.done === 0) return;
  lastResults = buildResultsSnapshot(state, { partial });
  renderAnalysis(lastResults);
}

function renderAnalysisList(rows, formatter) {
  const list = document.createElement("ul");
  list.className = "analysis-list";
  for (const row of rows) {
    const item = document.createElement("li");
    const deviation = row.deviationPct;
    item.className = deviation > 3 ? "positive" : deviation < -3 ? "negative" : "neutral";
    item.textContent = formatter(row);
    list.appendChild(item);
  }
  return list;
}

function renderAnalysis(snapshot) {
  if (!els.analysisContent) return;
  const { analysis, partial, simulationsDone, simulationsTarget } = snapshot;
  els.analysisContent.classList.remove("empty");
  els.analysisContent.replaceChildren();

  const meta = document.createElement("p");
  meta.className = "analysis-meta";
  meta.textContent = partial
    ? `Anteprima su ${simulationsDone}/${simulationsTarget} simulazioni (run in corso).`
    : `Basato su ${simulationsDone} simulazioni aggregate. ${analysis.sample.text}`;
  els.analysisContent.appendChild(meta);

  if (analysis.context.warnings.length) {
    const warnBlock = document.createElement("div");
    warnBlock.className = "analysis-block";
    warnBlock.innerHTML = "<h3>Note interpretative</h3>";
    warnBlock.appendChild(renderAnalysisList(analysis.context.warnings, note => note));
    els.analysisContent.appendChild(warnBlock);
  }

  const summaryBlock = document.createElement("div");
  summaryBlock.className = "analysis-block";
  summaryBlock.innerHTML = "<h3>Esito partite</h3>";
  const modeLine = analysis.summary.options.durissimaMater
    ? "Modalità: <strong>Durissima Mater</strong> — obiettivo = riempire tutta la matrice."
    : "Modalità: <strong>competitiva</strong> — obiettivo = esaurire la mano prima degli altri.";
  summaryBlock.insertAdjacentHTML(
    "beforeend",
    `<p>${modeLine}</p>
     <p>${analysis.summary.goalLabel}: <strong>${analysis.summary.successPct.toFixed(1)}%</strong> · Stallo: <strong>${analysis.summary.stallPct.toFixed(1)}%</strong></p>
     <p>Turni medi: <strong>${analysis.summary.avgTurns.toFixed(1)}</strong></p>
     <p>Opzioni run: ordine DM ${analysis.summary.options.invertTurnOrderOnClose ? "sì" : "no"}, pesca inizio turno ${analysis.summary.options.drawAtTurnStart ? "sì" : "no"}, ordine iniziale ${analysis.summary.options.randomizeTurnOrder ? "casuale (come partita reale)" : "fisso G1 primo (solo test)"}.</p>`
  );
  els.analysisContent.appendChild(summaryBlock);

  if (analysis.scenarioCompletions.length) {
    const outcome = analysis.summary.scenarioOutcome;
    const completionBlock = document.createElement("div");
    completionBlock.className = "analysis-block";
    completionBlock.innerHTML = `<h3>${outcome.sectionTitle}</h3><p>${outcome.sectionHint}</p>`;
    completionBlock.appendChild(renderAnalysisList(
      analysis.scenarioCompletions.slice(0, 12),
      row => `${row.id}: ${row.successPct.toFixed(1)}% ${outcome.rowVerb} (${row.successes}/${row.done}), stallo ${row.stallPct.toFixed(1)}%, turni medi ${row.avgTurns.toFixed(1)}`
    ));
    els.analysisContent.appendChild(completionBlock);
  }

  const positionBlock = document.createElement("div");
  positionBlock.className = "analysis-block";
  positionBlock.innerHTML = "<h3>Influenza posizione (G1…Gn)</h3>";
  if (!analysis.positions.skipped && analysis.positions.rows.length) {
    const positionHint = analysis.context.randomizeTurnOrder
      ? "<p>Posto fisico al tavolo; ogni partita sorteggia chi inizia e l'ordine 1→2→… (come in partita reale). Dopo la chiusura DM l'ordine può invertirsi.</p>"
      : "<p>Solo modalità competitiva, con pochi stalli. G1 è sempre il primo a giocare (test); dopo la chiusura DM l'ordine può invertirsi.</p>";
    positionBlock.insertAdjacentHTML("beforeend", positionHint);
    positionBlock.appendChild(renderAnalysisList(analysis.positions.rows, row =>
      `${row.label}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)} vs 100%), ${row.wins} vittorie su ${row.played} — ${row.role}`
    ));
  }
  const positionVerdict = document.createElement("p");
  positionVerdict.className = "analysis-verdict";
  positionVerdict.textContent = analysis.positions.verdict;
  positionBlock.appendChild(positionVerdict);
  els.analysisContent.appendChild(positionBlock);

  const strategyBlock = document.createElement("div");
  strategyBlock.className = "analysis-block";
  strategyBlock.innerHTML = "<h3>Strategie</h3>";
  if (!analysis.strategies.skipped && analysis.strategies.rows.length) {
    strategyBlock.appendChild(renderAnalysisList(analysis.strategies.rows, row =>
      `${row.label}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)} vs 100%), ${row.wins} vittorie su ${row.played} partite con quella strategia`
    ));
  }
  const strategyVerdict = document.createElement("p");
  strategyVerdict.className = "analysis-verdict";
  strategyVerdict.textContent = analysis.strategies.verdict;
  strategyBlock.appendChild(strategyVerdict);
  els.analysisContent.appendChild(strategyBlock);

  if (analysis.seatStrategy?.rows?.length) {
    const seatBlock = document.createElement("div");
    seatBlock.className = "analysis-block";
    seatBlock.innerHTML = "<h3>Posto al tavolo + strategia</h3>";
    seatBlock.insertAdjacentHTML("beforeend", `<p>${analysis.seatStrategy.interpretation}</p>`);
    seatBlock.appendChild(renderAnalysisList(analysis.seatStrategy.rows, row =>
      `${row.seatLabel} con ${row.strategyLabel}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)}), ${row.wins}/${row.played}`
    ));
    els.analysisContent.appendChild(seatBlock);
  }

  if (analysis.scenarios.length) {
    const scenarioBlock = document.createElement("div");
    scenarioBlock.className = "analysis-block";
    scenarioBlock.innerHTML = "<h3>Scenari con più squilibrio posizione</h3><p>Solo in modalità competitiva.</p>";
    scenarioBlock.appendChild(renderAnalysisList(analysis.scenarios, row =>
      `${row.id} (${row.done} partite): spread ${row.spread.toFixed(1)} pt — ${row.best.label} ${formatDeviationPct(row.best.ratio)} vs ${row.worst.label} ${formatDeviationPct(row.worst.ratio)}`
    ));
    els.analysisContent.appendChild(scenarioBlock);
  }

  lastAnalysisText = formatAnalysisPlainText(snapshot);
  if (els.exportResults) els.exportResults.disabled = simulationsDone === 0;
  if (els.copyAnalysis) els.copyAnalysis.disabled = simulationsDone === 0;
}

function clearAnalysisUi() {
  lastResults = null;
  lastAnalysisText = "";
  if (els.exportResults) els.exportResults.disabled = true;
  if (els.copyAnalysis) els.copyAnalysis.disabled = true;
  if (!els.analysisContent) return;
  els.analysisContent.classList.add("empty");
  els.analysisContent.replaceChildren();
  const hint = document.createElement("p");
  hint.textContent = "Esegui una simulazione per generare il riepilogo (bias posizione, strategie, stalli).";
  els.analysisContent.appendChild(hint);
}

function scheduleAnalysisUpdate(state) {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => publishRunResults(state, state.done < state.total), 900);
}

function exportResultsJson() {
  if (!lastResults) return;
  const blob = new Blob([JSON.stringify(lastResults, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const wf = lastResults.workflow?.id ? `-${lastResults.workflow.id}` : "";
  const link = document.createElement("a");
  link.href = url;
  link.download = `dura-mater-sim${wf}-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyAnalysisText() {
  if (!lastAnalysisText) return;
  try {
    await navigator.clipboard.writeText(lastAnalysisText);
    setStatus("Riepilogo analisi copiato negli appunti.", "good");
  } catch {
    setStatus("Copia non riuscita: usa Esporta JSON o seleziona il testo manualmente.", "bad");
  }
}

function line(text, className = "") {
  const span = document.createElement("span");
  if (className) span.className = className;
  span.textContent = text;
  return span;
}

function updateProgress(state) {
  const percent = state.total ? state.done / state.total * 100 : 0;
  els.progress.style.width = `${percent}%`;
  els.progressText.textContent = `${state.done}/${state.total} simulazioni.`;
}

function workerSource() {
  return `
    "use strict";
    ${MPCARDS_CORE_SOURCE}
    function emptyStrategyWins() {
      return Object.fromEntries(MPCardsCore.STRATEGY_KEYS.map(key => [key, 0]));
    }

    function emptySeatStrategyPatch() {
      return { played: {}, wins: {}, points: {} };
    }

    function bumpSeat(map, player, strategy, amount) {
      const key = player + ":" + strategy;
      map[key] = (map[key] || 0) + amount;
    }

    function emptyPatch(players) {
      return {
        done: 0,
        winsByPlayer: Array.from({ length: players }, () => 0),
        playedByPlayer: Array.from({ length: players }, () => 0),
        pointsByPlayer: Array.from({ length: players }, () => 0),
        winsByStrategy: emptyStrategyWins(),
        playedByStrategy: emptyStrategyWins(),
        pointsByStrategy: emptyStrategyWins(),
        seatStrategy: emptySeatStrategyPatch(),
        stalls: 0,
        turnMin: null,
        turnMax: null,
        turnSum: 0
      };
    }

    self.onmessage = (event) => {
      const job = event.data;
      const deck = MPCardsCore.parseDeckCodes(job.deckCodes);
      const random = MPCardsCore.mulberry32(MPCardsCore.hashSeed(job.seed));
      let patch = emptyPatch(job.players);
      const flushEvery = Math.max(1, Math.min(50, Math.ceil(job.count / 20)));

      for (let game = 0; game < job.count; game++) {
        const result = MPCardsCore.simulateGame(deck, {
          size: job.size,
          players: job.players,
          strategies: job.strategies,
          random,
          invertTurnOrderOnClose: job.invertTurnOrderOnClose !== false,
          drawAtTurnStart: job.drawAtTurnStart === true,
          durissimaMater: job.durissimaMater === true,
          randomizeTurnOrder: job.randomizeTurnOrder !== false,
          shuffleStrategiesAmongSeats: job.shuffleStrategiesAmongSeats === true
        });
        patch.done++;
        for (let player = 0; player < job.players; player++) patch.playedByPlayer[player]++;
        for (let player = 0; player < job.players; player++) {
          const strat = result.strategies[player];
          patch.playedByStrategy[strat]++;
          bumpSeat(patch.seatStrategy.played, player, strat, 1);
        }
        patch.turnSum += result.turns;
        patch.turnMin = patch.turnMin === null ? result.turns : Math.min(patch.turnMin, result.turns);
        patch.turnMax = patch.turnMax === null ? result.turns : Math.max(patch.turnMax, result.turns);
        if (result.status === "success") {
          if (result.winner === null) {
            for (let player = 0; player < job.players; player++) {
              const strat = result.strategies[player];
              patch.winsByPlayer[player]++;
              patch.pointsByPlayer[player] += job.players;
              patch.winsByStrategy[strat]++;
              patch.pointsByStrategy[strat] += job.players;
              bumpSeat(patch.seatStrategy.wins, player, strat, 1);
              bumpSeat(patch.seatStrategy.points, player, strat, job.players);
            }
          } else {
            const strat = result.strategies[result.winner];
            patch.winsByPlayer[result.winner]++;
            patch.pointsByPlayer[result.winner] += job.players;
            patch.winsByStrategy[strat]++;
            patch.pointsByStrategy[strat] += job.players;
            bumpSeat(patch.seatStrategy.wins, result.winner, strat, 1);
            bumpSeat(patch.seatStrategy.points, result.winner, strat, job.players);
          }
        } else {
          patch.stalls++;
        }

        if (patch.done >= flushEvery) {
          self.postMessage({ type: "progress", id: job.id, patch });
          patch = emptyPatch(job.players);
        }
      }

      if (patch.done > 0) self.postMessage({ type: "progress", id: job.id, patch });
      self.postMessage({ type: "complete", id: job.id });
    };
  `;
}

function createWorker() {
  const blob = new Blob([workerSource()], { type: "text/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

function runSimulations() {
  stopSimulations();
  let config;
  try {
    config = readConfig();
  } catch (error) {
    setStatus(error.message, "bad");
    return;
  }
  const jobs = makeJobs(config);
  const state = {
    config,
    jobs,
    queue: jobs.slice(),
    done: 0,
    total: jobs.reduce((sum, job) => sum + job.count, 0),
    completedJobs: 0,
    cells: new Map(),
    rowTotals: new Map(),
    columnTotals: new Map(),
    grandTotal: emptyAggregateStats(),
    workers: [],
    stopped: false
  };
  for (const job of jobs) {
    state.cells.set(job.cellId || job.id, emptyStats(job.players));
    if (!state.rowTotals.has(job.size)) state.rowTotals.set(job.size, emptyAggregateStats());
    if (!state.columnTotals.has(job.players)) state.columnTotals.set(job.players, emptyAggregateStats());
  }
  startSimulationRun(state);
}

function startSimulationRun(state, meta = {}) {
  activeRun = state;
  const config = state.config;
  const jobs = state.jobs;
  resetTables(config, jobs, state);
  clearAnalysisUi();
  updateProgress(state);
  const label = meta.workflowLabel
    ? `Workflow «${meta.workflowLabel}»: ${state.total.toLocaleString("it-IT")} partite in ${state.stepStates?.length || state.workflow?.steps?.length || "?"} step.`
    : `In corso: ${jobs.length} casi validi.`;
  setStatus(label, "");
  els.run.disabled = true;
  if (els.runWorkflow) els.runWorkflow.disabled = true;
  els.stop.disabled = false;

  const workerCount = Math.min(config.workers, jobs.length || 1);
  for (let i = 0; i < workerCount; i++) {
    const worker = createWorker();
    state.workers.push(worker);
    worker.onmessage = (event) => handleWorkerMessage(worker, event.data, state);
    worker.onerror = () => {
      worker.terminate();
      if (!state.stopped) setStatus("Errore in un worker.", "bad");
    };
    dispatchNext(worker, state);
  }
}

function resolveJobContext(state, messageId) {
  if (state.jobById) {
    const job = state.jobById.get(messageId);
    if (!job) return null;
    const step = job.stepId ? state.stepById.get(job.stepId) : state;
    return { job, step, size: job.size, players: job.players, cellId: job.cellId };
  }
  const cellId = messageId;
  const [size, players] = cellId.split("x").map(Number);
  return { job: null, step: state, size, players, cellId };
}

function handleWorkerMessage(worker, message, state) {
  if (state.stopped) return;
  if (message.type === "progress") {
    const ctx = resolveJobContext(state, message.id);
    if (!ctx) return;
    if (ctx.job?.stepId && state.activeStepId !== ctx.job.stepId) {
      switchActiveStepUi(state, ctx.job.stepId);
    }
    const stats = ctx.step.cells.get(ctx.cellId);
    mergeStats(stats, message.patch);
    state.done += message.patch.done;
    ctx.step.done = (ctx.step.done || 0) + message.patch.done;
    mergeStats(ctx.step.rowTotals.get(ctx.size), message.patch);
    mergeStats(ctx.step.columnTotals.get(ctx.players), message.patch);
    mergeStats(ctx.step.grandTotal, message.patch);
    if (ctx.step === state || state.activeStepId === ctx.job?.stepId) {
      updateCell(ctx.size, ctx.players, state);
      updateAggregateCells(ctx.size, ctx.players, state);
    }
    updateProgress(state);
    scheduleAnalysisUpdate(state);
  }
  if (message.type === "complete") {
    state.completedJobs++;
    if (!dispatchNext(worker, state) && state.completedJobs >= state.jobs.length) {
      finishRun(state);
    }
  }
}

function dispatchNext(worker, state) {
  const job = state.queue.shift();
  if (!job) return false;
  worker.postMessage(job);
  return true;
}

function finishRun(state) {
  for (const worker of state.workers) worker.terminate();
  state.workers = [];
  activeRun = null;
  els.run.disabled = false;
  if (els.runWorkflow) els.runWorkflow.disabled = false;
  els.stop.disabled = true;
  publishRunResults(state, false);
  const wf = state.workflow ? ` Workflow «${state.workflow.label}» completato:` : " Completato:";
  setStatus(`${wf} ${state.total} simulazioni. Esporta JSON per l'analisi.`, "good");
}

function stopSimulations() {
  if (!activeRun) return;
  const state = activeRun;
  state.stopped = true;
  for (const worker of state.workers) worker.terminate();
  state.workers = [];
  els.run.disabled = false;
  if (els.runWorkflow) els.runWorkflow.disabled = false;
  els.stop.disabled = true;
  if (state.total && state.done < state.total) {
    setStatus(`Fermato a ${state.done}/${state.total}.`, "bad");
    publishRunResults(state, true);
  } else {
    publishRunResults(state, false);
  }
  activeRun = null;
}

function syncDeckInfo() {
  if (!els.deckInfo) return;
  const variant = els.deckEditPanel && !els.deckEditPanel.hidden;
  els.deckInfo.textContent = variant
    ? "Mazzo: variante personalizzata (64 codici)."
    : "Mazzo: ufficiale stampato (64 codici da mpcards-core.js).";
}

function setDeckEditVisible(visible) {
  if (!els.deckEditPanel) return;
  els.deckEditPanel.hidden = !visible;
  if (els.toggleDeckEdit) {
    els.toggleDeckEdit.textContent = visible ? "Usa mazzo ufficiale" : "Variante mazzo (sperimentale)";
  }
  if (visible && els.deckCodes && !els.deckCodes.value.trim()) {
    els.deckCodes.value = MPCardsCore.deckCodesText();
  }
  syncDeckInfo();
}

loadSavedPrefs();
bindPrefsPersistence();
els.gMin.addEventListener("input", () => {
  renderStrategyInputs();
  scheduleSavePrefs();
});
els.gMax.addEventListener("input", () => {
  renderStrategyInputs();
  scheduleSavePrefs();
});
if (els.toggleDeckEdit) {
  els.toggleDeckEdit.addEventListener("click", () => {
    setDeckEditVisible(els.deckEditPanel.hidden);
    scheduleSavePrefs();
  });
}
if (els.deckReset) {
  els.deckReset.addEventListener("click", () => {
    if (els.deckCodes) els.deckCodes.value = MPCardsCore.deckCodesText();
    syncDeckInfo();
    scheduleSavePrefs();
  });
}
if (els.resetPrefs) {
  els.resetPrefs.addEventListener("click", resetPrefsToDefaults);
}
function populateWorkflowSelect() {
  if (!els.workflowSelect) return;
  const catalog = window.SIMULATOR_WORKFLOWS || {};
  for (const wf of Object.values(catalog)) {
    const option = document.createElement("option");
    option.value = wf.id;
    option.textContent = wf.label;
    option.title = wf.description || "";
    els.workflowSelect.appendChild(option);
  }
}

if (els.applyWorkflow) {
  els.applyWorkflow.addEventListener("click", () => {
    const key = els.workflowSelect?.value;
    if (!key) {
      setStatus("Scegli un workflow.", "bad");
      return;
    }
    applyWorkflowToUi(key);
  });
}
if (els.runWorkflow) {
  els.runWorkflow.addEventListener("click", runSelectedWorkflow);
}
if (els.importWorkflow && els.importWorkflowBtn) {
  els.importWorkflowBtn.addEventListener("click", () => els.importWorkflow.click());
  els.importWorkflow.addEventListener("change", async () => {
    const file = els.importWorkflow.files?.[0];
    els.importWorkflow.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const workflow = validateImportedWorkflow(JSON.parse(text));
      savePrefsNow();
      runWorkflowDefinition(workflow);
    } catch (error) {
      setStatus(error.message || "Import workflow fallito.", "bad");
    }
  });
}
if (els.applyPreset) {
  els.applyPreset.addEventListener("click", () => {
    const key = els.presetSelect?.value;
    if (!key) {
      setStatus("Scegli un preset dal menu.", "bad");
      return;
    }
    applySimulationPreset(key);
  });
}
populateWorkflowSelect();
els.run.addEventListener("click", () => {
  savePrefsNow();
  runSimulations();
});
els.stop.addEventListener("click", stopSimulations);
if (els.exportResults) els.exportResults.addEventListener("click", exportResultsJson);
if (els.copyAnalysis) els.copyAnalysis.addEventListener("click", copyAnalysisText);
clearAnalysisUi();
