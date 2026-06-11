# PROJECT RECOVERY SUMMARY — Dura Mater

*Generato: 5 giugno 2026 — sessione di recovery contesto (contesto precedente ~250k token).*

---

## 1. Obiettivo generale

**Dura Mater** (nome legacy nel codice: **MPCards**) è un gioco da tavolo con mazzo di **64 carte** (ogni carta = codice a 3 cifre: VALORE, FORMA, COLORE).

Il repository è una **SPA statica** (nessuna build obbligatoria) che serve a:

1. **Giocare localmente** — partite umano/bot con UI grafica, undo/redo, salvataggio sessione (`index.html`).
2. **Simulare in batch** — migliaia di partite automatiche per bilanciamento regole, strategie e dimensioni matrice (`simulator.html`).
3. **Formalizzare e testare le regole** — implementazione in `mpcards-core.js`, documentazione in `RULES.md`, test Node in `tests/`.
4. *(Futuro)* **Multiplayer online** — bozza PartyKit in `party/server.js` + `ONLINE.md` (non integrato nel gioco).

Il **solver/generatore mazzi** originale (`PROMPT.md`) è **obsoleto e rimosso**: il mazzo stampato è **fisso** in `SIM_DECK_CODES`.

**Percorso di lavoro:** `D:\Grok\projects\Dura Mater`  
**Repository:** https://github.com/MarcoPederzoli/Dura-Mater.git — branch `master`

---

## 2. Architettura / struttura principale

```
Dura Mater/
├── index.html              # Gioco locale (entry principale)
├── game.html               # Redirect → index.html
├── simulator.html          # Simulatore batch
├── mpcards-core.js         # Motore regole (eval di stringa → MPCardsCore)
├── game.js                 # UI gioco
├── game-state.js           # Timeline, undo/redo, export mpcards.game.v1
├── simulator.js            # UI simulatore + Web Worker
├── simulator-workflows.js  # Catalogo workflow built-in
├── simulator-workflows-audit.js   # Workflow audit bilanciamento MASTER
├── simulator-workflows-matrix.js  # Workflow Matrice 3x3 … 8x8
├── workflows/              # JSON importabili (audit, esempi)
├── card-art.js             # codice → grafica/NN.jpg (da Carte.xlsx)
├── card-names.js           # Nomi italiani leggibili
├── deck-manager.js         # Mazzo "finale" (+ localStorage opzionale)
├── version.js              # Versione in pagina
├── RULES.md, SIMULATOR.md  # Documentazione regole e simulatore
├── promemoria.md, AGENTS.md, README.md
├── tests/core-regression.test.js
├── grafica/                # 01.jpg–64.jpg + Back.jpg
├── Carte.xlsx              # Fonte verità immagine ↔ codice
├── party/server.js         # Bozza PartyKit
└── scripts/                # sync carte, prepare deploy PartyKit
```

### Pattern architetturali

| Layer | Ruolo |
|-------|--------|
| **Core** | `mpcards-core.js` espone `globalThis.MPCardsCore` (regole, bot, `simulateGame`). Il sorgente è una stringa `MPCARDS_CORE_SOURCE` + `eval()` così il simulatore può iniettarlo nei Web Worker. |
| **Stato gioco** | `game-state.js` → `MPCardsGameState` (timeline serializzabile). |
| **UI adapter** | `game.js` / `simulator.js` — nessun framework. |
| **Asset** | `grafica/` + `card-art.js` + `Carte.xlsx`. |

### Flusso dati simulatore

1. UI (`simulator.html` + `simulator.js`) raccoglie parametri (L, G, C, strategie, regole DM).
2. Job in coda → **Web Worker** (Blob) con core inlined.
3. Ogni partita → `MPCardsCore.simulateGame`.
4. Aggregazione in matrici L x G + export JSON (workflow v2 con `steps[]`).

---

## 3. File più importanti

| File | Contenuto |
|------|-----------|
| **`mpcards-core.js`** | Cuore del progetto (~700 righe effettive nel template): mazzo `SIM_DECK_CODES`, decode carte, legalità posa, punteggio compatibilità, chiusura **Dura Mater** (ingombro N x N), inversione turni, modalità **Durissima Mater** (vittoria a matrice piena), pesca inizio/fine turno, strategie bot (`planner`, `hand-planner`, `prudent`, `chain-max`, …), `simulateGame`. |
| **`index.html` + `game.js`** | Tavolo, mano compatta + fascia carte grandi con nomi, bot, undo/redo, import/export partita. |
| **`simulator.html` + `simulator.js`** | Batch run, preset regole, varianti mazzo sperimentali, matrici risultato, menu **Workflow**, import/export JSON, audit guide nel export. |
| **`simulator-workflows*.js`** | Definizioni scenari multi-step (sweep, posto vs strategia, audit MASTER ~191k partite, matrici L3–L8 ~58.8k partite totali). |
| **`game-state.js`** | Schema `mpcards.game.v1`, random riproducibile, branching timeline. |
| **`RULES.md`** | Regole operative (in evoluzione); allineamento con core non sempre perfetto su dettagli matrice (fissazione assi). |
| **`SIMULATOR.md`** | Parametri batch, metriche, guida workflow e audit bilanciamento. |
| **`promemoria.md`** | Cheat-sheet per nuove sessioni IA (vincoli, colori, storia recente). |
| **`tests/core-regression.test.js`** | Test Node: mosse illegali, undo/redo, chiusura DM, Durissima, planner, ordine turni casuale, `shuffleStrategiesAmongSeats`, ecc. |
| **`card-art.js` / `Carte.xlsx`** | Mapping ufficiale codice ↔ file JPG (fix storico: non per indice nell’array). |
| **`version.js`** | `window.MPCARDS_VERSION` (attualmente **0.1.4** in working copy). |
| **`package.json`** | Script `npm test`; versione package **0.1.2** (disallineata da `version.js`). |

---

## 4. Funzionalità già implementate

### Gioco (`index.html`)

- Partite 1–8 giocatori, lato matrice N (3–8), filtro carte `VALORE <= N`.
- UI con **grafica carte** (`object-fit: contain`), nomi da `card-names.js`.
- Modalità manuale e **bot** con strategie configurabili.
- **Undo / redo** e salvataggio partita (`game-state.js`).
- **Dura Mater chiusa**: chiusura quando ingombro posate = N x N; **inversione ordine turni** dal giocatore che chiude.
- Mazzo fisso ufficiale; `deck-manager.js` ridotto al mazzo **finale**.

### Motore (`mpcards-core.js`)

- Regole posa: adiacenza, requisiti 1–4 nel turno, confini matrice N x N prima/dopo fissazione.
- Strategie: `high-value`, `low-value`, `compatibility`, `greedy`, `adjacent`, `draw-random-finish-random`, `random`, `auto`, **`planner`**, **`hand-planner`**, **`prudent`**, **`chain-max`**.
- Opzioni simulazione: `invertTurnOrderOnClose`, `drawAtTurnStart`, `durissimaMater`, `randomizeTurnOrder`, `shuffleStrategiesAmongSeats`.
- `simulateGame` con metriche (vincitore, turni, chiusura DM, stalli, strategie effettive per posto).

### Simulatore (`simulator.html`)

- Griglia L x G con C partite per cella; Web Worker; seed riproducibile.
- Matrici: rendimento giocatore/strategia, turni, % Dura Mater chiusa.
- Mazzo ufficiale + **variante sperimentale** (64 codici incollati).
- **Workflow** multi-step con export JSON (`format: dura-mater-simulator-workflow-results`, v2):
  - Built-in: `full-sweep`, `standard-sweep`, `seat-strategy-*`, ecc.
  - **Audit bilanciamento MASTER** (`balance-audit-master`, ~191k partite).
  - **Matrice 3x3 … 8x8** (4 modalità regole  x  G=1…L, shuffle strategie).
- Import JSON workflow (`workflows/*.json`).

### Test e tooling

- `npm test` → `node tests/core-regression.test.js` (richiede Node nel PATH).
- `scripts/sync-carte-from-xlsx.py` — sync da Excel.
- `npm run deploy:partykit` — deploy statico + PartyKit (vedi `ONLINE.md`).

### Storia recente (da `promemoria.md` + diff corrente)

1. Migrazione da `DaClaude` a cartella unica `Dura Mater`.
2. Mazzo finale 64 codici; rimossi mazzi alternativi e UI generatore.
3. Grafica corretta via `Carte.xlsx`.
4. Regola **Dura Mater chiusa** + inversione; criterio su **ingombro** (non “riga/colonna piena”).
5. **Espansione simulatore** (sessione corrente non committata): workflow, audit, Durissima, nuove strategie, pesca inizio turno.

---

## 5. Stato Git e lavoro in corso (non committato)

**Branch:** `master` (allineato a `origin/master`)

**Modificati (non staged):**

| File | Δ approssimativo |
|------|------------------|
| `simulator.js` | +~1491 righe (workflow engine, export, UI) |
| `mpcards-core.js` | +~254 righe (strategie, Durissima, shuffle posti, …) |
| `simulator.html` | +~248 righe (menu workflow, controlli) |
| `tests/core-regression.test.js` | +~141 righe |
| `SIMULATOR.md` | documentazione workflow/audit |
| `version.js` | bump 0.1.4 |

**Non tracciati (nuovi):**

- `simulator-workflows.js`
- `simulator-workflows-audit.js`
- `simulator-workflows-matrix.js`
- `workflows/balance-audit-master.json`
- `workflows/example-custom.json`

**Implicazione:** la sessione precedente stava portando a termine il **sistema workflow del simulatore** e l’**audit di bilanciamento**; il commit è ancora da fare (con approvazione utente, messaggio in italiano).

---

## 6. Problemi aperti / cose da finire

### Priorità alta (codice non committato)

- [ ] **Commit + push** delle modifiche simulatore/workflow (dopo `npm test` e review utente).
- [ ] Allineare **`package.json`** version con **`version.js`** (0.1.2 vs 0.1.4).
- [ ] Verificare test in ambiente con Node: nell’agent shell `node`/`npm` non erano nel PATH (da rieseguire localmente: `npm test`).

### Regole e documentazione

- [ ] Affinare **`RULES.md`** vs implementazione su **fissazione assi** matrice e confini (dettaglio ancora “in evoluzione”).
- [ ] Chiarire in documentazione tutte le varianti **Durissima Mater** vs competitiva (già in core e simulatore).

### UI / prodotto

- [ ] Retro **`Back.jpg`** in pesca / carte coperte (citato in `promemoria.md` come task opzionale).
- [ ] **Multiplayer PartyKit** — solo health/echo in `party/server.js`; integrazione client non fatta.

### Bilanciamento (uso simulatore, non bug)

- Eseguire workflow **Audit MASTER** o **Matrice L x N**, esportare JSON, analizzare con `auditGuide` / `matrixGuide`.
- Interpretare **stalli alti** come difficoltà puzzle, non errore simulatore (`SIMULATOR.md`).

### Convenzioni agenti

- Modifiche regole → `mpcards-core.js` + `RULES.md` + `tests/`.
- Deploy → aggiornare `package.json` e `version.js` (non toccare `commit`/`deployedAt` manualmente salvo deploy).
- Commit/push **solo dopo approvazione** utente.

---

## 7. Come riprendere il lavoro

1. Aprire `D:\Grok\projects\Dura Mater` in Cursor.
2. Leggere `promemoria.md`, `RULES.md`, `SIMULATOR.md` e questo file.
3. Eseguire `npm test` nella root.
4. Aprire `simulator.html` nel browser per test workflow; `index.html` per smoke test gioco.
5. Se si prosegue sul simulatore: valutare commit con messaggio tipo  
   *«Simulatore: workflow batch, audit bilanciamento e strategie planner»*.

---

## 8. Riferimenti rapidi regole

| Concetto | Dettaglio |
|----------|-----------|
| Codice carta | 3 cifre: 1ª=VALORE, 2ª=FORMA, 3ª=COLORE (1=Rosso … 8=Bianco) |
| Mazzo partita | Carte con valore <= N → N x N carte |
| Vittoria competitiva | Primo senza carte in mano |
| Dura Mater chiusa | Ingombro posate = N x N → inversione turni |
| Durissima Mater | Vittoria quando matrice N x N è piena (tutte le celle) |

---

*Fine recovery summary.*