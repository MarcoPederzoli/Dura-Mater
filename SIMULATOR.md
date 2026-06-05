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

Sei workflow **`Matrice 3×3` … `Matrice 8×8`** (`matrix-L3` … `matrix-L8`). Per ogni `L` fisso:

| Step | Modalità | Pesca |
|------|----------|-------|
| `L*-comp-end` | competitiva | fine turno (default) |
| `L*-comp-start` | competitiva | inizio turno |
| `L*-duri-end` | Durissima Mater | fine turno |
| `L*-duri-start` | Durissima Mater | inizio turno |

In tutti gli step: **DM chiusa + inversione turni**, `G` da **1 a L**, strategie distinte su G1…GL con **`shuffleStrategiesAmongSeats`** (ogni partita le strategie cambiano posto) e **ordine iniziale casuale**. Circa **58 800** partite totali se si eseguono tutti e sei (~6k–13k ciascuno). Nel JSON export compare `matrixGuide` per la lettura per dimensione.

## Bilanciamento — come usare il simulatore

1. Lasciare il **mazzo ufficiale** (salvo test espliciti su varianti).
2. Impostare intervalli L e G da esplorare (es. L 3–6, G 2–5), oppure lanciare un **workflow**.
3. Assegnare strategie per giocatore (o `auto` per mix); per separare posto vs strategia usare strategie diverse su G1…Gn.
4. Aumentare `C` (es. 500–5000) quando la griglia è grande.
5. Confrontare disparità nelle matrici (evidenziatura colorata).
6. Stesso `Seed` per ripetere un’esperienza; **Esporta JSON** per analisi esterna.