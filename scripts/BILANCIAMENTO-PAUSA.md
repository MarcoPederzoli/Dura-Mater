# Bilanciamento Durissima — pausa (giugno 2026)

Campagna **sospesa** per varianti diverse da **N reshuffle** (riserva, buffer, core puro, ecc.). I risultati restano in repo; non cancellare i JSON in `tests/` né gli script probe.

## Variante di riferimento: **N reshuffle**

Partite Durissima (prodotto, sim, probe): **core Durissima** + pool **N reshuffle** a partita (N = lato griglia). Default engine con `durissimaMater: true`. Opt-out esplicito: `durissimaVitaExtraEnabled: false` (solo per confronti storici).

- Bot: `durissima-planner` (solitario) / `durissima-team-planner` (coop).
- Reshuffle volontario a inizio turno (strategico; 1 per decisione se la migliore mossa e' «fatale»).
- **Ambito G:** `1 .. 2N` legali; **nessun** `G_min` competitivo in Durissima.
- Probe 11/06/2026: L=3, 4x4, 5x5 — vedi tabelle sotto.

## Storico: core puro (senza N reshuffle)

Probe giu 2026, **non** riferimento prodotto. `durissimaVitaExtraEnabled: false`.

- Durissima coop: `durissima-team-planner`; solitario: `durissima-planner`.
- Pesca solo dopo posata; nessun pool / riserva / buffer.

## Export principali

| File / script | Contenuto |
|---------------|-----------|
| `tests/dura-mater-classic-sweep-*.json` | Competitiva: tutte le celle L x G legali (58), vittoria 74-100% |
| `tests/dura-mater-durissima-rules-probe-2026-06-09-23-40-04.json` | Durissima semplice + team, 15 celle x 300 |
| `tests/dura-mater-durissima-riserva-team-probe-2026-06-10-11-53-53.json` | Riserva post-deal + team, 15 celle x 300 |
| `tests/dura-mater-durissima-l4-probe-2026-06-11-15-00-38.json` | Pool N, 4x4 tutte G legali, 1000 partite/cella |
| `tests/dura-mater-durissima-l5-probe-2026-06-11-15-13-10.json` | Pool N, 5x5 G1-8 (cap 10), 500 partite/cella |
| `tests/dura-mater-durissima-l3-probe-2026-06-11-14-54-46.json` | Pool N, L=3 (3x1/3x2/3x3), 400 partite/cella |
| `scripts/durissima-grid-probe.js` | Probe CLI per griglia L (`node scripts/durissima-grid-probe.js 5 500 --g-max 10`) |
| `scripts/durissima-l4-probe.js` | Probe dedicato 4x4 (legacy; preferire `durissima-grid-probe.js`) |
| `scripts/durissima-pool-sweep.js` | Sweep parallelo L3-8, Durissima senza G_min |
| `scripts/compare-durissima-vita-modes.js` | A/B reattivo vs strategico (vita extra) |
| `scripts/durissima-rules-probe-check.js` | Probe CLI baseline (`--full`, `--riserva`) |
| `scripts/build-confronto-varianti-durissima-xlsx.py` | Confronto varianti storiche |
| `confronto-varianti-durissima.xlsx` | Tabella varianti |

## G=N — numeri storici (core puro, 300 partite)

| Formato | Successo griglia piena |
|---------|------------------------|
| 3x3 | ~10% |
| 4x4 | ~7% |
| 5x5 | ~2% |
| 6x6 | ~0,3% |
| 7x7, 8x8 | ~0% |

## N reshuffle — 4x4 (1000 partite/cella)

Tutte le G legali (5x6, 5x7, 5x8 illegale su 4x4: < 3 carte a testa).

| Cella | OK % | Vita med (su 4) | Turni med |
|-------|------|-----------------|-----------|
| 4x1 solitario | 13,1% | 3,62 | 10,7 |
| 4x2 | 13,4% | 3,51 | 12,1 |
| 4x3 | 10,4% | 3,58 | 13,5 |
| 4x4 G=N | 10,0% | 3,60 | 15,3 |
| 4x5 overcrowd | 7,1% | 3,72 | 17,4 |

**Lettura:** il bot completa il 4x4 in tutte le configurazioni (7-13%). G=N ~10% (sopra il core puro ~7%).

## N reshuffle — 5x5 (500 partite/cella, G1-8)

Cap richiesto G <= 10; **5x9 e 5x10** escluse (2 carte a testa, illegale).

| Cella | OK % | Vita med (su 5) | Turni med |
|-------|------|-----------------|-----------|
| 5x1 solitario | 3,4% | 4,90 | 16,1 |
| 5x2 | 3,2% | 4,87 | 17,6 |
| 5x3 | 5,0% | 4,75 | 18,3 |
| 5x4 | 1,2% | 4,94 | 20,1 |
| 5x5 G=N | 1,4% | 4,93 | 22,1 |
| 5x6 overcrowd | 1,8% | 4,91 | 24,3 |
| 5x7 overcrowd | 1,6% | 4,92 | 26,2 |
| 5x8 overcrowd | 2,4% | 4,88 | 28,4 |

**Lettura:** completamento 1-5% (G=N ~1,4%, in linea con baseline ~2%). Vita extra quasi satura (~4,9/5). Togliere `G_min` non rende il 5x5 «facile»; resta **molto difficile** come in `RULES.md`.

## N reshuffle — L=3 (400 partite/cella)

| Cella | OK % | Vita med |
|-------|------|----------|
| 3x1 | 22,5% | 2,56 |
| 3x2 | 18,5% | 2,44 |
| 3x3 G=N | 12,5% | 2,63 |

## Ripresa

**Prima lettura obbligatoria:** `scripts/BOT-STRATEGIA-GN.md` (stato bot G=N, commit, livelli A/B/C, checklist riaccensione PC).

Quando si riprende: aggiornare questa nota, `BOT-STRATEGIA-GN.md`, `RULES.md` (sezione giocabilita') e i workflow in `simulator-workflows-durissima.js`. **Non** ripartire con sweep massivi sui bot attuali: vedi sezione «Metodo probe» sotto.

**Stato giu 2026 (global-planner):** 6x6 G=N 3/3; 7x7 1/3 (seed 0 chiuso); commit `d3747c8`. Seed 7x7 1-2 congelati; esplorazione G!=N priorita' Livello A (vedi BOT-STRATEGIA-GN).

---

## Metodo probe: cosa e' valido e cosa no (appunti giu 2026)

### Errore metodologico

Giorni di simulazione con `durissima-planner` / `durissima-team-planner` sono stati usati per inferire **giocabilita' del mazzo** e tarare regole (pesca, reshuffle, hand-cap, free-draw). **Non e' lecito.**

I bot attuali:

- pianificano al massimo **un turno** (`maxChainPlays`, ~280 nodi, campione ~12 rami);
- in coop **non** modellano la «mente unica» (unione mani, piano su piu' turni);
- su G=N (tutto in mano, no tallone) il reshuffle quasi non interviene;
- le varianti regolamento cambiano i numeri di **pochi punti** perche' il comportamento resta greedy locale.

**Conclusione:** `% vittoria bot` = qualita' software / strategia IA, **non** difficolta' intrinseca del puzzle ne' bilanciamento del mazzo fisso (`SIM_DECK_CODES`).

### Cosa usare al posto del bot per il bilanciamento

| Strumento | Misura | Uso |
|-----------|--------|-----|
| **Solver G=N** (`durissima-gn-solver-probe.js`) | Risolvibilita' sotto regole complete (4 pose/turno, DM, rotazione) | Plafond teorico macchina; confronto con bot sullo **stesso deal** |
| **God-hand probe** (`durissima-god-hand-probe.js`) | Tetto del bot attuale con tutte le carte in una mano | Capire quanto fallisce la sola miopia, senza distribuzione coop |
| **G=N coop senza reshuffle** | Puzzle quasi puro | Coerente con tavolo cooperativo ideale |
| **Umani al tavolo** | Giocabilita' percepita, errori reali | Obiettivo prodotto per Durissima coop |
| **Analisi combinatoria storica** (ordini / soluzioni per mazzo) | Quante soluzioni esistono | Giustifica aspettativa «quasi sempre risolvibile» con gioco perfetto |

### Cosa **non** usare (fino a nuovo bot)

- Sweep `durissima-grid-probe.js` / workflow simulator per decidere se 5x5 e' «giocabile» o «epico»
- Confronti hand-cap / free-draw / core puro come proxy di bilanciamento
- Etichette in `RULES.md` derivate solo da `% bot` (es. 5x5 al 1% = impossibile)

### Numeri chiave (stesso periodo, giu 2026)

**Bot vs solver G=N** (deal identici, no reshuffle):

| Formato | Bot team | Solver DFS+memo | Nota |
|---------|----------|-----------------|------|
| 4x4 G=N (30 deal) | 6,7% | **93,3%** | 26 deal: bot fallisce, solver ok |
| 5x5 G=N (50 deal, 800k nodi max) | 2,0% | **20,0%** | 40 deal: budget solver esaurito (non «impossibile» certificato) |

**God-hand** (tutte le carte in mano, bot `durissima-planner`, no reshuffle):

| Formato | OK % | Pos med |
|---------|------|---------|
| 4x4 | 30,6% | 15,2/16 |
| 5x5 | 20,2% | 24,0/25 |

**Interpretazione:** il mazzo non «uccide» il 5x5 da solo; il bot si ferma spesso a 24/25. Il solver minimale al 4x4 dimostra che il vincolo **4 carte/turno** e' gestibile con **pianificazione multi-turno**, non con catene greedy nel turno corrente.

### Scala difficolta' prodotto (riferimento umano, non bot)

- **~5%** successo solitario = «difficile ma sensato» (target 3x3 / 4x4)
- **~1%** accettabile solo per sfida dichiarata **8x8** / epico
- **5x5 G=N coop** con dialogo: aspettativa **quasi sempre vincibile** salvo errori umani — **non** coerente con 1-2% bot

I probe bot sul 5x5 misuravano l'IA, non il formato.

---

## Mazzo come grafo (proprieta' utili per il nuovo bot)

Script: `scripts/deck-compat-graph.js`

**Grafo di compatibilita' carte:** arco se le due carte condividono >= 1 tratto (valore / forma / colore), come in posa.

| N | n carte | Densita' archi | Grado min / med / max | Componenti |
|---|---------|----------------|------------------------|------------|
| 3 | 9 | 0,64 | 3 / 5,1 / 7 | 1 |
| 4 | 16 | 0,56 | 5 / 8,4 / 11 | 1 |
| 5 | 25 | 0,49 | 8 / 11,8 / 16 | 1 |
| 8 | 64 | 0,41 | 14 / 25,7 / 34 | 1 |

- **Connesso** (una componente) per ogni N: nessuna carta isolata in astratto.
- **Grado minimo** cresce con N: partner compatibili abbondanti (coerente con molte soluzioni combinatorie).
- Il mazzo e' stato costruito per **poche coppie con 2+ tratti** in comune (`PROMPT.md`).

**Non basta per giocare:** il puzzle e' **embedding su griglia NxN** + requisiti 1-2-3-4 per turno + max 4 pose/turno + Dura Mater. Teoria grafi utile per:

- **rigidita' / flessibilita'** carta (grado nel grafo compatibilita'; gia' parziale in `compatibilityScore` e valori scarsi 1-2-3);
- **grado atteso cella** a griglia piena (angolo 2, bordo 3, interno 4) -> mappa carta rigida -> angolo;
- **CSP / matching** frontiera-carte (assegnazione vincolata), non formula chiusa «connesso => sempre risolvibile».

---

## Morfologia mazzo: cubo 8x8x8 (appunti pianificazione)

Script: `scripts/deck-cube-morphology.js`

### Modello

- Ogni carta = punto **sparso** in `[0..7]^3` (assi: **valore X**, **forma Y**, **colore Z**), non tutti i 512 vertici esistono — solo **64** codici in `SIM_DECK_CODES`.
- Frequenza per livello su **ogni asse** (marginali): `1, 3, 5, 7, 9, 11, 13, 15` (= `POSITIONAL_COUNTS` in `mpcards-core.js`). L'8 (valore/alto colore/alta forma) e' il piu' «denso».
- **Compatibilita' gioco** (almeno un tratto uguale): due punti sulla **stessa linea parallela** a un asse (stesso valore, forma diversa, colore diverso) sono compatibili ma in generale **non** adiacenti nel cubo.
- **Adiacenza cubo** (cambio di **esattamente una** coordinata): condizione **piu' stretta**; al 5x5 solo ~**7%** delle coppie compatibili sono anche cubo-adiacenti (~49% coppie compatibili totali).

### Intuizione confermata dai dati

- Carte con coordinate «alte» sugli assi hanno in media **piu' vicini** nel grafo compatibilita' (correlazione r ~ **0,62** al 5x5 tra somma `POSITIONAL_COUNTS` dei tre assi e grado).
- Carte con tratti **rari** (1, 2, 3 su un asse) = **rigide** — pochi partner; vanno verso celle a **basso grado** sulla griglia (angoli/bordi). Coerente con `DURISSIMA_SCARCE_VALUES` e `compatibilityScore`.

### Minimizzazione percorsi sul cubo: cosa e' fattibile

| Idea | Fattibile? | Uso |
|------|------------|-----|
| Percorso hamiltoniano sul cubo 8^3 | No (mazzo sparso; molte compatibilita' non sono archi cubo) | — |
| Percorso sul **grafo compatibilita'** (tutte le coppie con tratto comune) | Parziale | Ordinare consumo carte; non impone geometria griglia |
| **Distanza L1** tra coordinate cubo di carte **adiacenti sulla griglia** | Si, come **costo** | Preferire vicini di griglia che condividono tratto «vicino» anche nel cubo (posa «morbida») |
| **Fibre / slice** per valore (o forma/colore) | Si | Pianificare a strati: «prima consumiamo il fibrato valore 3», ecc. |
| Embedding griglia <- cubo | No in chiuso | Il passo duro resta CSP spaziale + 4 pose/turno |

**Proposta operativa per il global planner:** non un solo percorso nel cubo, ma (1) **priorita' di consumo** = funzione delle tre coordinate (es. `w = 1/cnt(val) + 1/cnt(forma) + 1/cnt(colore)`); (2) **penalita' morph** quando due carte adiacenti in griglia condividono un solo tratto e sono lontane in L1 sul cubo; (3) **matching** carte rimanenti alle celle della frontiera per grado compatibile.

---

## Direzione bot (da fare prima di nuovi sweep)

1. **`durissima-global-planner`** (in core): coop G=N = pool unico `NxN` carte, ricerca multi-turno con morfologia cubo (`solveGnBestAction` in `mpcards-core.js`; script `durissima-gn-solver-lib.js` resta per probe batch). Fallback su `durissima-team-planner` se non G=N ideale o budget solver esaurito.
2. **Strato mazzo precomputato per N:** matrice compatibilita', ordinamento consumo carte (rigide dopo / angoli prima).
3. **Probe bilanciamento:** solo quando bot G=N si avvicina al solver (es. 4x4 >= 80% sullo stesso campione).
4. Bot legacy + reshuffle: restano per modalita' con tallone / solitario con pool N, ma **non** per tarare G=N coop.

### Varianti sperimentali (non usare per bilanciamento)

| Variante | Flag / script | Esito |
|----------|---------------|-------|
| Hand-cap N / 2N | `--hand-cap`, `--hand-cap-2n` | Non compensa assenza reshuffle; in pausa |
| Free-draw + N reshuffle | `--free-draw` | Quasi invariato finche' bot non sfrutta pass; fix pass coop insufficiente |
| N reshuffle selettivo | default bot | Su L>=6 non batte reshuffle totale (probe A/B) |

### Script e JSON aggiuntivi (giu 2026)

| Path | Ruolo |
|------|-------|
| `scripts/deck-morphology-lib.js` | Rigidita', L1 cubo, fit cella per ordinamento mosse |
| `scripts/durissima-gn-solver-lib.js` | DFS + memo + morfologia (default on) |
| `scripts/durissima-gn-solver-probe.js` | Bot vs solver morph vs solver base (`L count maxNodes`) |
| `scripts/durissima-god-hand-probe.js` | God-hand + G=N bot senza reshuffle |
| `scripts/deck-compat-graph.js` | Statistiche grafo compatibilita' mazzo |
| `tests/dura-mater-durissima-gn-solver-L4-*.json` | 4x4 bot 7% vs solver 93% |
| `tests/dura-mater-durissima-gn-solver-L5-*.json` | 5x5 bot 2% vs solver 20% |
| `mpcards-core.js` | `durissimaCompetitiveDraw`, `durissimaHandDrawCap`, export `durissimaMoveIsFatal` |

---

## Checklist ripresa bilanciamento

1. Implementare / integrare global planner G=N.
2. Verificare 4x4 G=N: bot >= 80% vs solver sullo stesso campione (o spiegare il gap).
3. Solo allora: nuova campagna probe regole (reshuffle, pesca, L=3..8).
4. Aggiornare `RULES.md` (giocabilita') con numeri **solver + umani**, non solo bot legacy.