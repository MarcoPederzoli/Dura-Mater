# Istruzioni per gli agenti

Progetto SPA statica per **Dura Mater** (codice legacy: MPCards).

- Non introdurre una build se non diventa realmente necessaria.
- Pagina iniziale: **`index.html`** (gioco). Secondaria: **`simulator.html`**.
- Il solver/generatore mazzi in `index.html` è stato rimosso; il mazzo è fisso in `mpcards-core.js` (`SIM_DECK_CODES`).
- Modifiche alle regole: aggiornare `mpcards-core.js`, `RULES.md` e i test in `tests/`.
- **Durissima:** variante di riferimento **N reshuffle** (core + pool N reshuffle; vedi `RULES.md`). Core puro solo con opt-out esplicito.

## Git

- Repository: `https://github.com/MarcoPederzoli/Dura-Mater.git` (branch `master`).
- Dopo modifiche: proporre messaggio di commit all’utente; commit + push **solo dopo approvazione**.
- Messaggi in italiano, brevi e specifici. Convenzione rivedibile su richiesta utente.

## Deploy

- Prima di un deploy aggiornare versione in `package.json` e `version.js` (semver indicativo).
- Non modificare manualmente `commit` e `deployedAt` in `version.js` salvo esigenza del deploy.

## Testo terminale-safe

- In messaggi, CLI e `RULES.md`: solo notazione ASCII leggibile (`3x3`, `ceil(N/2)`, `floor(N^2/G)`, `<=`, `chi2`) — vedi `C:\Users\marco\.grok\AGENTS.md` sezione «Testo leggibile nel terminale».

## Verifica

- Apertura diretta da filesystem: `index.html` o `simulator.html`.
- Test automatici: `npm test` nella root del progetto.
- **Sweep / audit CLI:** per default solo celle con `G >= G_min` (`isDefaultSweepSetup`). Per includere sotto-G sconsigliato o solitario: flag `--all-legal` (o `--tutte-legali`). Workflow con celle esplicite (es. probe Durissima solitario) usano `allLegal: true` sullo step.
- Il browser in-app può bloccare `file://` o localhost; per UI usare il browser dell'utente o Playwright se disponibile.