"use strict";

const { STRATEGIES, STRATEGY_KEYS, hashSeed, strategyShortLabel } = MPCardsCore;

const els = {
  count: document.querySelector("#count"),
  lMin: document.querySelector("#l-min"),
  lMax: document.querySelector("#l-max"),
  gMin: document.querySelector("#g-min"),
  gMax: document.querySelector("#g-max"),
  workers: document.querySelector("#workers"),
  seed: document.querySelector("#seed"),
  deckCodes: document.querySelector("#deck-codes"),
  run: document.querySelector("#run"),
  stop: document.querySelector("#stop"),
  status: document.querySelector("#status"),
  progress: document.querySelector("#progress"),
  progressText: document.querySelector("#progress-text"),
  playerStrategies: document.querySelector("#player-strategies"),
  playerTable: document.querySelector("#player-table"),
  strategyTable: document.querySelector("#strategy-table"),
  turnTable: document.querySelector("#turn-table"),
  closureTable: document.querySelector("#closure-table"),
  deckEditPanel: document.querySelector("#deck-edit-panel"),
  toggleDeckEdit: document.querySelector("#toggle-deck-edit"),
  deckReset: document.querySelector("#deck-reset"),
  deckInfo: document.querySelector("#deck-info")
};

let activeRun = null;

function emptyStrategyWins() {
  return Object.fromEntries(STRATEGY_KEYS.map(key => [key, 0]));
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

function renderStrategyInputs() {
  const previous = readStrategies();
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

function makeJobs(config) {
  const jobs = [];
  for (let size = config.lMin; size <= config.lMax; size++) {
    for (let players = config.gMin; players <= config.gMax; players++) {
      if (size >= players) {
        jobs.push({
          id: `${size}x${players}`,
          size,
          players,
          count: config.count,
          seed: `${config.seed}:${size}:${players}`,
          deckCodes: config.deckCodes,
          strategies: config.strategies.slice(0, players)
        });
      }
    }
  }
  return jobs;
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
    stalls: 0,
    closures: 0,
    closureWins: 0,
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
  target.closures += patch.closures || 0;
  target.closureWins += patch.closureWins || 0;
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
  renderTableSkeleton(els.closureTable, rows, columns, "closure", state);
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
    th.textContent = `G ${players}`;
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
    th.textContent = `L ${size}`;
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
  for (const type of ["player", "strategy", "turn", "closure"]) {
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
    for (const type of ["player", "strategy", "turn", "closure"]) {
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

  if (type === "closure") {
    box.appendChild(line(`Chiusura: ${pct(stats.closures, stats.done)}`));
    if (stats.closures > 0) {
      box.appendChild(line(`Vince chi chiude: ${pct(stats.closureWins, stats.closures)}`));
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

    function emptyPatch(players) {
      return {
        done: 0,
        winsByPlayer: Array.from({ length: players }, () => 0),
        playedByPlayer: Array.from({ length: players }, () => 0),
        pointsByPlayer: Array.from({ length: players }, () => 0),
        winsByStrategy: emptyStrategyWins(),
        playedByStrategy: emptyStrategyWins(),
        pointsByStrategy: emptyStrategyWins(),
        stalls: 0,
        closures: 0,
        closureWins: 0,
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
          random
        });
        patch.done++;
        for (let player = 0; player < job.players; player++) patch.playedByPlayer[player]++;
        for (let player = 0; player < job.players; player++) {
          patch.playedByStrategy[result.strategies[player]]++;
        }
        patch.turnSum += result.turns;
        patch.turnMin = patch.turnMin === null ? result.turns : Math.min(patch.turnMin, result.turns);
        patch.turnMax = patch.turnMax === null ? result.turns : Math.max(patch.turnMax, result.turns);
        if (result.duraMaterClosed) {
          patch.closures++;
          if (result.status === "success" && result.winner === result.closedByPlayer) {
            patch.closureWins++;
          }
        }
        if (result.status === "success") {
          patch.winsByPlayer[result.winner]++;
          patch.pointsByPlayer[result.winner] += job.players;
          patch.winsByStrategy[result.strategies[result.winner]]++;
          patch.pointsByStrategy[result.strategies[result.winner]] += job.players;
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
    state.cells.set(job.id, emptyStats(job.players));
    if (!state.rowTotals.has(job.size)) state.rowTotals.set(job.size, emptyAggregateStats());
    if (!state.columnTotals.has(job.players)) state.columnTotals.set(job.players, emptyAggregateStats());
  }
  activeRun = state;
  resetTables(config, jobs, state);
  updateProgress(state);
  setStatus(`In corso: ${jobs.length} casi validi.`, "");
  els.run.disabled = true;
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

function handleWorkerMessage(worker, message, state) {
  if (state.stopped) return;
  if (message.type === "progress") {
    const stats = state.cells.get(message.id);
    mergeStats(stats, message.patch);
    state.done += message.patch.done;
    const [size, players] = message.id.split("x").map(Number);
    mergeStats(state.rowTotals.get(size), message.patch);
    mergeStats(state.columnTotals.get(players), message.patch);
    mergeStats(state.grandTotal, message.patch);
    updateCell(size, players, state);
    updateAggregateCells(size, players, state);
    updateProgress(state);
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
  els.stop.disabled = true;
  setStatus(`Completato: ${state.total} simulazioni.`, "good");
}

function stopSimulations() {
  if (!activeRun) return;
  activeRun.stopped = true;
  for (const worker of activeRun.workers) worker.terminate();
  activeRun.workers = [];
  els.run.disabled = false;
  els.stop.disabled = true;
  if (activeRun.total && activeRun.done < activeRun.total) {
    setStatus(`Fermato a ${activeRun.done}/${activeRun.total}.`, "bad");
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
  if (visible && els.deckCodes) {
    els.deckCodes.value = MPCardsCore.deckCodesText();
  }
  syncDeckInfo();
}

els.workers.value = defaultWorkerCount();
if (els.deckCodes) els.deckCodes.value = MPCardsCore.deckCodesText();
setDeckEditVisible(false);
renderStrategyInputs();
els.gMin.addEventListener("input", renderStrategyInputs);
els.gMax.addEventListener("input", renderStrategyInputs);
if (els.toggleDeckEdit) {
  els.toggleDeckEdit.addEventListener("click", () => {
    setDeckEditVisible(els.deckEditPanel.hidden);
  });
}
if (els.deckReset) {
  els.deckReset.addEventListener("click", () => {
    if (els.deckCodes) els.deckCodes.value = MPCardsCore.deckCodesText();
    syncDeckInfo();
  });
}
els.run.addEventListener("click", runSimulations);
els.stop.addEventListener("click", stopSimulations);
