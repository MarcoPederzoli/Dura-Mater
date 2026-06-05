"use strict";

(function () {
  const STORAGE_KEY = "mpcards.savedDecks.v1";
  const KNOWN_DECKS = [
    {
      name: "finale",
      text: `118, 227, 238, 247, 328, 336, 348, 356, 367, 428, 437, 445, 456, 467, 478, 486,
538, 548, 554, 564, 575, 577, 588, 586, 587, 637, 646, 655, 666, 663, 675, 678,
674, 688, 687, 684, 747, 757, 758, 768, 766, 765, 776, 772, 773, 782, 784, 785,
783, 846, 858, 857, 856, 868, 865, 864, 875, 874, 873, 877, 883, 885, 882, 881`
    }
  ];

  function normalizeDeckText(text) {
    return String(text || "")
      .split(/[\s,;]+/)
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => item.padStart(3, "0"))
      .join(",");
  }

  function formatDeckText(text) {
    const normalized = normalizeDeckText(text);
    if (!normalized) return "";
    return normalized.split(",").join(", ");
  }

  function knownDecks() {
    return KNOWN_DECKS.map(deck => ({
      name: deck.name,
      text: formatDeckText(deck.text),
      normalized: normalizeDeckText(deck.text),
      builtin: true
    }));
  }

  function readSavedDecks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return Object.fromEntries(
        Object.entries(parsed)
          .filter(([name, text]) => name && typeof text === "string")
          .map(([name, text]) => [name, formatDeckText(text)])
      );
    } catch (error) {
      return {};
    }
  }

  function writeSavedDecks(savedDecks) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedDecks));
      return true;
    } catch (error) {
      return false;
    }
  }

  function deckList() {
    const saved = readSavedDecks();
    const builtins = knownDecks();
    const savedItems = Object.entries(saved)
      .sort(([a], [b]) => a.localeCompare(b, "it"))
      .map(([name, text]) => ({
        name,
        text,
        normalized: normalizeDeckText(text),
        builtin: false
      }));
    return builtins.concat(savedItems);
  }

  function findDeckByText(text) {
    const normalized = normalizeDeckText(text);
    if (!normalized) return null;
    return deckList().find(deck => deck.normalized === normalized) || null;
  }

  function icon(name) {
    const icons = {
      folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path><path d="M3 7v11"></path></svg>',
      save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5Z"></path><path d="M8 3v6h8"></path><path d="M8 21v-7h8v7"></path></svg>',
      refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"></path><path d="M4 18v-5h5"></path><path d="M18.5 9A7 7 0 0 0 6.8 6.8L4 9.5"></path><path d="M5.5 15A7 7 0 0 0 17.2 17.2L20 14.5"></path></svg>',
      trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
    };
    return icons[name] || "";
  }

  function injectStyles() {
    if (document.querySelector("#mpcards-deck-manager-style")) return;
    const style = document.createElement("style");
    style.id = "mpcards-deck-manager-style";
    style.textContent = `
      .deck-manager {
        display: flex;
        flex: 1 1 100%;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 34px;
        margin-bottom: 6px;
        padding: 4px 6px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #f7f2ea;
      }

      .deck-manager-current {
        min-width: 0;
        overflow: hidden;
        color: var(--muted);
        font-size: 13px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .deck-manager-current strong {
        color: var(--ink);
      }

      .deck-manager-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 0 0 auto;
      }

      .deck-manager-icon {
        width: 30px;
        height: 30px;
        min-height: 30px;
        padding: 0;
        border-radius: 6px;
        display: inline-grid;
        place-items: center;
      }

      .deck-manager [hidden] {
        display: none !important;
      }

      .deck-manager-icon svg {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 2;
      }

      .deck-manager-dialog {
        width: min(420px, calc(100vw - 32px));
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 0;
        background: var(--panel);
        color: var(--ink);
        box-shadow: 0 18px 50px rgba(25, 28, 33, 0.22);
      }

      .deck-manager-dialog::backdrop {
        background: rgba(25, 28, 33, 0.35);
      }

      .deck-manager-dialog-head {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .deck-manager-dialog-head h3 {
        margin: 0;
        font-size: 15px;
      }

      .deck-manager-dialog-body {
        padding: 14px;
        display: grid;
        gap: 10px;
      }

      .deck-manager-dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .deck-manager-dialog select,
      .deck-manager-dialog input {
        width: 100%;
      }

      .deck-manager-error {
        min-height: 18px;
        color: var(--bad);
        font-size: 13px;
      }
    `;
    document.head.appendChild(style);
  }

  function init(options) {
    const textarea = typeof options.textarea === "string"
      ? document.querySelector(options.textarea)
      : options.textarea;
    if (!textarea) return null;
    injectStyles();

    const root = document.createElement("div");
    root.className = "deck-manager";
    root.innerHTML = `
      <div class="deck-manager-current"></div>
      <div class="deck-manager-actions">
        <button class="deck-manager-icon deck-manager-load secondary" type="button" title="Carica mazzo" aria-label="Carica mazzo">${icon("folder")}</button>
        <button class="deck-manager-icon deck-manager-save" type="button" title="Salva nuovo mazzo" aria-label="Salva nuovo mazzo">${icon("save")}</button>
        <button class="deck-manager-icon deck-manager-update" type="button" title="Aggiorna mazzo salvato" aria-label="Aggiorna mazzo salvato">${icon("save")}</button>
        <button class="deck-manager-icon deck-manager-delete secondary" type="button" title="Cancella mazzo" aria-label="Cancella mazzo">${icon("trash")}</button>
      </div>
    `;

    const loadDialog = document.createElement("dialog");
    loadDialog.className = "deck-manager-dialog";
    loadDialog.innerHTML = `
      <div class="deck-manager-dialog-head">
        <h3>Carica mazzo</h3>
        <button class="deck-manager-icon secondary deck-manager-close" type="button" title="Chiudi" aria-label="Chiudi">${icon("close")}</button>
      </div>
      <div class="deck-manager-dialog-body">
        <label>Mazzo
          <select class="deck-manager-select"></select>
        </label>
        <div class="deck-manager-dialog-actions">
          <button class="deck-manager-load-confirm" type="button">Carica</button>
        </div>
      </div>
    `;

    const saveDialog = document.createElement("dialog");
    saveDialog.className = "deck-manager-dialog";
    saveDialog.innerHTML = `
      <div class="deck-manager-dialog-head">
        <h3>Salva mazzo</h3>
        <button class="deck-manager-icon secondary deck-manager-close" type="button" title="Chiudi" aria-label="Chiudi">${icon("close")}</button>
      </div>
      <div class="deck-manager-dialog-body">
        <label>Nome
          <input class="deck-manager-save-name" type="text" autocomplete="off">
        </label>
        <div class="deck-manager-error"></div>
        <div class="deck-manager-dialog-actions">
          <button class="deck-manager-save-confirm" type="button">Salva</button>
        </div>
      </div>
    `;

    textarea.insertAdjacentElement("beforebegin", root);
    document.body.append(loadDialog, saveDialog);

    const currentNode = root.querySelector(".deck-manager-current");
    const loadButton = root.querySelector(".deck-manager-load");
    const saveButton = root.querySelector(".deck-manager-save");
    const updateButton = root.querySelector(".deck-manager-update");
    const deleteButton = root.querySelector(".deck-manager-delete");
    const select = loadDialog.querySelector(".deck-manager-select");
    const loadConfirm = loadDialog.querySelector(".deck-manager-load-confirm");
    const saveNameInput = saveDialog.querySelector(".deck-manager-save-name");
    const saveConfirm = saveDialog.querySelector(".deck-manager-save-confirm");
    const saveError = saveDialog.querySelector(".deck-manager-error");
    let activeDeckName = null;

    function showDialog(dialog) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }

    function closeDialog(dialog) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }

    function deckByName(name) {
      return deckList().find(deck => deck.name === name) || null;
    }

    function currentDeck() {
      return activeDeckName ? deckByName(activeDeckName) : null;
    }

    function refreshSelect() {
      const current = select.value || activeDeckName || "";
      select.innerHTML = "";
      for (const deck of deckList()) {
        const option = document.createElement("option");
        option.value = deck.name;
        option.textContent = deck.builtin ? `${deck.name} (base)` : deck.name;
        select.appendChild(option);
      }
      if (Array.from(select.options).some(option => option.value === current)) {
        select.value = current;
      }
    }

    function syncKnownLabel() {
      const match = findDeckByText(textarea.value);
      if (match) {
        activeDeckName = match.name;
      } else if (!normalizeDeckText(textarea.value) || currentDeck()?.builtin) {
        activeDeckName = null;
      }
      renderToolbar();
    }

    function renderToolbar() {
      const deck = currentDeck();
      const normalized = normalizeDeckText(textarea.value);
      const modified = deck && normalized && deck.normalized !== normalized;
      const label = deck ? `${deck.name}${modified ? " *" : ""}` : "<senza nome>";
      currentNode.innerHTML = "Mazzo: <strong></strong>";
      currentNode.querySelector("strong").textContent = label;
      currentNode.title = deck && modified ? "Mazzo modificato non ancora aggiornato." : "";

      saveButton.hidden = Boolean(deck);
      updateButton.hidden = !deck;
      deleteButton.hidden = !deck;
      updateButton.disabled = !deck || deck.builtin || !normalized;
      deleteButton.disabled = !deck || deck.builtin;
    }

    function setText(text, shouldNotify) {
      textarea.value = formatDeckText(text);
      syncKnownLabel();
      if (shouldNotify && typeof options.onLoad === "function") {
        options.onLoad(textarea.value);
      }
    }

    loadButton.addEventListener("click", () => {
      refreshSelect();
      showDialog(loadDialog);
    });

    loadConfirm.addEventListener("click", () => {
      const deck = deckByName(select.value);
      if (!deck) return;
      activeDeckName = deck.name;
      setText(deck.text, true);
      activeDeckName = deck.name;
      renderToolbar();
      closeDialog(loadDialog);
    });

    loadDialog.querySelector(".deck-manager-close").addEventListener("click", () => {
      closeDialog(loadDialog);
    });

    saveButton.addEventListener("click", () => {
      saveNameInput.value = "";
      saveError.textContent = "";
      showDialog(saveDialog);
      saveNameInput.focus();
    });

    saveConfirm.addEventListener("click", () => {
      const name = saveNameInput.value.trim();
      const text = formatDeckText(textarea.value);
      if (!name) {
        saveError.textContent = "Inserisci un nome.";
        return;
      }
      if (!text) {
        saveError.textContent = "Nessun mazzo da salvare.";
        return;
      }
      if (deckByName(name)) {
        saveError.textContent = "Nome gia' usato.";
        return;
      }
      const savedDecks = readSavedDecks();
      savedDecks[name] = text;
      if (!writeSavedDecks(savedDecks)) {
        saveError.textContent = "Impossibile scrivere nel localStorage.";
        return;
      }
      activeDeckName = name;
      refreshSelect();
      renderToolbar();
      closeDialog(saveDialog);
    });

    saveDialog.querySelector(".deck-manager-close").addEventListener("click", () => {
      closeDialog(saveDialog);
    });

    updateButton.addEventListener("click", () => {
      const deck = currentDeck();
      const text = formatDeckText(textarea.value);
      if (!deck || deck.builtin || !text) return;
      const savedDecks = readSavedDecks();
      savedDecks[deck.name] = text;
      if (!writeSavedDecks(savedDecks)) return;
      activeDeckName = deck.name;
      refreshSelect();
      renderToolbar();
    });

    deleteButton.addEventListener("click", () => {
      const deck = currentDeck();
      if (!deck || deck.builtin) return;
      const savedDecks = readSavedDecks();
      delete savedDecks[deck.name];
      if (!writeSavedDecks(savedDecks)) return;
      activeDeckName = null;
      refreshSelect();
      renderToolbar();
    });

    textarea.addEventListener("input", syncKnownLabel);
    refreshSelect();
    if (options.initialText && !textarea.value.trim()) setText(options.initialText, false);
    syncKnownLabel();

    return {
      setText(text) {
        setText(text, false);
      },
      sync: syncKnownLabel,
      selectedName() {
        return currentDeck()?.name || findDeckByText(textarea.value)?.name || "";
      }
    };
  }

  globalThis.MPCardsDeckManager = {
    init,
    normalizeDeckText,
    formatDeckText,
    knownDecks,
    deckList,
    findDeckByText,
    defaultDeckText: formatDeckText(KNOWN_DECKS[0].text)
  };
})();
