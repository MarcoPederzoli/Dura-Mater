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

## Bilanciamento — come usare il simulatore

1. Lasciare il **mazzo ufficiale** (salvo test espliciti su varianti).
2. Impostare intervalli L e G da esplorare (es. L 3–6, G 2–5).
3. Assegnare strategie per giocatore (o `auto` per mix).
4. Aumentare `C` (es. 500–5000) quando la griglia è grande.
5. Confrontare disparità nelle matrici (evidenziatura colorata) e la tabella **Dura Mater chiusa**.
6. Stesso `Seed` per ripetere un’esperienza.