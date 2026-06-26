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

## Memoria del progetto (obbligatorio — zero carico sull'utente)

Vedi anche `C:\Users\marco\.grok\AGENTS.md` sezione «Memoria progetti». L'utente **non** deve ricordare nulla; l'agente esegue il protocollo **autonomamente**.

| File | Ruolo |
|------|--------|
| `promemoria.md` | Fotografia **attuale**: focus, vincoli, cosa e' chiuso. Max ~2 pagine. |
| `SESSIONI.md` | **Diario cronologico**: ipotesi, test, risultato, decisione, «non rifare». |
| `results/INDICE.md` | Dove sono gli artefatti pesanti (json, xlsx) esclusi da Git. |
| `scripts/TODO-SOLVER-DURISSIMA.md` | Divieti operativi (probe, solver) — leggere all'avvio. |

### All'avvio (prima azione, ogni sessione)

1. Leggere `promemoria.md`, ultime **5** voci di `SESSIONI.md`, `scripts/TODO-SOLVER-DURISSIMA.md`.
2. Poi procedere con la richiesta dell'utente (qualsiasi sia — non serve che menzioni i file memoria).

### A fine lavoro (automatico se c'e' stato lavoro sul progetto)

1. Voce in `SESSIONI.md` (formato in testa al file).
2. Aggiornare `results/INDICE.md` se nuovi artefatti in `results/` o `tests/`.
3. Aggiornare `promemoria.md` se cambiano focus o divieti.
4. Proporre commit **docs**; commit/push solo dopo approvazione utente.

### Divieto

Non chiedere all'utente di «ricordarsi» di leggere o aggiornare questi file.

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

## Parallelizzazione CPU (script CLI)

- **Default 6 worker** (`defaultCliWorkers` in `scripts/cpu-workers.js`), per lasciare margine a un'altra istanza agente sullo stesso PC. Override: `--workers N` / `-j N`.
- Probe pesanti Durissima: vedi sotto (restano a 1 worker).

## Probe Durissima pesanti (DFS, bot-check, matrix)

- **Un solo probe pesante alla volta.** Gli script `durissima-gn-*`, `durissima-global-*`, `durissima-grid-probe`, `durissima-l*-probe`, `durissima-pool-sweep` usano un lock (`scripts/.heavy-probe.lock`). Non lanciarne due in parallelo.
- **Default 1 worker** (`defaultHeavyCliWorkers`). Piu worker solo con `--workers N` e solo se non ci sono altri probe in corso.
- **Non** avviare probe multipli in background (es. bot-check 5x5 + global-probe + matrix): si contendono CPU e RAM e ognuno impiega molto di piu.
- Lock occupato da processo morto: `--force-lock`. Probe leggeri (`npm test`, tornei classici) non usano il lock.