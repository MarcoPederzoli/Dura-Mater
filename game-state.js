"use strict";

(function () {
  "use strict";

  const SCHEMA = "mpcards.game.v1";

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createRandom(seedText, savedState) {
    let a = savedState === undefined || savedState === null
      ? globalThis.MPCardsCore.hashSeed(seedText)
      : savedState >>> 0;
    function random() {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    random.getState = () => a >>> 0;
    random.setState = value => {
      a = value >>> 0;
    };
    return random;
  }

  function randomState(random) {
    return random && typeof random.getState === "function" ? random.getState() : null;
  }

  function makeEntry(label, state, random) {
    return {
      label,
      state: cloneData(state),
      randomState: randomState(random)
    };
  }

  function createSession(config, state, random) {
    return {
      schema: SCHEMA,
      version: 1,
      config: cloneData(config),
      timeline: {
        entries: [makeEntry("Inizio partita", state, random)],
        cursor: 0
      }
    };
  }

  function currentEntry(session) {
    if (!session || !session.timeline) return null;
    return session.timeline.entries[session.timeline.cursor] || null;
  }

  function currentState(session) {
    const entry = currentEntry(session);
    return entry ? entry.state : null;
  }

  function setCurrentState(session, state, random) {
    const entry = currentEntry(session);
    if (!entry) return;
    entry.state = cloneData(state);
    entry.randomState = randomState(random);
  }

  function restoreRandom(session, random) {
    const entry = currentEntry(session);
    if (!entry || !random || typeof random.setState !== "function" || entry.randomState === null) return;
    random.setState(entry.randomState);
  }

  function commit(session, label, random, reducer) {
    if (!session || !session.timeline) return null;
    const base = cloneData(currentState(session));
    const result = reducer(base);
    const entryLabel = typeof result === "string" && result ? result : label;
    const entries = session.timeline.entries.slice(0, session.timeline.cursor + 1);
    entries.push(makeEntry(entryLabel, base, random));
    session.timeline.entries = entries;
    session.timeline.cursor = entries.length - 1;
    return currentState(session);
  }

  function canUndo(session) {
    return !!session && !!session.timeline && session.timeline.cursor > 0;
  }

  function canRedo(session) {
    return !!session && !!session.timeline && session.timeline.cursor < session.timeline.entries.length - 1;
  }

  function undo(session, random) {
    if (!canUndo(session)) return false;
    session.timeline.cursor--;
    restoreRandom(session, random);
    return true;
  }

  function redo(session, random) {
    if (!canRedo(session)) return false;
    session.timeline.cursor++;
    restoreRandom(session, random);
    return true;
  }

  function updateConfig(session, patch) {
    if (!session) return;
    session.config = Object.assign({}, session.config || {}, cloneData(patch || {}));
  }

  function labels(session) {
    if (!session || !session.timeline) return [];
    return session.timeline.entries
      .slice(0, session.timeline.cursor + 1)
      .map(entry => entry.label);
  }

  function exportSession(session) {
    const payload = cloneData(session);
    payload.schema = SCHEMA;
    payload.version = 1;
    return payload;
  }

  function importSession(payload) {
    const session = typeof payload === "string" ? JSON.parse(payload) : cloneData(payload);
    if (!session || session.schema !== SCHEMA) {
      throw new Error("File partita non riconosciuto.");
    }
    if (!session.timeline || !Array.isArray(session.timeline.entries) || session.timeline.entries.length === 0) {
      throw new Error("Timeline partita non valida.");
    }
    const cursor = Number(session.timeline.cursor);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor >= session.timeline.entries.length) {
      throw new Error("Posizione timeline non valida.");
    }
    for (const entry of session.timeline.entries) {
      if (!entry || !entry.state || typeof entry.label !== "string") {
        throw new Error("Voce timeline non valida.");
      }
      if (entry.randomState !== null && entry.randomState !== undefined) {
        entry.randomState = entry.randomState >>> 0;
      } else {
        entry.randomState = null;
      }
    }
    return session;
  }

  globalThis.MPCardsGameState = {
    SCHEMA,
    createRandom,
    createSession,
    currentEntry,
    currentState,
    setCurrentState,
    restoreRandom,
    commit,
    canUndo,
    canRedo,
    undo,
    redo,
    updateConfig,
    labels,
    exportSession,
    importSession
  };
})();
