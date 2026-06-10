# Promemoria — Dura Mater (sessioni future con l’IA)

Carica questo file all’inizio di una nuova chat (es. «Leggi `promemoria.md` e continuiamo»).

## Percorso e vincoli

- **Cartella unica di lavoro:** `D:\Grok\projects\Dura Mater`
- **Non** cercare su tutto il disco; **non** usare `DaClaude` (rimossa, tutto è nella cartella sopra).
- SPA statica: **nessuna build obbligatoria**. Aprire `index.html` nel browser.

## Git / GitHub

- **Remote:** [https://github.com/MarcoPederzoli/Dura-Mater](https://github.com/MarcoPederzoli/Dura-Mater) — branch `master`.
- L’agente prepara commit e push; l’utente **non** usa VS Code per Git.
- **Prima di ogni push:** l’agente propone titolo (e, se serve, descrizione) del commit; l’utente approva o corregge. Push solo dopo ok.
- Convenzione attuale **rivedibile** (es. in futuro più libertà all’agente sui messaggi).
- Se `git push` fallisce per autenticazione scaduta, segnalarlo all’utente (ri-login GitHub Credential Manager).

## Cos’è il progetto

Simulatore / gioco locale del gioco da tavolo **Dura Mater** (nel codice compare ancora il nome legacy **MPCards**).

| Pagina | Ruolo |
|--------|--------|
| `index.html` | **Pagina iniziale** — gioco locale (umano + bot) |
| `simulator.html` | Simulatore batch di partite |
| `game.html` | Solo redirect → `index.html` |

Il **solver / generatore mazzi** (`index.html` vecchio) è **obsoleto e rimosso**. Il mazzo è **fisso e stampato**.

## Codice carta (3 cifre)

Ogni carta ha un codice `XYZ`:

| Cifra | Campo |
|-------|--------|
| **1ª** | VALORE (1–8) → Asso … Otto in UI |
| **2ª** | FORMA (1–8) → Cerchi, Cuori, Triangoli, Quadrati, Stelle, Esagoni, **Lampi**, **Croci** |
| **3ª** | COLORE (1–8) → **1=Rosso, 2=Arancio, 3=Giallo, 4=Verde, 5=Azzurro, 6=Blu, 7=Viola, 8=Bianco** |

⚠️ I colori **non** sono 1=Bianco … 8=Rosso (errore vecchio di Claude). La 3ª cifra segue la scala Rosso→Bianco sopra.

Nomi leggibili (es. «Cinque di Lampi Viola»): `card-names.js` — regole di declinazione italiana (forma femminile Stelle/Croci, Viola/Blu/Arancio invariati, Verde→Verdi al plurale, ecc.).

## Mazzo e grafica

- **64 codici** in `mpcards-core.js` → `SIM_DECK_CODES` (ordine ufficiale).
- **`Carte.xlsx`:** colonna A = nome immagine (`01`…`64`, senza `.jpg`), colonna B = codice carta. **Fonte di verità** per quale file JPG appartiene a quale codice.
- **`card-art.js`:** mappa `codice → grafica/NN.jpg` (NON per posizione nell’array). `Back.jpg` = retro.
- Cartella **`grafica/`:** `01.jpg`…`64.jpg` + `Back.jpg`. Carte **quadrate**; in UI usare `object-fit: contain`, non `cover`.
- `deck-manager.js`: un solo mazzo integrato **`finale`**. In `index.html` **non** c’è più la sezione mazzo (textarea / salva / carica).

## Motore di gioco (`mpcards-core.js`)

- Regole operative: `RULES.md` (in evoluzione — il codice serve a **testare e modificare** le regole).
- Stato partita serializzabile; turni, mosse legali, bot, `simulateGame`.
- **Dura Mater chiusa:** quando l’**ingombro** delle carte posate raggiunge **N×N** (stesso criterio del limite posa: `boardBounds` larghezza e altezza entrambe = `N`). **Non** è “colonna/riga piena di N carte”.
- Inversione turno alla chiusura di ciascun **limite** della Dura Mater (primo asse fissato con fila/colonna di N carte, poi griglia N×N). Direzione `turnDirection` ±1 sull'ordine ciclico iniziale; due limiti nello stesso turno → effetto netto nullo.
- Funzioni utili: `boardFootprint`, `isDuraMaterDelimited`, `maybeCloseDuraMater`, `nextPlayerId`.

## UI gioco (`game.js` + `index.html`)

- Mano a destra (compatta) + **fascia in basso** con carte **grafiche grandi** (192×192 px) e **nome** sotto (`MPCardsNames.formatCardName`).
- Giocatori etichettati **Giocatore 1**, non G1.
- Tabellone: messaggi ingombro / chiusura in `#board-status`; riepilogo in modal Info.

## Test e deploy

```bash
cd "D:\Grok\projects\Dura Mater"
npm test
```

- `tests/core-regression.test.js` — include test chiusura / inversione turni.
- PartyKit: `ONLINE.md`, `scripts/prepare-partykit-static.ps1` (include `grafica/`, `card-art.js`, `card-names.js`).
- Istruzioni agenti: `AGENTS.md`. Versione: `package.json` + `version.js`.

## Storia recente (per contesto)

1. Migrazione da `DaClaude` a `Dura Mater`; gioco = `index.html`.
2. Mazzo finale utente (64 codici); rimossi mazzi `default`/`bis`/`pepe`.
3. Grafica: mappatura da `Carte.xlsx` (fix 28 carte sbagliate con mappatura per indice).
4. Nomi carte e ordine colori corretti (3ª cifra).
5. Regola **Dura Mater chiusa** + inversione turni; criterio chiusura corretto su **ingombro N×N**.

## Come riprendere

1. Aprire la cartella `D:\Grok\projects\Dura Mater` in Cursor.
2. Nuova chat: «Leggi `promemoria.md` e `RULES.md`; poi [task].»
3. Modificare solo file in questa cartella; aggiornare `RULES.md` se cambiano le regole.

## Giocabilità (provvisoria, giugno 2026)

- **Competitiva (normale):** tutte le combinazioni legali `G = 1 … 2N` — giocabili (sweep 58 celle, vittoria 74–100%).
- **Durissima core:** solo `G = N` su **3×3 e 4×4**; **5×5** molto difficile; **6×6+** estremo/epico; altre G = extra.
- Dettaglio in `RULES.md` (sezione «Giocabilità») e `scripts/BILANCIAMENTO-PAUSA.md`.
- **Test bilanciamento Durissima in pausa** — non eliminare i JSON in `tests/`.

## Focus attuale

- **Tornei a punteggio** — formalizzazione regolamento (prossimo task).

## Da sistemare (regole)

- **Pesca / monte (2026-06):** competitiva — pesca anche su pass; monte dopo G pass senza posate (anche con tallone pieno). Durissima coop — pesca solo dopo posata; stesso monte. Implementato in `mpcards-core.js` + `RULES.md`.
- **Durissima solitario:** regola monte / stallo senza compagni da rivalutare (quasi impossibile?); non in torneo, rinviato.

## Task tipici ancora aperti (opzionali)

- Retro `Back.jpg` in pesca / carte coperte.
- Affinare regole matrice in `RULES.md` vs implementazione (fissazione assi, confini).
- Multiplayer PartyKit (bozza in `party/server.js`).

---

*Ultimo aggiornamento promemoria: giugno 2026 — progetto ~v0.1.2.*