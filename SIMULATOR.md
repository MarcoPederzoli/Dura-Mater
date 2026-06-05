# Requisiti simulatore batch

Il simulatore batch vive in `simulator.html` e usa `simulator.js`.
Le regole di gioco e le strategie sono definite in `mpcards-core.js`, condiviso con `index.html`.

`simulator.html` carica `version.js`, `mpcards-core.js` e `simulator.js` (senza `deck-manager.js`: il mazzo predefinito è quello ufficiale del core).

Ogni partita è delegata a `MPCardsCore.simulateGame`, così il comportamento resta allineato al gioco locale (inclusa **Dura Mater chiusa** e inversione turni dopo chiusura).

## Input

- `C`: numero di simulazioni per ogni caso, default `100`.
- `Lmin` / `Lmax`: lato matrice (3–8).
- `Gmin` / `Gmax`: numero giocatori (1–8).
- `S`: strategia per ogni **Giocatore 1…N** (N = Gmax configurato), default `auto`.
- `Seed`: riproducibilità (derivato per ogni coppia L×G).
- `Worker`: parallelismo (Web Worker).

I casi validi sono solo quelli con `L >= G`. Per ogni coppia valida `(L, G)` vengono eseguite `C` partite.

## Mazzo

- **Predefinito:** array `SIM_DECK_CODES` in `mpcards-core.js` (64 codici, mazzo stampato «finale»).
- **Variante (opzionale):** pulsante «Variante mazzo (sperimentale)» per incollare 64 codici alternativi e testare bilanciamento del mazzo; «Ripristina mazzo ufficiale» torna al default.

Per ogni partita con lato `L`, il sottomazzo usa le carte con **valore (1ª cifra) ≤ L** → `L × L` carte in partita.

## Strategie

Stesse del gioco (`STRATEGIES` in `mpcards-core.js`):

- `high-value` (A), `low-value` (B), `compatibility` (M), `greedy` (C), `adjacent` (D), `draw-random-finish-random` (E), `random` (R).
- `auto`: a ogni partita assegna casualmente una strategia effettiva al giocatore.

## Output (matrici L × G)

Quattro tabelle con totali di riga, colonna e complessivo:

1. **Rendimento per giocatore** — punti vittoria / partite giocate (100% = atteso con G giocatori).
2. **Rendimento per strategia** — come sopra per strategia effettiva del vincitore.
3. **Turni** — min, media, max.
4. **Dura Mater chiusa** — % partite con chiusura (ingombro L×L); % vittorie di chi ha chiuso (sulle partite chiuse); % stalli.

Le celle si aggiornano durante l’elaborazione (Web Worker + `MPCARDS_CORE_SOURCE`).

## Parallelismo

Worker creati da Blob; adatto ad apertura `file://` locale. Stop interrompe i job in coda.

## Audit bilanciamento MASTER (`balance-audit-master`)

Workflow lungo (~**191 000** partite) in `simulator-workflows-audit.js` (menu **Audit bilanciamento MASTER**).

| Step | Cosa misura |
|------|-------------|
| `solo-1p` | Risolvibilità solitario L 3–8 (anche pochi % successo ok) |
| `matrix-planner` / `matrix-random` / `matrix-hand-planner` | Tutte le celle L×G valide: successo vs stallo, **scalabilità con L** |
| `mix-44` / `mix-55` / `mix-66` | Forza strategie con posto fisso |
| `rotate-44` / `rotate-55` / `rotate-66` | Stesse strategie ma **`shuffleStrategiesAmongSeats`**: separa posto vs strategia |

Dopo la run: **Esporta JSON** e incolla in chat. Nel file c’è `auditGuide` con le letture consigliate. Gli **stalli** contano come difficoltà, non come difetto.

## Workflow (run unica + JSON per analisi)

Menu **Workflow** in `simulator.html`: esegue più blocchi scenario in sequenza (es. sweep 4×4–6×6 + 5×5–6×6 + …) e produce un unico file JSON (`format: dura-mater-simulator-workflow-results`, versione 2) con un array `steps` — da incollare in chat invece di quattro run separate.

Definizioni built-in in `simulator-workflows.js`. **Importa JSON** accetta lo stesso schema (`id`, `label`, `shared`, `steps[]`).

Ogni step può fissare `strategies: ["planner","random",…]` per **G1…Gn**. Con ordine iniziale casuale (default), G1…Gn = posto al tavolo; la strategia resta sul posto. L’export include `seatStrategyBreakdown` (accoppiamento posto+strategia) oltre a posizione e strategia aggregate.

### Audit per dimensione matrice (`simulator-workflows-matrix.js`)

Sei workflow **`Matrice 3×3` … `Matrice 8×8`** (`matrix-L3` … `matrix-L8`). Per ogni `L` fisso, due step:

| Step | Modalità | Giocatori |
|------|----------|-----------|
| `L*-comp` | competitiva (vincitore) | **G = 1 … L** |
| `L*-duri` | Durissima Mater (matrice piena) | **solo G = 1** |

Pesca sempre **a fine turno** (l’opzione «pesca a inizio turno» è stata rimossa).

**Durissima e simulazione:** al tavolo la Durissima è **collaborativa**; i bot multi‑giocatore non condividono le mani. In simulazione ha senso solo **1 giocatore** (equivalente a tenere tutte le carte insieme). I vecchi export con Durissima su G>1 non vanno interpretati come partita reale.

Competitiva: **DM chiusa + inversione turni**, strategie su G1…GL con **`shuffleStrategiesAmongSeats`** e ordine iniziale casuale. Totale indicativo ~**29 400** partite su tutti e sei workflow (prima del refactor erano ~58 800 con anche pesca inizio e Durissima multi‑G).

Workflow **`matrix-all-L3-L8`**: tutti i 12 step in sequenza (3→8).

### Regola ordine di gioco

In partita e nel motore vale sempre l'**inversione alla chiusura di ciascun limite della Dura Mater** (primo asse con fila/colonna di **N** carte, poi griglia **N×N**; due limiti nello stesso turno si annullano). Vedi `RULES.md`.

### Ordine di gioco · stessa strategia (`simulator-workflows-turn-order.js`)

Workflow **`Ordine di gioco · stessa strategia`**: planner, ordine casuale (~**5 940** partite, 180 per cella). JSON: `turnOrderGuide`, `analysis.initialTurn`.

### Equità ruolo nel turno (`simulator-workflows-turn-role.js`)

**Workflow audit:** **`Equità ruolo nel turno (audit)`** (`turn-role-audit`).

Un solo step: planner, ordine iniziale casuale, inversione ai limiti DM. Matrici **3×3 … 8×8**, **G = 1 … L**. Circa **7 260** partite (220 per cella).

**Cosa guardare nel JSON** (e nel pannello analisi):

| Campo | Significato |
|-------|-------------|
| `analysis.initialTurn` | Vincitore per ruolo **1° / 2° / …** nel turno **prima** dell’inversione DM. Spread &lt;6 pt ≈ equo. |
| `analysis.positions` | Posto al tavolo G1…Gn (con ordine casuale dovrebbe essere ~piatto se tutti usano planner). |
| `analysis.dmCloser` | Chi **chiude** Dura Mater per ruolo nel turno; atteso ~100/G %. |
| `initialTurnGuide` | Istruzioni di lettura nell’export. |

### Verifica «il gioco funziona» (matrici 3×3–8×8)

| Cosa guardare | Competitiva (`L*-comp`) | Durissima (`L*-duri`, solo G=1) |
|---------------|-------------------------|----------------------------------|
| **success%** | Partite con **vincitore** | **Matrice L×L piena** |
| **stall%** | Nessun vincitore | Griglia non completata |
| **G=2…L−1** | Deve restare giocabile (non ~100% stalli su L piccole) | — |
| **G=L** | Spesso pochi stalli in realtà (vittoria rapida) | — |

Da terminale: `npm run test:matrix` (campione ridotto). Export storici in `tests/matrix-L*.json` usano ancora 4 step/step vecchi; rieseguire i workflow dopo aggiornamento.

## Bilanciamento — come usare il simulatore

1. Lasciare il **mazzo ufficiale** (salvo test espliciti su varianti).
2. Impostare intervalli L e G da esplorare (es. L 3–6, G 2–5), oppure lanciare un **workflow**.
3. Assegnare strategie per giocatore (o `auto` per mix); per separare posto vs strategia usare strategie diverse su G1…Gn.
4. Aumentare `C` (es. 500–5000) quando la griglia è grande.
5. Confrontare disparità nelle matrici (evidenziatura colorata).
6. Stesso `Seed` per ripetere un’esperienza; **Esporta JSON** per analisi esterna.