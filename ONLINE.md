# Architettura Multiplayer Online

## Obiettivo

Implementare una modalità multiplayer online per giochi di carte con:

- stato condiviso quasi realtime
- client web autonomi nella gestione della UI
- sincronizzazione semplice
- infrastruttura minimale
- supporto futuro a bot/AI
- sviluppo e test completamente locali

L'obiettivo NON è creare un backend enterprise, ma una piattaforma leggera, iterabile e facile da mantenere.

---

# Stack scelto

## Frontend

- SPA statica esistente
- JavaScript modulare senza build obbligatoria
- WebSocket client PartyKit

Per ora non e' previsto il passaggio a Vue/Vuex. L'app resta composta da tre entrypoint statici principali:

- `index.html`: gioco locale interattivo (pagina iniziale).
- `simulator.html`: simulatore batch per strategie e parametri.
- `game.html`: reindirizzamento a `index.html`.

Il gioco locale ha gia' un core condiviso (`mpcards-core.js`) e un gestore di sessione/timeline (`game-state.js`) che mantiene stato, undo/redo ed export/import senza introdurre una build. `deck-manager.js` e' condiviso dalle tre pagine per selezionare e salvare mazzi, mentre `game.js` e `simulator.js` sono adapter UI specifici.

Un framework potra' essere rivalutato solo se la UI multiplayer diventera' abbastanza complessa da giustificarlo. La direzione attuale e' mantenere lo stato di gioco serializzabile e guidato da azioni, cosi' da poterlo riusare con PartyKit.

---

## Backend realtime

- PartyKit (managed free tier)
- WebSocket
- Room-based architecture

Per ora NON si utilizza Cloudflare direttamente.

PartyKit fornisce:
- stanze multiplayer
- gestione websocket
- sincronizzazione realtime
- sviluppo locale
- deploy estremamente semplice

Il piano gratuito è sufficiente per:
- prototipi
- playtest
- sviluppo iniziale
- piccoli gruppi di utenti

Limitazione importante:
- lo storage managed gratuito è volatile
- i dati possono sparire dopo ~24h
- quindi non va considerato persistente

---

# Filosofia architetturale

## Server minimale

Il server dovrebbe diventare l'autorita' della room almeno per ordine eventi e validazione essenziale delle azioni.

Responsabilità server:
- ordinare eventi
- distribuire eventi
- mantenere stato room
- gestire connessioni
- gestire reconnessioni
- gestire presenza utenti
- validare che le azioni siano applicabili allo stato corrente
- eventualmente ospitare bot

Responsabilità client:
- conoscere le regole
- proporre azioni
- calcolare e renderizzare stato locale ricevuto/ricostruito
- aggiornare UI

---

# Sincronizzazione

La base preferita resta la sincronizzazione per eventi/azioni.

Si sincronizzano eventi, con snapshot occasionali utili per riconnessioni, spectator o debug.

Esempio:

```json
{
  "seq": 42,
  "player": "p1",
  "type": "PLAY_CARD",
  "payload": {
    "card": "7-denari"
  }
}
````

Ogni client:

1. riceve evento
2. applica evento localmente
3. ricostruisce lo stato

Vantaggi:

* traffico minimo
* replay semplici
* debugging facile
* spectator mode naturale
* riconnessioni più semplici

La timeline locale introdotta in `game-state.js` salva snapshot completi per undo/redo ed export/import. Nel multiplayer la stessa idea puo' convivere con un event log: il server puo' conservare azioni ordinate e, quando serve, produrre uno snapshot della sessione.

---

# Shared Game Engine

Le regole vivono oggi in `mpcards-core.js`, condiviso da gioco locale e simulatore. Il file espone anche `MPCARDS_CORE_SOURCE`, usato da `simulator.js` per ricreare lo stesso core dentro Web Worker creati da Blob senza introdurre una build.

Struttura attuale:

```text
index.html        gioco locale (pagina iniziale)
deck-manager.js   gestione mazzi noti/salvati per le tre pagine
mpcards-core.js   regole, mosse legali, strategie, bot, simulazione
game-state.js     sessione, timeline, undo/redo, import/export
index.html + game.js   UI locale e orchestrazione browser
simulator.html/js UI batch, worker e aggregazione statistiche
```

Funzioni principali:

```js
applyPlacement(state, player, move)
legalPlacements(state, player, requirement)
validatePlacement(state, player, move)
```

Questo consente:

* coerenza client/server
* testing semplice
* riuso totale
* eventuale validazione server futura

---

# Architettura room

Ogni partita è una room PartyKit.

Schema:

```text
1 room = 1 partita
```

La room:

* mantiene stato runtime
* gestisce websocket
* inoltra eventi
* coordina turni
* ospita eventuali bot

---

# AI / Bot

I bot NON vengono implementati come utenti separati.

Vengono ospitati direttamente nella room.

Esempio:

```ts
if (currentPlayer.type === "bot") {
  const move = chooseMove(state, strategy)
  applyPlacement(state, currentPlayer.id, move)
  broadcast(move)
}
```

---

# Strategie bot iniziali

## Random valid

Sceglie una mossa valida casuale.

Utile per:

* test
* riempire lobby
* simulazioni

---

## Greedy

Sceglie la mossa col punteggio immediato migliore.

---

## Defensive

Minimizza vantaggio avversario.

---

## Rule-based

Sistema di priorità hardcoded.

Esempio:

```text
- se puoi chiudere turno => fallo
- se puoi prendere carta alta => fallo
- altrimenti conserva risorse
```

---

# Testing locale

La parte statica deve restare apribile direttamente da filesystem. Per controlli rapidi si puo' aprire `index.html` o `simulator.html` senza server; per verifiche automatizzate sono preferibili script Node con Playwright/Chromium o controlli DOM mirati, come indicato in `AGENTS.md`.

PartyKit supporta anche sviluppo locale per la parte realtime quando servira'.

Workflow previsto:

```bash
npx partykit dev
```

Con:

* frontend statico servito da PartyKit dalla cartella configurata
* server PartyKit locale
* websocket locali

Questo consente:

* sviluppo offline
* hot reload
* debugging rapido
* simulazione multi-client

---

# Evoluzione futura

Possibili upgrade futuri:

## Persistenza

* Cloudflare Durable Objects
* SQLite
* Postgres
* Supabase

## Matchmaking

* lobby centralizzate
* ranking
* classifiche

## Replay

* salvataggio event log
* replay deterministici

## Spectator mode

* osservatori realtime

## Bot avanzati

* Monte Carlo
* Minimax
* LLM-assisted agents

---

# Cose volutamente evitate

## Backend tradizionale

NO:

* Express
* REST complesso
* microservizi
* Redis iniziale

## Sincronizzazione full-state

NO:

* snapshot continui
* state replication pesante

## Peer-to-peer puro

NO:

* WebRTC mesh
* consenso distribuito
* authoritative host client

---

# Obiettivo tecnico

Mantenere il sistema:

* semplice
* leggibile
* hackabile
* iterabile
* economico
* facilmente deployabile
