"use strict";

const { STRATEGIES, STRATEGY_KEYS, hashSeed, strategyShortLabel, MAX_PLAYERS, isPlayableSetup, computeInitialDeal } = MPCardsCore;

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
  durissimaMater: false,
  fixedTurnOrder: false,
  deckEditOpen: false,
  deckCodes: "",
  strategies: Array.from({ length: MAX_PLAYERS }, () => "auto")
};

const els = {
  count: document.querySelector("#count"),
  lMin: document.querySelector("#l-min"),
  lMax: document.querySelector("#l-max"),
  gMin: document.querySelector("#g-min"),
  gMax: document.querySelector("#g-max"),
  workers: document.querySelector("#workers"),
  seed: document.querySelector("#seed"),
  durissimaMater: document.querySelector("#durissima-mater"),
  fixedTurnOrder: document.querySelector("#fixed-turn-order"),
  deckCodes: document.querySelector("#deck-codes"),
  run: document.querySelector("#run"),
  stop: document.querySelector("#stop"),
  newSimulation: document.querySelector("#new-simulation"),
  newSimulationAnalysis: document.querySelector("#new-simulation-analysis"),
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

function clampConfigForDurissima(config) {
  if (!config.durissimaMater || (config.gMin === 1 && config.gMax === 1)) return config;
  config.gMin = 1;
  config.gMax = 1;
  if (els.gMin) els.gMin.value = 1;
  if (els.gMax) els.gMax.value = 1;
  return config;
}

function readConfig() {
  const lMin = clampNumber(els.lMin.value, 3, 8, 3);
  const lMax = clampNumber(els.lMax.value, 3, 8, 8);
  const gMin = clampNumber(els.gMin.value, 1, MAX_PLAYERS, 1);
  const gMax = clampNumber(els.gMax.value, 1, MAX_PLAYERS, MAX_PLAYERS);
  const config = clampConfigForDurissima({
    count: clampNumber(els.count.value, 1, 100000, 100),
    lMin: Math.min(lMin, lMax),
    lMax: Math.max(lMin, lMax),
    gMin: Math.min(gMin, gMax),
    gMax: Math.max(gMin, gMax),
    workers: clampNumber(els.workers.value, 1, 32, defaultWorkerCount()),
    seed: els.seed.value.trim() || String(Date.now()),
    durissimaMater: Boolean(els.durissimaMater?.checked),
    randomizeTurnOrder: !Boolean(els.fixedTurnOrder?.checked),
    deckCodes: readDeckCodesText(),
    strategies: readStrategies()
  });
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
  const gMin = clampNumber(els.gMin.value, 1, MAX_PLAYERS, 1);
  const gMax = clampNumber(els.gMax.value, 1, MAX_PLAYERS, MAX_PLAYERS);
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
  prefs.gMin = clampNumber(prefs.gMin, 1, MAX_PLAYERS, DEFAULT_PREFS.gMin);
  prefs.gMax = clampNumber(prefs.gMax, 1, MAX_PLAYERS, DEFAULT_PREFS.gMax);
  prefs.lMin = Math.min(prefs.lMin, prefs.lMax);
  prefs.lMax = Math.max(prefs.lMin, prefs.lMax);
  prefs.gMin = Math.min(prefs.gMin, prefs.gMax);
  prefs.gMax = Math.max(prefs.gMin, prefs.gMax);
  const workersFallback = defaultWorkerCount();
  prefs.workers = prefs.workers == null
    ? workersFallback
    : clampNumber(prefs.workers, 1, 32, workersFallback);
  prefs.seed = typeof prefs.seed === "string" ? prefs.seed : DEFAULT_PREFS.seed;
  prefs.durissimaMater = prefs.durissimaMater === true;
  prefs.fixedTurnOrder = prefs.fixedTurnOrder === true || prefs.randomizeTurnOrder === false;
  prefs.deckEditOpen = Boolean(prefs.deckEditOpen);
  prefs.deckCodes = typeof prefs.deckCodes === "string" ? prefs.deckCodes : DEFAULT_PREFS.deckCodes;
  const validStrategy = new Set(STRATEGY_KEYS.concat(["auto"]));
  prefs.strategies = Array.from({ length: MAX_PLAYERS }, (_, index) => {
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
    els.durissimaMater, els.fixedTurnOrder
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
  return Array.from({ length: MAX_PLAYERS }, (_, index) => selects[index]?.value || "auto");
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
      if (isPlayableSetup(size, players)) jobs++;
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
      if (isPlayableSetup(size, players)) {
        const deal = computeInitialDeal(size, players);
        const cellId = `${size}x${players}`;
        jobs.push({
          id: stepId ? `${stepId}::${cellId}` : cellId,
          cellId,
          stepId: stepId || null,
          size,
          players,
          initialHandSize: deal.cardsPerPlayer,
          initialDrawCount: deal.drawCount,
          overcrowdedDeal: deal.overcrowded,
          count: config.count,
          seed: stepId
            ? `${config.seed}:${stepId}:${size}:${players}`
            : `${config.seed}:${size}:${players}`,
          deckCodes: config.deckCodes,
          strategies: config.strategies.slice(0, players),
          durissimaMater: config.durissimaMater,
          durissimaEmergencyDrawBudget: config.durissimaEmergencyDrawBudget,
          durissimaAfterPlayDrawBudget: config.durissimaAfterPlayDrawBudget,
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
  return Array.from({ length: MAX_PLAYERS }, (_, index) => {
    const value = raw?.[index];
    return valid.has(value) ? value : "auto";
  });
}

function stepConfigFromWorkflowStep(step, shared, uiConfig) {
  const lMin = clampNumber(step.lMin, 3, 8, 4);
  const lMax = clampNumber(step.lMax, 3, 8, lMin);
  const gMin = clampNumber(step.gMin, 1, MAX_PLAYERS, 2);
  const gMax = clampNumber(step.gMax, 1, MAX_PLAYERS, gMin);
  const strategies = step.strategies
    ? normalizeStepStrategies(step.strategies)
    : Array.from({ length: MAX_PLAYERS }, () => (step.strategy && STRATEGY_KEYS.includes(step.strategy) ? step.strategy : "auto"));
  if (step.strategy && !step.strategies) {
    for (let i = 0; i < MAX_PLAYERS; i++) strategies[i] = step.strategy;
  }
  const config = {
    count: clampNumber(step.count, 1, 100000, 100),
    lMin: Math.min(lMin, lMax),
    lMax: Math.max(lMin, lMax),
    gMin: Math.min(gMin, gMax),
    gMax: Math.max(gMin, gMax),
    workers: uiConfig.workers,
    seed: uiConfig.seed,
    durissimaMater: step.durissimaMater ?? shared?.durissimaMater ?? false,
    durissimaEmergencyDrawBudget: step.durissimaEmergencyDrawBudget ?? shared?.durissimaEmergencyDrawBudget,
    durissimaAfterPlayDrawBudget: step.durissimaAfterPlayDrawBudget ?? shared?.durissimaAfterPlayDrawBudget,
    randomizeTurnOrder: !(step.fixedTurnOrder ?? shared?.fixedTurnOrder ?? false),
    shuffleStrategiesAmongSeats: step.shuffleStrategiesAmongSeats === true
      || shared?.shuffleStrategiesAmongSeats === true,
    deckCodes: uiConfig.deckCodes,
    strategies
  };
  return config;
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
    stepState.cells.set(job.cellId, emptyStats(job.players, dealMetaForJob(job)));
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

function emptyInitialTurnStats(slotCount = MAX_PLAYERS) {
  return {
    winsByInitialTurnSlot: Array.from({ length: slotCount }, () => 0),
    playedByInitialTurnSlot: Array.from({ length: slotCount }, () => 0),
    pointsByInitialTurnSlot: Array.from({ length: slotCount }, () => 0),
    dmCloserByInitialTurnSlot: Array.from({ length: slotCount }, () => 0),
    starterWins: 0,
    dmClosedCount: 0,
    dmCloserWins: 0
  };
}

function dealMetaForJob(job) {
  const deal = computeInitialDeal(job.size, job.players);
  return {
    cardsPerPlayer: job.initialHandSize ?? deal.cardsPerPlayer,
    drawCount: job.initialDrawCount ?? deal.drawCount,
    overcrowded: job.overcrowdedDeal ?? deal.overcrowded
  };
}

function emptyParticipationStats(players) {
  return {
    totalPlacementsSum: 0,
    minPlacementsPerGameSum: 0,
    gamesWithZeroPlacementPlayer: 0,
    gamesWithOnePlacementPlayer: 0,
    gamesEveryoneAtLeastTwoPlacements: 0,
    zeroPlacementPlayersSum: 0,
    onePlacementPlayersSum: 0,
    placementsByPlayerSum: Array.from({ length: players }, () => 0)
  };
}

function accumulateParticipation(patch, result) {
  patch.totalPlacementsSum += result.totalPlacements || 0;
  patch.minPlacementsPerGameSum += result.minPlacementsPerPlayer || 0;
  if (result.hasPlayerWithZeroPlacements) patch.gamesWithZeroPlacementPlayer++;
  if (result.hasPlayerWithOnePlacement) patch.gamesWithOnePlacementPlayer++;
  if (result.everyonePlacedAtLeastTwo) patch.gamesEveryoneAtLeastTwoPlacements++;
  patch.zeroPlacementPlayersSum += result.playersWithZeroPlacements || 0;
  patch.onePlacementPlayersSum += result.playersWithOnePlacement || 0;
  const byPlayer = result.placementsByPlayer || [];
  for (let player = 0; player < patch.placementsByPlayerSum.length; player++) {
    patch.placementsByPlayerSum[player] += byPlayer[player] || 0;
  }
}

function mergeParticipationStats(target, patch) {
  target.totalPlacementsSum += patch.totalPlacementsSum || 0;
  target.minPlacementsPerGameSum += patch.minPlacementsPerGameSum || 0;
  target.gamesWithZeroPlacementPlayer += patch.gamesWithZeroPlacementPlayer || 0;
  target.gamesWithOnePlacementPlayer += patch.gamesWithOnePlacementPlayer || 0;
  target.gamesEveryoneAtLeastTwoPlacements += patch.gamesEveryoneAtLeastTwoPlacements || 0;
  target.zeroPlacementPlayersSum += patch.zeroPlacementPlayersSum || 0;
  target.onePlacementPlayersSum += patch.onePlacementPlayersSum || 0;
  if (!target.placementsByPlayerSum) {
    target.placementsByPlayerSum = Array.from({ length: target.players }, () => 0);
  }
  const source = patch.placementsByPlayerSum || [];
  for (let player = 0; player < target.placementsByPlayerSum.length; player++) {
    target.placementsByPlayerSum[player] += source[player] || 0;
  }
}

function participationSummary(stats) {
  const done = stats.done || 0;
  const players = stats.players || 1;
  if (!done) {
    return {
      avgCardsPlacedPerPlayer: 0,
      avgMinPlacementsPerGame: 0,
      zeroPlacementPlayerGamePct: 0,
      onePlacementPlayerGamePct: 0,
      everyoneAtLeastTwoPlacementsPct: 0,
      avgZeroPlacementPlayersPerGame: 0,
      avgOnePlacementPlayersPerGame: 0
    };
  }
  return {
    avgCardsPlacedPerPlayer: (stats.totalPlacementsSum || 0) / done / players,
    avgMinPlacementsPerGame: (stats.minPlacementsPerGameSum || 0) / done,
    zeroPlacementPlayerGamePct: (stats.gamesWithZeroPlacementPlayer || 0) / done * 100,
    onePlacementPlayerGamePct: (stats.gamesWithOnePlacementPlayer || 0) / done * 100,
    everyoneAtLeastTwoPlacementsPct: (stats.gamesEveryoneAtLeastTwoPlacements || 0) / done * 100,
    avgZeroPlacementPlayersPerGame: (stats.zeroPlacementPlayersSum || 0) / done,
    avgOnePlacementPlayersPerGame: (stats.onePlacementPlayersSum || 0) / done
  };
}

function emptyStats(players, dealMeta = null) {
  return {
    done: 0,
    players,
    initialHandSize: dealMeta?.cardsPerPlayer ?? null,
    initialDrawCount: dealMeta?.drawCount ?? null,
    overcrowdedDeal: dealMeta?.overcrowded === true,
    winsByPlayer: Array.from({ length: players }, () => 0),
    playedByPlayer: Array.from({ length: players }, () => 0),
    pointsByPlayer: Array.from({ length: players }, () => 0),
    winsByStrategy: emptyStrategyWins(),
    playedByStrategy: emptyStrategyWins(),
    pointsByStrategy: emptyStrategyWins(),
    seatStrategy: emptySeatStrategyMaps(),
    ...emptyInitialTurnStats(),
    stalls: 0,
    turnMin: null,
    turnMax: null,
    turnSum: 0,
    gamesWithFourCardTurn: 0,
    fourCardTurns: 0,
    gamesWithFiveCardTurn: 0,
    fiveCardTurns: 0,
    ideaOffers: 0,
    gamesAllPlayersPlaced: 0,
    playersPlacedSum: 0,
    gamesLastPlayerPlaced: 0,
    gamesLastThreeAllPlaced: 0,
    ...emptyParticipationStats(players)
  };
}

function emptyAggregateStats() {
  return emptyStats(MAX_PLAYERS);
}

function mergeStats(target, patch) {
  target.done += patch.done;
  target.stalls += patch.stalls;
  target.turnSum += patch.turnSum;
  target.turnMin = target.turnMin === null ? patch.turnMin : Math.min(target.turnMin, patch.turnMin);
  target.turnMax = target.turnMax === null ? patch.turnMax : Math.max(target.turnMax, patch.turnMax);
  target.gamesWithFourCardTurn += patch.gamesWithFourCardTurn || 0;
  target.fourCardTurns += patch.fourCardTurns || 0;
  target.gamesWithFiveCardTurn += patch.gamesWithFiveCardTurn || 0;
  target.fiveCardTurns += patch.fiveCardTurns || 0;
  target.ideaOffers += patch.ideaOffers || 0;
  target.gamesAllPlayersPlaced += patch.gamesAllPlayersPlaced || 0;
  target.playersPlacedSum += patch.playersPlacedSum || 0;
  target.gamesLastPlayerPlaced += patch.gamesLastPlayerPlaced || 0;
  target.gamesLastThreeAllPlaced += patch.gamesLastThreeAllPlaced || 0;
  mergeParticipationStats(target, patch);
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
  if (patch.winsByInitialTurnSlot) {
    if (!target.winsByInitialTurnSlot) Object.assign(target, emptyInitialTurnStats(MAX_PLAYERS));
    patch.winsByInitialTurnSlot.forEach((count, index) => {
      target.winsByInitialTurnSlot[index] += count;
    });
    patch.playedByInitialTurnSlot.forEach((count, index) => {
      target.playedByInitialTurnSlot[index] += count;
    });
    patch.pointsByInitialTurnSlot.forEach((count, index) => {
      target.pointsByInitialTurnSlot[index] += count;
    });
    target.starterWins += patch.starterWins || 0;
    target.dmClosedCount += patch.dmClosedCount || 0;
    target.dmCloserWins += patch.dmCloserWins || 0;
    if (patch.dmCloserByInitialTurnSlot) {
      patch.dmCloserByInitialTurnSlot.forEach((count, index) => {
        target.dmCloserByInitialTurnSlot[index] += count;
      });
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
      if (!isPlayableSetup(size, players)) {
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
  box.appendChild(line(`≥1 turno da 4: ${pct(stats.gamesWithFourCardTurn || 0, stats.done)}`));
  box.appendChild(line(`Idea (5ª): ${pct(stats.gamesWithFiveCardTurn || 0, stats.done)}`));
  if (stats.ideaOffers > 0) {
    box.appendChild(line(`Idea usate: ${pct(stats.fiveCardTurns || 0, stats.ideaOffers)}`));
  }
  box.appendChild(line(`Tutti posano: ${pct(stats.gamesAllPlayersPlaced || 0, stats.done)}`));
  const avgPlaced = stats.done ? (stats.playersPlacedSum || 0) / stats.done : 0;
  box.appendChild(line(`Media posano: ${avgPlaced.toFixed(1)}/${stats.players}`));
  box.appendChild(line(`Ultimo posa: ${pct(stats.gamesLastPlayerPlaced || 0, stats.done)}`));
  const part = participationSummary(stats);
  box.appendChild(line(`Carte posate/gioc (media): ${part.avgCardsPlacedPerPlayer.toFixed(2)}`));
  box.appendChild(line(`Min posate in partita (media): ${part.avgMinPlacementsPerGame.toFixed(2)}`));
  box.appendChild(line(`Partita con escluso (0 pose): ${part.zeroPlacementPlayerGamePct.toFixed(1)}%`));
  box.appendChild(line(`Partita con «1 sola posa»: ${part.onePlacementPlayerGamePct.toFixed(1)}%`));
  box.appendChild(line(`Tutti ≥2 pose: ${part.everyoneAtLeastTwoPlacementsPct.toFixed(1)}%`));
  if (stats.overcrowdedDeal && stats.initialHandSize != null) {
    box.appendChild(line(`Mano iniziale: ${stats.initialHandSize} · pesca: ${stats.initialDrawCount ?? 0}`));
  }
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
    winsByInitialTurnSlot: (stats.winsByInitialTurnSlot || []).slice(),
    playedByInitialTurnSlot: (stats.playedByInitialTurnSlot || []).slice(),
    pointsByInitialTurnSlot: (stats.pointsByInitialTurnSlot || []).slice(),
    starterWins: stats.starterWins || 0,
    dmCloserByInitialTurnSlot: (stats.dmCloserByInitialTurnSlot || []).slice(),
    dmClosedCount: stats.dmClosedCount || 0,
    dmCloserWins: stats.dmCloserWins || 0,
    stalls: stats.stalls,
    turnMin: stats.turnMin,
    turnMax: stats.turnMax,
    turnSum: stats.turnSum,
    gamesWithFourCardTurn: stats.gamesWithFourCardTurn || 0,
    fourCardTurns: stats.fourCardTurns || 0,
    gamesWithFiveCardTurn: stats.gamesWithFiveCardTurn || 0,
    fiveCardTurns: stats.fiveCardTurns || 0,
    ideaOffers: stats.ideaOffers || 0,
    gamesAllPlayersPlaced: stats.gamesAllPlayersPlaced || 0,
    playersPlacedSum: stats.playersPlacedSum || 0,
    gamesLastPlayerPlaced: stats.gamesLastPlayerPlaced || 0,
    gamesLastThreeAllPlaced: stats.gamesLastThreeAllPlaced || 0,
    totalPlacementsSum: stats.totalPlacementsSum || 0,
    minPlacementsPerGameSum: stats.minPlacementsPerGameSum || 0,
    gamesWithZeroPlacementPlayer: stats.gamesWithZeroPlacementPlayer || 0,
    gamesWithOnePlacementPlayer: stats.gamesWithOnePlacementPlayer || 0,
    gamesEveryoneAtLeastTwoPlacements: stats.gamesEveryoneAtLeastTwoPlacements || 0,
    zeroPlacementPlayersSum: stats.zeroPlacementPlayersSum || 0,
    onePlacementPlayersSum: stats.onePlacementPlayersSum || 0,
    placementsByPlayerSum: (stats.placementsByPlayerSum || []).slice(),
    initialHandSize: stats.initialHandSize ?? null,
    initialDrawCount: stats.initialDrawCount ?? null,
    overcrowdedDeal: stats.overcrowdedDeal === true
  };
}

function serializeSeatAssignment(config) {
  const maxPlayers = config.gMax || config.strategies?.length || MAX_PLAYERS;
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
  const assigned = (config.strategies || []).slice(0, config.gMax || MAX_PLAYERS);
  const distinctSeats = new Set(assigned.filter((_, i) => i < (config.gMax || MAX_PLAYERS)).map((s, i) => `${i}:${s}`));
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
    matrixGuide: state.workflow.matrixGuide || null,
    inversionGuide: state.workflow.inversionGuide || null,
    turnOrderGuide: state.workflow.turnOrderGuide || null,
    initialTurnGuide: state.workflow.initialTurnGuide || null,
    fourCardGuide: state.workflow.fourCardGuide || null,
    ideaGuide: state.workflow.ideaGuide || null,
    overcrowdGuide: state.workflow.overcrowdGuide || null,
    playabilityGuide: state.workflow.playabilityGuide || null,
    participationGuide: state.workflow.participationGuide || null,
    durissimaGuide: state.workflow.durissimaGuide || null,
    hints: {
      forAnalysis:
        "Passa questo file intero all'assistente: `analysis.summary` (successPct in Durissima, avgCardsPlacedPerPlayer in competitiva, …) e cells[\"LxG\"]. Guide: durissimaGuide, participationGuide, playabilityGuide, overcrowdGuide, …"
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

function formatSignedPct(value) {
  if (value === null || value === undefined) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
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

function initialTurnSlotLabel(slot) {
  const labels = ["1° nel turno", "2° nel turno", "3° nel turno", "4° nel turno", "5° nel turno", "6° nel turno", "7° nel turno", "8° nel turno"];
  return labels[slot] || `${slot + 1}° nel turno`;
}

function analyzeInitialTurnSlots(stats, config, ctx) {
  if (!ctx.competitiveBiasReliable) {
    return {
      rows: [],
      spread: 0,
      skipped: true,
      starterWinPct: null,
      expectedStarterWinPct: null,
      verdict: "Ruolo nel turno iniziale non calcolabile: troppi stalli o poche partite con vincitore."
    };
  }
  const maxSlots = config.gMax || stats.players || MAX_PLAYERS;
  const rows = [];
  for (let slot = 0; slot < maxSlots; slot++) {
    const played = stats.playedByInitialTurnSlot?.[slot] || 0;
    if (!played) continue;
    const wins = stats.winsByInitialTurnSlot?.[slot] || 0;
    const points = stats.pointsByInitialTurnSlot?.[slot] || 0;
    const ratio = performanceRatio(points, played);
    rows.push({
      slot,
      label: initialTurnSlotLabel(slot),
      role: "ordine di gioco all'inizio partita (prima di eventuale inversione DM)",
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
  const spread = deviations.length >= 2 ? Math.max(...deviations) - Math.min(...deviations) : 0;
  const successes = stats.done - stats.stalls;
  const starterWinPct = successes > 0 ? (stats.starterWins || 0) / successes * 100 : null;
  const expectedStarterWinPct = maxSlots > 0 ? 100 / maxSlots : null;
  let verdict = "Nessun bias marcato sul ruolo nel turno iniziale (1°…n°).";
  if (rows.length >= 2) {
    const best = rows[0];
    const worst = rows[rows.length - 1];
    if (spread >= 20) {
      verdict = `Bias turno GRAVE: ${best.label} ${formatDeviationPct(best.ratio)} vs ${worst.label} ${formatDeviationPct(worst.ratio)} (spread ${spread.toFixed(1)} pt).`;
    } else if (spread >= 12) {
      verdict = `Bias turno marcato (spread ${spread.toFixed(1)} pt): meglio ${best.label}, peggio ${worst.label}.`;
    } else if (spread >= 6) {
      verdict = `Bias turno moderato (spread ${spread.toFixed(1)} pt): ${best.label} vs ${worst.label}.`;
    }
  }
  if (starterWinPct !== null && expectedStarterWinPct !== null) {
    const starterDelta = starterWinPct - expectedStarterWinPct;
    if (Math.abs(starterDelta) >= 8) {
      verdict += ` Chi apre il turno vince ${starterWinPct.toFixed(1)}% (atteso ~${expectedStarterWinPct.toFixed(1)}%).`;
    }
  }
  return { rows, spread, skipped: false, starterWinPct, expectedStarterWinPct, verdict };
}

function analyzeDmCloserSlots(stats, config, ctx) {
  const closed = stats.dmClosedCount || 0;
  if (!closed) {
    return {
      rows: [],
      spread: 0,
      skipped: true,
      closerWinPct: null,
      verdict: "Nessuna chiusura Dura Mater nel campione."
    };
  }
  const maxSlots = config.gMax || stats.players || MAX_PLAYERS;
  const expectedPct = maxSlots > 0 ? 100 / maxSlots : 0;
  const rows = [];
  for (let slot = 0; slot < maxSlots; slot++) {
    const count = stats.dmCloserByInitialTurnSlot?.[slot] || 0;
    if (!count) continue;
    const sharePct = count / closed * 100;
    rows.push({
      slot,
      label: initialTurnSlotLabel(slot),
      closings: count,
      sharePct,
      expectedPct,
      deviationPct: sharePct - expectedPct
    });
  }
  rows.sort((a, b) => b.deviationPct - a.deviationPct);
  const deviations = rows.map(row => row.deviationPct);
  const spread = deviations.length >= 2 ? Math.max(...deviations) - Math.min(...deviations) : 0;
  const closerWinPct = closed > 0 && ctx.competitiveBiasReliable
    ? (stats.dmCloserWins || 0) / closed * 100
    : null;
  let verdict = `DM chiusa in ${pct(closed, stats.done)} partite; chi chiude è distribuito senza bias marcato sul ruolo nel turno.`;
  if (rows.length >= 2) {
    const best = rows[0];
    const worst = rows[rows.length - 1];
    if (spread >= 12) {
      verdict = `Bias su chi chiude DM: ${best.label} ${best.sharePct.toFixed(1)}% vs atteso ~${expectedPct.toFixed(1)}% (spread ${spread.toFixed(1)} pt).`;
    } else if (spread >= 6) {
      verdict = `Leggero bias su chi chiude DM (spread ${spread.toFixed(1)} pt): ${best.label} vs ${worst.label}.`;
    }
  }
  if (closerWinPct !== null) {
    verdict += ` Chi chiude vince poi: ${closerWinPct.toFixed(1)}% delle chiusure.`;
  }
  return { rows, spread, skipped: false, closed, closerWinPct, expectedPct, verdict };
}

function analyzeScenarioInitialTurn(cells, config, ctx) {
  if (!ctx.competitiveBiasReliable) return [];
  const scenarios = [];
  for (const [id, stats] of cells.entries()) {
    if (!stats.done) continue;
    const slots = analyzeInitialTurnSlots(stats, config, ctx);
    if (slots.skipped || slots.rows.length < 2) continue;
    const best = slots.rows[0];
    const worst = slots.rows[slots.rows.length - 1];
    scenarios.push({
      id,
      done: stats.done,
      spread: slots.spread,
      best,
      worst,
      stallsPct: stats.stalls / stats.done * 100
    });
  }
  scenarios.sort((a, b) => b.spread - a.spread);
  return scenarios.slice(0, 8);
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
    const part = participationSummary(stats);
    rows.push({
      id,
      done: stats.done,
      successes,
      successPct: successes / stats.done * 100,
      stallPct: stats.stalls / stats.done * 100,
      avgTurns: stats.turnSum / stats.done,
      ...part
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
  const initialTurn = analyzeInitialTurnSlots(grandTotal, config, context);
  const dmCloser = analyzeDmCloserSlots(grandTotal, config, context);
  const strategies = analyzeStrategies(grandTotal, context);
  const scenarios = analyzeScenarios(cells, config, context);
  const scenarioInitialTurn = analyzeScenarioInitialTurn(cells, config, context);
  const scenarioCompletions = analyzeScenarioCompletions(cells);
  const avgTurns = grandTotal.done ? grandTotal.turnSum / grandTotal.done : 0;
  const fourCardGamePct = grandTotal.done
    ? (grandTotal.gamesWithFourCardTurn || 0) / grandTotal.done * 100
    : 0;
  const avgFourCardTurnsPerGame = grandTotal.done
    ? (grandTotal.fourCardTurns || 0) / grandTotal.done
    : 0;
  const fiveCardGamePct = grandTotal.done
    ? (grandTotal.gamesWithFiveCardTurn || 0) / grandTotal.done * 100
    : 0;
  const ideaConversionPct = grandTotal.ideaOffers
    ? (grandTotal.fiveCardTurns || 0) / grandTotal.ideaOffers * 100
    : 0;
  const allPlayersPlacedPct = grandTotal.done
    ? (grandTotal.gamesAllPlayersPlaced || 0) / grandTotal.done * 100
    : 0;
  const avgPlayersPlaced = grandTotal.done
    ? (grandTotal.playersPlacedSum || 0) / grandTotal.done
    : 0;
  const lastPlayerPlacedPct = grandTotal.done
    ? (grandTotal.gamesLastPlayerPlaced || 0) / grandTotal.done * 100
    : 0;
  const lastThreeAllPlacedPct = grandTotal.done
    ? (grandTotal.gamesLastThreeAllPlaced || 0) / grandTotal.done * 100
    : 0;
  const participation = participationSummary(grandTotal);

  const seatStrategy = buildSeatStrategyBreakdown(grandTotal, config);

  return {
    sample,
    context,
    positions,
    initialTurn,
    dmCloser,
    strategies,
    seatStrategy,
    scenarios,
    scenarioInitialTurn,
    scenarioCompletions,
    summary: {
      simulations: grandTotal.done,
      successPct: context.successPct,
      stallPct: context.stallPct,
      avgTurns,
      fourCardGamePct,
      gamesWithFourCardTurn: grandTotal.gamesWithFourCardTurn || 0,
      fourCardTurns: grandTotal.fourCardTurns || 0,
      avgFourCardTurnsPerGame,
      fiveCardGamePct,
      gamesWithFiveCardTurn: grandTotal.gamesWithFiveCardTurn || 0,
      fiveCardTurns: grandTotal.fiveCardTurns || 0,
      ideaOffers: grandTotal.ideaOffers || 0,
      ideaConversionPct,
      allPlayersPlacedPct,
      gamesAllPlayersPlaced: grandTotal.gamesAllPlayersPlaced || 0,
      avgPlayersPlaced,
      lastPlayerPlacedPct,
      gamesLastPlayerPlaced: grandTotal.gamesLastPlayerPlaced || 0,
      lastThreeAllPlacedPct,
      gamesLastThreeAllPlaced: grandTotal.gamesLastThreeAllPlaced || 0,
      ...participation,
      goalLabel: context.durissima ? "Completamento matrice" : "Partite con vincitore",
      scenarioOutcome: scenarioOutcomeLabels(context.durissima),
      options: {
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
    `Opzioni: inversione ai limiti DM, Durissima Mater ${config.durissimaMater ? "on (solo G=1 in sim)" : "off"}, ordine iniziale ${config.randomizeTurnOrder !== false ? "casuale" : "fisso G1"}`,
    "",
    analysis.sample.text,
    ...analysis.context.warnings.map(note => `⚠ ${note}`),
    "",
    analysis.summary.options.durissimaMater
      ? "Modalità: Durissima Mater (matrice piena)."
      : "Modalità: competitiva (vince chi finisce le carte).",
    `${analysis.summary.goalLabel}: ${analysis.summary.successPct.toFixed(1)}% · Stallo: ${analysis.summary.stallPct.toFixed(1)}%`,
    `Turni medi: ${analysis.summary.avgTurns.toFixed(1)}`,
    `Partite con almeno un turno da 4 carte: ${analysis.summary.fourCardGamePct.toFixed(1)}% (${analysis.summary.gamesWithFourCardTurn}/${analysis.summary.simulations})`,
    `Turni da 4 carte (totale): ${analysis.summary.fourCardTurns} (media ${analysis.summary.avgFourCardTurnsPerGame.toFixed(2)} per partita)`,
    `Partite con Idea (5ª carta): ${analysis.summary.fiveCardGamePct.toFixed(1)}% (${analysis.summary.gamesWithFiveCardTurn}/${analysis.summary.simulations})`,
    `Idee offerte: ${analysis.summary.ideaOffers} · realizzate: ${analysis.summary.fiveCardTurns} (conversione ${analysis.summary.ideaConversionPct.toFixed(1)}%)`,
    `Carte posate per giocatore (media): ${analysis.summary.avgCardsPlacedPerPlayer.toFixed(2)}`,
    `Min pose in partita (media): ${analysis.summary.avgMinPlacementsPerGame.toFixed(2)}`,
    `Partite con almeno un escluso (0 pose): ${analysis.summary.zeroPlacementPlayerGamePct.toFixed(1)}%`,
    `Partite con almeno un «1 sola posa»: ${analysis.summary.onePlacementPlayerGamePct.toFixed(1)}%`,
    `Partite con tutti ≥2 pose: ${analysis.summary.everyoneAtLeastTwoPlacementsPct.toFixed(1)}%`
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
  if (!analysis.initialTurn.skipped && analysis.initialTurn.rows.length) {
    lines.push(
      "",
      "Ruolo nel turno iniziale (1° = apre la partita, prima di inversione DM; 100% = atteso):",
      ...analysis.initialTurn.rows.map(row =>
        `- ${row.label}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)}), ${row.wins}/${row.played} vittorie`
      ),
      analysis.initialTurn.verdict
    );
    if (analysis.initialTurn.starterWinPct !== null) {
      lines.push(
        `Chi apre il turno vince: ${analysis.initialTurn.starterWinPct.toFixed(1)}% (atteso ~${analysis.initialTurn.expectedStarterWinPct.toFixed(1)}% con G=${config.gMax})`
      );
    }
  } else {
    lines.push("", "Turno iniziale:", analysis.initialTurn.verdict);
  }
  if (!analysis.dmCloser?.skipped && analysis.dmCloser.rows?.length) {
    lines.push(
      "",
      `Chi chiude Dura Mater (${analysis.dmCloser.closed} chiusure, atteso ~${analysis.dmCloser.expectedPct.toFixed(1)}% per ruolo):`,
      ...analysis.dmCloser.rows.map(row =>
        `- ${row.label}: ${row.sharePct.toFixed(1)}% chiusure (${formatSignedPct(row.deviationPct)} vs atteso)`
      ),
      analysis.dmCloser.verdict
    );
  } else if (analysis.dmCloser?.verdict) {
    lines.push("", "Chiusura DM:", analysis.dmCloser.verdict);
  }
  if (analysis.scenarioInitialTurn?.length) {
    lines.push("", "Scenari con maggior bias turno iniziale (1°…n° nel turno):");
    for (const scenario of analysis.scenarioInitialTurn) {
      lines.push(
        `- ${scenario.id}: spread ${scenario.spread.toFixed(1)} pt (${scenario.best.label} vs ${scenario.worst.label}), stallo ${scenario.stallsPct.toFixed(1)}%`
      );
    }
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
  const turn = step.analysis.initialTurn?.skipped
    ? ""
    : ` · turno: ${step.analysis.initialTurn.verdict}`;
  const fourCard = a.gamesWithFourCardTurn > 0 || a.fourCardTurns > 0
    ? ` · ≥1 turno da 4: ${a.fourCardGamePct.toFixed(1)}%`
    : "";
  const idea = a.ideaOffers > 0 || a.gamesWithFiveCardTurn > 0
    ? ` · Idea: ${a.fiveCardGamePct.toFixed(1)}% (${a.ideaConversionPct.toFixed(0)}% conv.)`
    : "";
  return `${step.stepLabel}: ${a.goalLabel} ${a.successPct.toFixed(1)}%, stallo ${a.stallPct.toFixed(1)}%, ${step.simulationsDone} partite${fourCard}${idea}${turn}`;
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
  if (last && !last.analysis.initialTurn?.skipped && last.analysis.initialTurn.rows?.length) {
    const turnBlock = document.createElement("div");
    turnBlock.className = "analysis-block";
    turnBlock.innerHTML = `<h3>Ruolo nel turno (${last.stepLabel})</h3>`;
    turnBlock.appendChild(renderAnalysisList(last.analysis.initialTurn.rows, row =>
      `${row.label}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)}), ${row.wins}/${row.played}`
    ));
    const turnVerdict = document.createElement("p");
    turnVerdict.className = "analysis-verdict";
    turnVerdict.textContent = last.analysis.initialTurn.verdict;
    turnBlock.appendChild(turnVerdict);
    if (!last.analysis.dmCloser?.skipped && last.analysis.dmCloser.rows?.length) {
      turnBlock.appendChild(renderAnalysisList(last.analysis.dmCloser.rows, row =>
        `Chiude DM — ${row.label}: ${row.sharePct.toFixed(1)}%`
      ));
      const dmLine = document.createElement("p");
      dmLine.textContent = last.analysis.dmCloser.verdict;
      turnBlock.appendChild(dmLine);
    }
    els.analysisContent.appendChild(turnBlock);
  }

  if (snapshot.initialTurnGuide) {
    const guide = document.createElement("div");
    guide.className = "analysis-block";
    guide.innerHTML = "<h3>Come leggere (ruolo nel turno)</h3>";
    const parts = [];
    if (snapshot.initialTurnGuide.question) parts.push(snapshot.initialTurnGuide.question);
    if (snapshot.initialTurnGuide.read) parts.push(snapshot.initialTurnGuide.read);
    if (snapshot.initialTurnGuide.compare) parts.push(snapshot.initialTurnGuide.compare);
    if (snapshot.initialTurnGuide.dmCloser) parts.push(snapshot.initialTurnGuide.dmCloser);
    if (snapshot.initialTurnGuide.fair) parts.push(snapshot.initialTurnGuide.fair);
    guide.appendChild(renderAnalysisList(parts, text => text));
    els.analysisContent.appendChild(guide);
  }

  if (snapshot.fourCardGuide) {
    const guide = document.createElement("div");
    guide.className = "analysis-block";
    guide.innerHTML = "<h3>Come leggere (turni da 4 carte)</h3>";
    const parts = [];
    if (snapshot.fourCardGuide.question) parts.push(snapshot.fourCardGuide.question);
    if (snapshot.fourCardGuide.scope) parts.push(snapshot.fourCardGuide.scope);
    if (snapshot.fourCardGuide.skip) parts.push(snapshot.fourCardGuide.skip);
    if (snapshot.fourCardGuide.read) parts.push(snapshot.fourCardGuide.read);
    if (snapshot.fourCardGuide.aggregate) parts.push(snapshot.fourCardGuide.aggregate);
    if (snapshot.fourCardGuide.compare) parts.push(snapshot.fourCardGuide.compare);
    if (snapshot.fourCardGuide.verdict) parts.push(snapshot.fourCardGuide.verdict);
    if (snapshot.fourCardGuide.extra) parts.push(snapshot.fourCardGuide.extra);
    if (snapshot.fourCardGuide.params) parts.push(snapshot.fourCardGuide.params);
    guide.appendChild(renderAnalysisList(parts, text => text));
    els.analysisContent.appendChild(guide);
  }

  if (snapshot.durissimaGuide) {
    const guide = document.createElement("div");
    guide.className = "analysis-block";
    guide.innerHTML = "<h3>Come leggere (Durissima Mater)</h3>";
    const parts = [];
    if (snapshot.durissimaGuide.question) parts.push(snapshot.durissimaGuide.question);
    if (snapshot.durissimaGuide.scope) parts.push(snapshot.durissimaGuide.scope);
    if (snapshot.durissimaGuide.read) parts.push(snapshot.durissimaGuide.read);
    if (snapshot.durissimaGuide.metrics) parts.push(snapshot.durissimaGuide.metrics);
    if (snapshot.durissimaGuide.verdict) parts.push(snapshot.durissimaGuide.verdict);
    if (snapshot.durissimaGuide.params) parts.push(snapshot.durissimaGuide.params);
    guide.appendChild(renderAnalysisList(parts, text => text));
    els.analysisContent.appendChild(guide);
  }

  if (snapshot.participationGuide) {
    const guide = document.createElement("div");
    guide.className = "analysis-block";
    guide.innerHTML = "<h3>Come leggere (partecipazione)</h3>";
    const parts = [];
    if (snapshot.participationGuide.question) parts.push(snapshot.participationGuide.question);
    if (snapshot.participationGuide.scope) parts.push(snapshot.participationGuide.scope);
    if (snapshot.participationGuide.read) parts.push(snapshot.participationGuide.read);
    if (snapshot.participationGuide.metrics) parts.push(snapshot.participationGuide.metrics);
    if (snapshot.participationGuide.verdict) parts.push(snapshot.participationGuide.verdict);
    if (snapshot.participationGuide.params) parts.push(snapshot.participationGuide.params);
    guide.appendChild(renderAnalysisList(parts, text => text));
    els.analysisContent.appendChild(guide);
  }

  if (snapshot.playabilityGuide) {
    const guide = document.createElement("div");
    guide.className = "analysis-block";
    guide.innerHTML = "<h3>Come leggere (giocabilità)</h3>";
    const parts = [];
    if (snapshot.playabilityGuide.question) parts.push(snapshot.playabilityGuide.question);
    if (snapshot.playabilityGuide.scope) parts.push(snapshot.playabilityGuide.scope);
    if (snapshot.playabilityGuide.read) parts.push(snapshot.playabilityGuide.read);
    if (snapshot.playabilityGuide.metrics) parts.push(snapshot.playabilityGuide.metrics);
    if (snapshot.playabilityGuide.verdict) parts.push(snapshot.playabilityGuide.verdict);
    if (snapshot.playabilityGuide.params) parts.push(snapshot.playabilityGuide.params);
    guide.appendChild(renderAnalysisList(parts, text => text));
    els.analysisContent.appendChild(guide);
  }

  if (snapshot.overcrowdGuide) {
    const guide = document.createElement("div");
    guide.className = "analysis-block";
    guide.innerHTML = "<h3>Come leggere (G &gt; L)</h3>";
    const parts = [];
    if (snapshot.overcrowdGuide.question) parts.push(snapshot.overcrowdGuide.question);
    if (snapshot.overcrowdGuide.scope) parts.push(snapshot.overcrowdGuide.scope);
    if (snapshot.overcrowdGuide.read) parts.push(snapshot.overcrowdGuide.read);
    if (snapshot.overcrowdGuide.metrics) parts.push(snapshot.overcrowdGuide.metrics);
    if (snapshot.overcrowdGuide.verdict) parts.push(snapshot.overcrowdGuide.verdict);
    if (snapshot.overcrowdGuide.params) parts.push(snapshot.overcrowdGuide.params);
    guide.appendChild(renderAnalysisList(parts, text => text));
    els.analysisContent.appendChild(guide);
  }

  if (snapshot.ideaGuide) {
    const guide = document.createElement("div");
    guide.className = "analysis-block";
    guide.innerHTML = "<h3>Come leggere (regola Idea)</h3>";
    const parts = [];
    if (snapshot.ideaGuide.question) parts.push(snapshot.ideaGuide.question);
    if (snapshot.ideaGuide.scope) parts.push(snapshot.ideaGuide.scope);
    if (snapshot.ideaGuide.read) parts.push(snapshot.ideaGuide.read);
    if (snapshot.ideaGuide.metrics) parts.push(snapshot.ideaGuide.metrics);
    if (snapshot.ideaGuide.verdict) parts.push(snapshot.ideaGuide.verdict);
    guide.appendChild(renderAnalysisList(parts, text => text));
    els.analysisContent.appendChild(guide);
  }

  const lastFourCard = snapshot.steps[snapshot.steps.length - 1]?.analysis?.summary;
  if (lastFourCard && (lastFourCard.gamesWithFourCardTurn > 0 || lastFourCard.fourCardTurns > 0)) {
    const block = document.createElement("div");
    block.className = "analysis-block";
    block.innerHTML = `<h3>Turni da 4 carte (${snapshot.steps[snapshot.steps.length - 1].stepLabel})</h3>
      <p>Partite con almeno un turno da 4: <strong>${lastFourCard.fourCardGamePct.toFixed(1)}%</strong> (${lastFourCard.gamesWithFourCardTurn}/${lastFourCard.simulations})</p>
      <p>Turni da 4 nel campione step: <strong>${lastFourCard.fourCardTurns}</strong> (media <strong>${lastFourCard.avgFourCardTurnsPerGame.toFixed(2)}</strong> per partita)</p>`;
    els.analysisContent.appendChild(block);
  }

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
     <p>Partite con almeno un turno da 4 carte: <strong>${analysis.summary.fourCardGamePct.toFixed(1)}%</strong> (${analysis.summary.gamesWithFourCardTurn}/${analysis.summary.simulations})</p>
     <p>Turni da 4 carte nel campione: <strong>${analysis.summary.fourCardTurns}</strong> (media <strong>${analysis.summary.avgFourCardTurnsPerGame.toFixed(2)}</strong> per partita)</p>
     <p>Idea (5ª carta): <strong>${analysis.summary.fiveCardGamePct.toFixed(1)}%</strong> partite (${analysis.summary.gamesWithFiveCardTurn}/${analysis.summary.simulations}) · offerte <strong>${analysis.summary.ideaOffers}</strong> · realizzate <strong>${analysis.summary.fiveCardTurns}</strong> (conv. <strong>${analysis.summary.ideaConversionPct.toFixed(1)}%</strong>)</p>
     <p>Carte posate/giocatore (media): <strong>${analysis.summary.avgCardsPlacedPerPlayer.toFixed(2)}</strong> · min pose in partita (media): <strong>${analysis.summary.avgMinPlacementsPerGame.toFixed(2)}</strong></p>
     <p>Partite con escluso (0 pose): <strong>${analysis.summary.zeroPlacementPlayerGamePct.toFixed(1)}%</strong> · con «1 sola posa»: <strong>${analysis.summary.onePlacementPlayerGamePct.toFixed(1)}%</strong> · tutti ≥2 pose: <strong>${analysis.summary.everyoneAtLeastTwoPlacementsPct.toFixed(1)}%</strong></p>
     <p>Opzioni run: inversione ai limiti DM, ordine iniziale ${analysis.summary.options.randomizeTurnOrder ? "casuale (come partita reale)" : "fisso G1 primo (solo test)"}.</p>`
  );
  els.analysisContent.appendChild(summaryBlock);

  if (analysis.scenarioCompletions.length) {
    const outcome = analysis.summary.scenarioOutcome;
    const completionBlock = document.createElement("div");
    completionBlock.className = "analysis-block";
    completionBlock.innerHTML = `<h3>${outcome.sectionTitle}</h3><p>${outcome.sectionHint}</p>`;
    completionBlock.appendChild(renderAnalysisList(
      analysis.scenarioCompletions.slice(0, 12),
      row => `${row.id}: ${row.successPct.toFixed(1)}% ${outcome.rowVerb} (${row.successes}/${row.done}), stallo ${row.stallPct.toFixed(1)}%, turni ${row.avgTurns.toFixed(1)}, ≥2 pose ${row.everyoneAtLeastTwoPlacementsPct.toFixed(0)}%`
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

  const turnBlock = document.createElement("div");
  turnBlock.className = "analysis-block";
  turnBlock.innerHTML = "<h3>Ruolo nel turno iniziale (1° / 2° / …)</h3>";
  turnBlock.insertAdjacentHTML(
    "beforeend",
    "<p>Indipendente dal posto G1…Gn: misura chi era 1°, 2°, … nel turno <strong>prima</strong> di eventuale inversione DM. Con stessa strategia su tutti i posti, qui si vede se il gioco è strutturalmente equo.</p>"
  );
  if (!analysis.initialTurn.skipped && analysis.initialTurn.rows.length) {
    turnBlock.appendChild(renderAnalysisList(analysis.initialTurn.rows, row =>
      `${row.label}: ${formatRatioPct(row.ratio)} (${formatDeviationPct(row.ratio)}), ${row.wins}/${row.played} vittorie`
    ));
    if (analysis.initialTurn.starterWinPct !== null) {
      const starter = document.createElement("p");
      starter.textContent =
        `Chi apre il turno vince: ${analysis.initialTurn.starterWinPct.toFixed(1)}% (atteso ~${analysis.initialTurn.expectedStarterWinPct.toFixed(1)}%).`;
      turnBlock.appendChild(starter);
    }
  }
  const turnVerdict = document.createElement("p");
  turnVerdict.className = "analysis-verdict";
  turnVerdict.textContent = analysis.initialTurn.verdict;
  turnBlock.appendChild(turnVerdict);
  els.analysisContent.appendChild(turnBlock);

  if (!analysis.dmCloser?.skipped || analysis.dmCloser?.verdict) {
    const dmBlock = document.createElement("div");
    dmBlock.className = "analysis-block";
    dmBlock.innerHTML = "<h3>Chiusura Dura Mater per ruolo nel turno</h3>";
    if (!analysis.dmCloser.skipped && analysis.dmCloser.rows.length) {
      dmBlock.appendChild(renderAnalysisList(analysis.dmCloser.rows, row =>
        `${row.label}: ${row.sharePct.toFixed(1)}% chiusure (${formatSignedPct(row.deviationPct)} vs ~${row.expectedPct.toFixed(1)}%)`
      ));
    }
    const dmVerdict = document.createElement("p");
    dmVerdict.className = "analysis-verdict";
    dmVerdict.textContent = analysis.dmCloser.verdict;
    dmBlock.appendChild(dmVerdict);
    els.analysisContent.appendChild(dmBlock);
  }

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
        turnSum: 0,
        gamesWithFourCardTurn: 0,
        fourCardTurns: 0,
        gamesWithFiveCardTurn: 0,
        fiveCardTurns: 0,
        ideaOffers: 0,
        gamesAllPlayersPlaced: 0,
        playersPlacedSum: 0,
        gamesLastPlayerPlaced: 0,
        gamesLastThreeAllPlaced: 0,
        totalPlacementsSum: 0,
        minPlacementsPerGameSum: 0,
        gamesWithZeroPlacementPlayer: 0,
        gamesWithOnePlacementPlayer: 0,
        gamesEveryoneAtLeastTwoPlacements: 0,
        zeroPlacementPlayersSum: 0,
        onePlacementPlayersSum: 0,
        placementsByPlayerSum: Array.from({ length: players }, () => 0)
      };
    }

    function accumulateParticipation(patch, result) {
      patch.totalPlacementsSum += result.totalPlacements || 0;
      patch.minPlacementsPerGameSum += result.minPlacementsPerPlayer || 0;
      if (result.hasPlayerWithZeroPlacements) patch.gamesWithZeroPlacementPlayer++;
      if (result.hasPlayerWithOnePlacement) patch.gamesWithOnePlacementPlayer++;
      if (result.everyonePlacedAtLeastTwo) patch.gamesEveryoneAtLeastTwoPlacements++;
      patch.zeroPlacementPlayersSum += result.playersWithZeroPlacements || 0;
      patch.onePlacementPlayersSum += result.playersWithOnePlacement || 0;
      const byPlayer = result.placementsByPlayer || [];
      for (let player = 0; player < patch.placementsByPlayerSum.length; player++) {
        patch.placementsByPlayerSum[player] += byPlayer[player] || 0;
      }
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
          durissimaMater: job.durissimaMater === true,
          durissimaEmergencyDrawBudget: job.durissimaEmergencyDrawBudget,
          durissimaAfterPlayDrawBudget: job.durissimaAfterPlayDrawBudget,
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
        if (result.hadFourCardTurn) patch.gamesWithFourCardTurn++;
        patch.fourCardTurns += result.fourCardTurns || 0;
        if (result.hadFiveCardTurn) patch.gamesWithFiveCardTurn++;
        patch.fiveCardTurns += result.fiveCardTurns || 0;
        patch.ideaOffers += result.ideaOffers || 0;
        if (result.allPlayersPlaced) patch.gamesAllPlayersPlaced++;
        patch.playersPlacedSum += result.playersWhoPlaced || 0;
        if (result.lastPlayerPlaced) patch.gamesLastPlayerPlaced++;
        if (result.lastThreeAllPlaced) patch.gamesLastThreeAllPlaced++;
        accumulateParticipation(patch, result);
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
        MPCardsCore.accumulateTurnRoleStats(patch, result, job.players);

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
    state.cells.set(job.cellId || job.id, emptyStats(job.players, dealMetaForJob(job)));
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

function prepareNewSimulation() {
  if (activeRun) stopSimulations();
  savePrefsNow();
  setStatus("Pronto per una nuova simulazione.", "good");
  const paramsSection = document.querySelector("main > section");
  paramsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (els.count) els.count.focus();
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

try {
  loadSavedPrefs();
} catch (error) {
  console.error("loadSavedPrefs:", error);
  applyPrefs(DEFAULT_PREFS);
}
bindPrefsPersistence();
els.gMin.addEventListener("input", () => {
  renderStrategyInputs();
  scheduleSavePrefs();
});
els.gMax.addEventListener("input", () => {
  renderStrategyInputs();
  scheduleSavePrefs();
});
if (els.durissimaMater) {
  els.durissimaMater.addEventListener("change", () => {
    if (els.durissimaMater.checked) {
      clampConfigForDurissima({ gMin: 1, gMax: 1, durissimaMater: true });
      setStatus("Durissima Mater: simulazione limitata a 1 giocatore (collaborativa al tavolo).", "good");
    }
    scheduleSavePrefs();
  });
}
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
try {
  populateWorkflowSelect();
} catch (error) {
  console.error("populateWorkflowSelect:", error);
}
if (els.run) els.run.addEventListener("click", () => {
  savePrefsNow();
  runSimulations();
});
if (els.stop) els.stop.addEventListener("click", stopSimulations);
if (els.newSimulation) els.newSimulation.addEventListener("click", prepareNewSimulation);
if (els.newSimulationAnalysis) els.newSimulationAnalysis.addEventListener("click", prepareNewSimulation);
if (els.exportResults) els.exportResults.addEventListener("click", exportResultsJson);
if (els.copyAnalysis) els.copyAnalysis.addEventListener("click", copyAnalysisText);
clearAnalysisUi();
