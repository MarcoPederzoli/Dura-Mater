# Promemoria — Dura Mater

**Per l'utente:** apri `grok` in questa cartella e di' cosa vuoi fare. Non serve ricordare file memoria — l'agente legge e aggiorna tutto da solo (`AGENTS.md`).

**Per l'agente:** leggere questo file e `SESSIONI.md` (ultime 5 voci) **prima** di ogni lavoro sul progetto.

## Percorso e vincoli

- **Cartella di lavoro:** `C:\Dev\Dura-Mater` (SSD locale, fuori Dropbox)
- Avvio consigliato: hub `Dropbox\Grok` + «Dura Mater **software**» (non «fisico»), oppure `cd` qui e `grok`.
- **Non** usare `DaClaude` (rimossa).
- SPA statica: **nessuna build obbligatoria**. Aprire `index.html` nel browser.

## Git / GitHub

- **Remote:** [https://github.com/MarcoPederzoli/Dura-Mater](https://github.com/MarcoPederzoli/Dura-Mater) — branch `master`.
- L’agente prepara commit e push; l’utente **non** usa VS Code per Git.
- **Prima di ogni push:** l’agente propone titolo (e, se serve, descrizione) del commit; l’utente approva o corregge. Push solo dopo ok.
- Convenzione attuale **rivedibile** (es. in futuro più libertà all’agente sui messaggi).
- Se `git push` fallisce per autenticazione scaduta, segnalarlo all’utente (ri-login GitHub Credential Manager).

## Progetto gemello — gioco fisico (Dropbox, separato)

Sviluppo **cartaceo** (grafica, stampa, regolamento Word, xlsx assegnazione carte):

`C:\Users\marco\Dropbox\Personale\FunStuff\Miei Giochi da Tavolo\17 - DURA MATER`

Ha il suo `promemoria.md` e `SESSIONI.md`. **Non** confondere con questo repo: qui e' solo **software** (simulatore, probe, `RULES.md` in codice). Allineare i due solo su richiesta esplicita.

## Cos’è il progetto (software)

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
| **1ª** | VALORE (1-8) → Asso … Otto in UI |
| **2ª** | FORMA (1-8) → Cerchi, Cuori, Triangoli, Quadrati, Stelle, Esagoni, **Lampi**, **Croci** |
| **3ª** | COLORE (1-8) → **1=Rosso, 2=Arancio, 3=Giallo, 4=Verde, 5=Azzurro, 6=Blu, 7=Viola, 8=Bianco** |

[!] ️ I colori **non** sono 1=Bianco … 8=Rosso (errore vecchio di Claude). La 3ª cifra segue la scala Rosso→Bianco sopra.

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
- **Dura Mater chiusa:** quando l’**ingombro** delle carte posate raggiunge **NxN** (stesso criterio del limite posa: `boardBounds` larghezza e altezza entrambe = `N`). **Non** è “colonna/riga piena di N carte”.
- Inversione turno alla chiusura di ciascun **limite** della Dura Mater (primo asse fissato con fila/colonna di N carte, poi griglia NxN). Direzione `turnDirection` ±1 sull'ordine ciclico iniziale; due limiti nello stesso turno → effetto netto nullo.
- Funzioni utili: `boardFootprint`, `isDuraMaterDelimited`, `maybeCloseDuraMater`, `nextPlayerId`.

## UI gioco (`game.js` + `index.html`)

- Mano a destra (compatta) + **fascia in basso** con carte **grafiche grandi** (1992 px) e **nome** sotto (`MPCardsNames.formatCardName`).
- Giocatori etichettati **Giocatore 1**, non G1.
- Tabellone: messaggi ingombro / chiusura in `#board-status`; riepilogo in modal Info.

## Test e deploy

```bash
cd "C:\Dev\Dura-Mater"
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
5. Regola **Dura Mater chiusa** + inversione turni; criterio chiusura corretto su **ingombro NxN**.

## Memoria del ragionamento

| File | Quando leggerlo |
|------|-----------------|
| `promemoria.md` | Stato **oggi** (questo file) |
| `SESSIONI.md` | Storia ipotesi/test/decisioni — **leggere le ultime voci** |
| `results/INDICE.md` | Dove trovare json/xlsx di probe |
| `scripts/TODO-SOLVER-DURISSIMA.md` | Cosa **non** rifare (probe, solver) |
| `scripts/HANDOFF-COORDINATORE-DURISSIMA.md` | **Ripresa bot Durissima** — una mente vs mazzo (2026-07-09) |

La chat Grok non e' persistente: il diario e' `SESSIONI.md` (su Git).

## Come riprendere (utente)

1. `cd` in questa cartella, `grok`.
2. Dire il task in linguaggio naturale («continuiamo il solver», «fixa il test X», ecc.).
3. L'agente carica contesto da questo file, `SESSIONI.md` e `RULES.md` **senza che tu lo chieda**.
4. A fine lavoro l'agente aggiorna `SESSIONI.md` e propone commit — **non devi ricordartelo**.

## Giocabilità (provvisoria, giugno 2026)

- **Dura (competitiva + torneo):** chiusa come prodotto — `G_min … 2N`, **nessun solitario** (`G = 1` escluso da UI e regole prodotto). Sweep `G >= G_min`: vittoria 74-100%.
- **Solitario:** solo **Durissima** (`G = 1`, griglia piena); **Dura solitario abbandonato** (giugno 2026). Regola extra solitario: **pool riserva N** (prime N del tallone, scoperte) — **non** in coop. Bilanciamento epico **chiuso** (lug 2026).
- **Durissima coop (G >= 2):** variante di riferimento **N reshuffle** (core + pool N). Coop consigliato `G = N`; **3x3/4x4** core; **5x5** molto difficile; **6x6+** estremo/epico. G legali `2..2N` (solitario G=1 a parte).
- Dettaglio in `RULES.md` e `scripts/BILANCIAMENTO-PAUSA.md`. JSON probe Durissima: non eliminare.

## Focus attuale

**Stato luglio 2026 — gioco RISOLTO (bilanciamento):** Dura competitiva chiusa; Durissima coop G>=2 chiusa (coordinatore TG); Durissima **solitario G=1** chiuso con **pool riserva N** + coordinatore (v0.1.7). Win% probe attuali (50-150 seed) sono **indicativi**, non definitivi per il prodotto.

### Prossima sessione (priorita' utente)

1. **Statistica solitario «seria»:** rifare probe con **molti piu' seed** (es. 1000+ per L, IC95 strette) su configurazione prodotto: G=1, riserva N ON, coordinatore ON, vita extra OFF. Script: `scripts/solo-coordinator-variant-probe.js` (estendere `--seeds` / worker 8). Obiettivo: percentuali epiche **statisticamente realistiche** (7x7, 8x8, curva 3x3-8x8).
2. **Regole mancanti:** scrivere/completare in `RULES.md` (e allineare Word fisico se richiesto) — dettaglio tavolo, solitario vs coop, testo giocatore.
3. **Web giocabile:** sistemare UI per **giocare** il prodotto (non solo simulare) — `gioco.html` human-first, varianti chiare, revamp select regole rinviato ma UX partita da rifinire.

- **Dura:** competitiva + torneo — **chiusa** (bot planner adeguato).
- **Durissima coop (G >= 2) — coordinatore "una mente vs mazzo":** **archiviata / risolta** (2026-07-11).
  - Metodo: piano dal pool noto (mani + tallone) con carte specifiche + strict follower con passi; per G > N anche safe prefix + relax endgame.
  - **G = N** (3x3 .. 8x8): **100%** (0 nodi, precomp/oracle + strict follow).
  - **G = 2 .. 2N** legali (mano iniziale >= 3): **98.3%** overall con tallone <= 20 (417/424 deal). G=N sempre 100%.
  - Casi epici accettati: **8x2** 4% (2/50); G molto basso + tallone enorme difficile per design.
  - Soglia pratica: tallone <= 12-15 quasi sempre ok; calo sotto 80% da tallone ~15-20 (peggio con mano piccola).
  - Codice: `mpcards-core.js`. Opt-out legacy: `GN_LEGACY_PER_PLAYER=1`. Layout ideali in pausa: `GN_SKIP_IDEAL_LAYOUT=1`.
- **Durissima Mater solitario** (G = 1): **risolto** (v0.1.7). Pool riserva N **integrato in prodotto** (automatico G=1); coordinatore una mente; 7x7 ~5%, 8x8 ~1%. Vita extra opzionale in UI (non default). **Non** usare il nome "Nefanda Mater" (scartato).
- **Artefatti:** `results/Risultati_Durissima_Coordinatore_One_Mind.docx` + copia in Dropbox `17 - DURA MATER\`. Report precedente: `Report_Solvibilita_Dura_Durissima.docx`.
- **In pausa:** layout ideali come linea principale. Handoff 2026-07-09 (`scripts/HANDOFF-COORDINATORE-DURISSIMA.md`) superato dalla chiusura G>=2.
- **Da definire (torneo):** punteggio bersaglio per G molto alto (es. 16).
- **Editore:** integrare tabella configurazioni finali in `Analisi-Mazzo-Dura-Mater.docx`.

## Da sistemare (regole)

- **Pesca / monte (2026-06):** competitiva — pesca anche su pass; monte dopo G pass senza posate (anche con tallone pieno). Durissima coop — pesca solo dopo posata; stesso monte. Implementato in `mpcards-core.js` + `RULES.md`.


## Task tipici ancora aperti (opzionali)

- Retro `Back.jpg` in pesca / carte coperte.
- Affinare regole matrice in `RULES.md` vs implementazione (fissazione assi, confini).
- Multiplayer PartyKit (bozza in `party/server.js`).

---

*Ultimo aggiornamento promemoria: 2026-07-11 — Gioco risolto; riserva N in prodotto (v0.1.7); prossimo: probe seed massivi, regole, web gioco.*
---
*2026-07-15:* Coordinatore G>=N **unificato** (N=3..8): griglia A + assembly owned-first multi-start + fingi minLate + follow strict. Test 155/155 = 100% (`temp-gn-unified-test.js`). G<N ancora da fare.
