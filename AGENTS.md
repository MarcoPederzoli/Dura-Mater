# Istruzioni per gli agenti

Progetto SPA statica per **Dura Mater** (codice legacy: MPCards).

- Non introdurre una build se non diventa realmente necessaria.
- Pagina iniziale: **`index.html`** (gioco). Secondaria: **`simulator.html`**.
- Il solver/generatore mazzi in `index.html` è stato rimosso; il mazzo è fisso in `mpcards-core.js` (`SIM_DECK_CODES`).
- Modifiche alle regole: aggiornare `mpcards-core.js`, `RULES.md` e i test in `tests/`.

## Git

- Repository: `https://github.com/MarcoPederzoli/Dura-Mater.git` (branch `master`).
- Dopo modifiche concluse: commit e push senza chiedere all’utente di usare VS Code o il terminale.
- Messaggi di commit in italiano, brevi e specifici.

## Deploy

- Prima di un deploy aggiornare versione in `package.json` e `version.js` (semver indicativo).
- Non modificare manualmente `commit` e `deployedAt` in `version.js` salvo esigenza del deploy.

## Verifica

- Apertura diretta da filesystem: `index.html` o `simulator.html`.
- Test automatici: `npm test` nella root del progetto.
- Il browser in-app può bloccare `file://` o localhost; per UI usare il browser dell'utente o Playwright se disponibile.