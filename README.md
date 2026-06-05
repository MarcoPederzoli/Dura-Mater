# Dura Mater (MPCards)

SPA statica per provare le regole del gioco da tavolo e simulare partite automatiche. Non serve una build: apri `index.html` in un browser moderno.

## Pagine

- **`index.html`** — gioco locale (pagina iniziale): partite manuali o con bot, undo/redo, salvataggio sessione.
- **`simulator.html`** — simulatore batch: molte partite su combinazioni di lato matrice, giocatori e strategie.
- **`game.html`** — reindirizza a `index.html` (compatibilità con vecchi link).

## Promemoria per sessioni IA

Vedi **`promemoria.md`** — da allegare o citare all’avvio di una nuova chat per ripristinare contesto e vincoli.

## Grafica

Carte in `grafica/` (`01.jpg`–`64.jpg` + `Back.jpg`). Mappatura ufficiale immagine ↔ codice in **`Carte.xlsx`** (applicata in `card-art.js`). Vedi `grafica/README.md`.

## Moduli

- `mpcards-core.js` — regole, mazzo finale (`SIM_DECK_CODES`), mosse legali, bot, `simulateGame`.
- `card-art.js` — percorsi immagini per codice carta.
- `game-state.js` — timeline, undo/redo, export/import `mpcards.game.v1`.
- `game.js` — UI del gioco (`index.html`).
- `simulator.js` — UI batch (`simulator.html`), Web Worker.
- `deck-manager.js` — selezione mazzo (integrato: **finale**), salvataggi opzionali in `localStorage`.
- `version.js` — versione in pagina.

## Mazzo

64 codici a tre cifre (`VALORE`, `FORMA`, `COLORE`). Il mazzo stampato è definito in `mpcards-core.js` e nel gestore mazzi come **finale**.

## Regole e simulatore

- Regole operative: `RULES.md` e implementazione in `mpcards-core.js`.
- Parametri e metriche del batch: `SIMULATOR.md`.
- Test: `npm test` (richiede Node).

## Deploy PartyKit

`npm run deploy:partykit` — vedi `ONLINE.md` e `scripts/prepare-partykit-static.ps1`.