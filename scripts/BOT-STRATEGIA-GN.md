# Strategia bot G=N e ripresa lavoro (giugno 2026)

Documento di riferimento per **non perdere il filo** dopo spegnimento PC o pausa lunga.
Collegato a `scripts/BILANCIAMENTO-PAUSA.md` (storico probe reshuffle / errori metodologici).

---

## 1. Perche' serve il bot G=N

Pipeline obiettivo:

```
Bot G=N credibile (formati 3..8)
  -> simula molte partite (seed diversi)
  -> metriche: % chiusura, stalli, turni, celle vuote
  -> confronto varianti regolamento (reshuffle? pool? vite? G!=N)
  -> decidere se il gioco e' proponibile
```

**Non serve** un bot imbattibile come gli scacchi moderni.
**Serve** un bot **abbastanza forte e stabile** che le **differenze relative** tra regola A e B siano affidabili (bias coerente), non il 49/49 su ogni deal.

Confusioni da evitare:

| Concetto | Significato |
|----------|-------------|
| Bot chiude 49/49 | Quel deal (seed) e' **risolvibile**; il bot ha trovato una chiusura |
| Bot fermo a 47/49 | Il deal **puo'** essere ancora risolvibile; spesso e' il bot che sbaglia strada |
| Bot-check 3/3 | Regressione su **3 scenari fissi**, non garanzia su seed 4+ |
| `durissima-planner` (1 turno) | **Non** usare per bilanciamento G=N (vedi BILANCIAMENTO-PAUSA) |
| `durissima-global-planner` | Bot G=N multi-turno: patch, forced, rollout, solver endgame |

---

## 2. Stato al commit `d3747c8` (master, pushato)

**Ultimo commit:** `G=N 7x7: seed 0 chiuso (49/49), morfologia 9-patch, probe e diagnosi`

### Bot-check G=N (`durissima-global-planner`, no reshuffle, no tallone)

Comando: `node scripts/durissima-gn-bot-check.js 7 3` (1 worker, lock probe pesante)

| Formato | Bot-check (seed 0-2) | Note |
|---------|----------------------|------|
| **6x6** | **3/3** (36/36) | Chiuso in commit precedente `b1016e6` |
| **7x7** | **1/3** (49/49 solo seed 0) | Seed 1: 47/49 `(5,2)(6,2)`; seed 2: 47/49 `(6,3)(6,5)` |
| 5x5 | Non certificato con global-planner 3/3 | Solver/god-hand in BILANCIAMENTO-PAUSA |
| 3x3, 4x4 | Planner esiste; probe global meno estremi | Utili per Livello A |

### Morfologia 7x7 (definitiva)

- **9-patch:** centro 3x3 -> 4 lati 3x3 -> 4 angoli 3x3 (default, `GN_7X7_MORPH=9patch`)
- **Scartate:** cornici 5+7 (`frames`), riordini patch: peggiorano i fill
- Override: env `GN_7X7_MORPH` = `9patch` | `frames` | `corners-first` | `outer-first` | `phased`

### Fix chiave 7x7 seed 0

- Step ~45: `gnTryForcedMove` giocava `118@(4,4)` prima della strategia patch
- Mossa vincente sicura: `766@(1,3)`
- Fix in `chooseDurissimaGlobalAction`: conflitto **forced vs patch** (vuote 20-30; rank +14 in 22-24; rollout deterministico opzionale)

### Cosa resta in locale (NON nel commit `d3747c8`)

Modifiche non committate: `AGENTS.md`, `RULES.md`, `scripts/BILANCIAMENTO-PAUSA.md`, probe pool/grid, decine di script `diag-gn-*` aggiuntivi, JSON in `tests/`, `Regolamento-Dura-Mater.docx`, ecc.
**Il core 7x7 e i diag essenziali sono su GitHub.**

---

## 3. Tre livelli obiettivo (decisione prodotto)

### Livello A — Esplorare G!=N (priorita' per sbloccare il gioco)

- Bot «abbastanza buono» su **4x4, 5x5, 6x6**
- Metriche su **20-50 seed** (non solo 3): % success, fill medio, stalli
- Confronto A/B regole (reshuffle, pool, vite): serve **stesso bot**, stessi seed, regola diversa
- **Non** richiede 49/49 su ogni seed

### Livello B — G=N certificato per formato

- Bot-check N/N su campione ampliato + fix mirati (come seed 0 del 7x7)
- Target realistico: **6x6 fatto**; **5x5** prossimo; **7x7** best-effort documentato

### Livello C — Ricerca / epico

- 7x7 3/3, 8x8: solo se il prodotto richiede il formato epico in RULES.md
- Probe lenti (ore per seed); **un solo probe pesante alla volta** (lock `.heavy-probe.lock`)

**Per rendere il gioco proponibile non serve Livello C.** Serve Livello A su formati core + onesta' su 7x7 epico.

---

## 4. Script e comandi (ripresa rapida)

| Script | Uso |
|--------|-----|
| `node scripts/durissima-gn-bot-check.js L [deal]` | Verifica ufficiale G=N (default 1 worker) |
| `node scripts/diag-gn-stall.js L seed` | Una partita: fill finale e celle vuote |
| `node scripts/diag-gn-find-first-win.js L seed [from] [to]` | Primo step con mossa sicura -> 49/49 |
| `node scripts/diag-gn-morph-bench.js [deals]` | Confronto morfologie 7x7 |
| `node scripts/diag-gn-fatal-turn.js L seed` | Primo step irrecuperabile (matching) |
| `node tests/core-regression.test.js` | Regressione veloce |

Probe pesanti: vedi `AGENTS.md` (lock, 1 worker default, no probe paralleli).

Variabili utili:

- `GN_SKIP_ROLLOUT7=1` — diagnostica veloce, **diverge** dal path reale
- `GN_7X7_MORPH=9patch` — morfologia patch 7x7

---

## 5. Prossimi passi consigliati (ordine)

1. **Non** rilanciare sweep da 72 ore su 7x7 senza obiettivo (es. `find-first-win` seed 1 solo, non tutto 1-80 in loop).
2. **Livello A:** bot-check / stall su **5x5** e **4x4** con global-planner, 10-20 seed, tabella fill%.
3. Se serve G!=N: confronto reshuffle usando **6x6** (bot affidabile) come pilota.
4. **7x7 seed 1-2:** solo se serve Livello B/C — `find-first-win` mirato; fix tipo forced-vs-patch per step trovato (come seed 0).
5. Aggiornare `RULES.md` giocabilita' solo da numeri **Livello A**, non da bot 1-turno.

---

## 6. Checklist «riaccendo il PC»

- [ ] `git pull` su `master` (commit >= `d3747c8`)
- [ ] Leggere questo file + sezione «Metodo probe» in `BILANCIAMENTO-PAUSA.md`
- [ ] `node tests/core-regression.test.js`
- [ ] Stato rapido: `node scripts/diag-gn-stall.js 6 0` e `7 0` (opzionale, lento)
- [ ] Decidere: **Livello A** (G!=N) vs **Livello B** (chiudere 5x5/7x7)
- [ ] Un solo probe pesante; verificare assenza lock: `scripts/.heavy-probe.lock`

---

## 7. Domanda aperta (onesta')

Non e' dimostrato che un bot euristico chiuda **tutti** i deal G=N 3-8, ne' che comporti gli umani.
Il solver DFS su deal singoli resta piu' forte del bot su 4x4/5x5 (vedi tabelle in BILANCIAMENTO-PAUSA).
La strategia pragmatica: **bot per sweep comparativi** + **solver su campione** per tetto teorico + **umani** per giocabilita' percepita.

---

*Aggiornare questo file a ogni milestone bot (commit dedicato o sezione qui).*