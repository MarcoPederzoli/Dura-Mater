# TODO — Solver e bot Durissima (futuro)

Lista di lavoro per quando si riprende il progetto.  
Contesto: probe regole (scarti, reshuffle, hand-cap) e tentativi 7×7 god-hand **non sono conclusivi** finche' il bot non separa i livelli del problema.

Ultimo aggiornamento: 2026-07-09.

---

## Priorita' 0 — Non fare (fino a nuovo bot)

- [ ] Usare `durissima-grid-probe` / sweep simulator per decidere bilanciamento regole (scarti, n-reshuffle, hand-cap).
- [ ] Interpretare `% vittoria bot` come difficolta' intrinseca del mazzo o del formato.
- [ ] Certificare formati su 3 seed (es. 7×7 1/3): campione troppo piccolo per qualsiasi conclusione.
- [ ] **Attaccare Livello C con piani Livello A+B** (griglia+assembly senza mani): direct follower 7x7 = 1 mossa media — vedi `SESSIONI.md` 2026-07-09 chiusura e report `Report_Solvibilita_Dura_Durissima.docx`.
- [ ] Sweep / full DFS 7/8 «per risolvere il bot» senza piani **player-aware** o salto CP-SAT.
- [ ] Patch euristiche al global-planner senza validare allineamento piano-mani sul deal.

**Prima di riprendere (anche con Grok 4.5):** leggere report `.docx` + voce SESSIONI chiusura 2026-07-09.

---

## Priorita' 1 — Scomporre il problema (modello mentale)

Tre livelli **da tenere separati** in codice, test e documentazione:

| Livello | Domanda | Strumento target |
|---------|---------|------------------|
| **A — Incastro** | Le N² carte si posano su N×N con >=1 tratto in comune ai vicini? | CSP / backtracking con propagazione |
| **B — Schedulazione** | Esiste una sequenza di **turni** legali (max 4 pose, req 1→2→3→4, Dura Mater) che realizza quell'incastro? | Scheduler su piano A |
| **C — Partita** | Deal, mani, pesca, coop, reshuffle/scarti | Bot giocabile + metriche umane |

Riferimenti esistenti: `BILANCIAMENTO-PAUSA.md`, `BOT-STRATEGIA-GN.md`, `durissima-gn-solver-probe.js`, `durissima-god-hand-probe.js`.

---

## Priorita' 2 — Oracolo livello A (ragionamento giugno 2026)

**Thought experiment:** solitario con pool di tutte le N² carte scoperte, nessun limite di pose/turno — solo incastro compatibilita'.

- [x] Prototipare solver CSP minimo (MRV + forward checking) su mazzo fisso `SIM_DECK_CODES`. **Fatto 2026-07-09** in `deck-grid-solution-count-lib.js` + `durissima-matrix-solver.js` (bitmask, propagate, MRV).
- [x] Output: `solvibile sì/no` + una griglia esempio (se sì). **Fatto**: `findOneSolutionForSize` + `findSchedulableMatrix`.
- [ ] Campione: almeno **20–50 seed** per N = 3..8 (non 3 seed). (oracoli veloci ora, facile ampliare).
- [x] Confronto atteso: livello A quasi sempre sì per N ammessi. **Confermato** — tutte le griglie 3..8 hanno soluzioni, e assembly B pure.

Non confondere con god-hand attuale (quello e' ancora livello B). Livello A+B ora ha oracolo forte e veloce (ms per 8x8).

---

## Priorita' 3 — Scheduler livello B

- [x] Dato un incastro A, decidere se esiste **linearizzazione in turni** (<=4 pose, progressione requisiti, DM). **Fatto** 2026-07: `findSchedulableAssembly` in nuovo solver (DFS con supporto >= req, end turn flessibile).
- [ ] Riutilizzare/estendere `solveGnStateOutcome` / `durissima-gn-solver-lib.js` (4×4: bot ~7% vs solver ~93% sullo stesso deal — gia' documentato). (Integrazione target A+B nel planner globale da fare).
- [x] Benchmark 5×5, 6×6, 7×7, 8×8 ... **Fatto** (tutti schedulabili in ms con il nuovo oracolo A+B separato; il solver DFS completo resta per ownership mani).

---

## Priorita' 4 — Bot nuovo (architettura)

Sostituire il «labirinto» euristico (`durissima-planner` / patch ad hoc) con pipeline:

1. [x] **Piano globale A+B** — incastro + assembly (`durissima-matrix-solver.js`). **Fatto** per griglia ideale.
1b. [ ] **Piano player-aware** — stesso deal: mani, ordine turni, DM. **Blocco attuale su 7/8** — prerequisito prima di bot C.
2. [x] **Turnizzazione** — pacchetti <=4 mosse (`findSchedulableAssembly`). **Fatto** su piano A.
3. [~] **Esecuzione C** — partita reale: mani, ordine giocatori, pesca.
   - [x] **Coordinatore squadra** (2026-07-09): una mente vs mazzo in `mpcards-core.js` — `chooseDurissimaCoordinatedAction`, DFS con pass coop. Handoff: `scripts/HANDOFF-COORDINATORE-DURISSIMA.md`.
   - [ ] Win% 4x4+ ancora insufficiente; serve passo **1b** integrato nel coordinatore.
   - Oracle parziale (`durissima-gn-oracle.js`); 7/8 in pausa finche' 4x4 non migliora.

Idee gia' nel core: patch 7×7/8×8 (agganciata al coordinatore), `gnTryForcedMove`, rollout. **Non** estendere patch senza piano player-aware sul deal.

---

## Priorita' 5 — God-hand e G=N (metriche corrette)

Numeri di riferimento (100 partite, `durissima-planner`, giu 2026):

- 3×3 god-hand ~15%, 4×4 ~32%, 5×5 ~19% (pos med 24/25).

- [ ] God-hand + **solver B** (non planner): atteso ~100% al 4×4 se incastro+schedule esistono.
- [ ] 7×7: oltre seed 0, campione ampliato + `find-first-win` mirato (non sweep 72h).
- [ ] 8×8: trattare come ricerca (Livello C in `BOT-STRATEGIA-GN.md`), non come probe regole.

---

## Regola Idea cieca (giugno 2026, in codice)

- Quinta carta dopo 4 pose: **a faccia in giu'**, solo adiacenza + limiti Dura Mater; jolly = buco/bordo per legami (`ideaBlind` in `mpcards-core.js`).
- Documentazione: `RULES.md`, `REGOLAMENTO-DURA-MATER.md`.
- Test schedulabilita' con bot che punta al turno da 4: da fare.

## Priorita' 6 — Variante «scarti e N reshuffle» (in sospeso)

Implementata in `mpcards-core.js` (`durissimaScartiNReshuffle`); probe preliminari **non affidabili** senza bot.

- [ ] Difetto strutturale: dopo ultimo riciclo, scarti **persi per sempre** (su G=N tallone 0 e' critico).
- [ ] Riprovare confronto regole solo dopo Priorita' 2–4 (stesso bot, stessi seed).
- [ ] Esperimento futuro opzionale: scartare piu' di 1 carta prima del rimpingo (fino a mano intera).

---

## Priorita' 7 — Documentazione e git

- [ ] Aggiornare `RULES.md` giocabilita' da numeri **Livello A/B**, non da `% bot`.
- [ ] Tenere `SIMULATOR.md`: Durissima coop in sim = G=1 equivalente; G>1 non e' partita reale.
- [ ] Commit pendente variante scarti + test regressione (se non gia' pushato).

---

## Comandi utili (ripresa rapida)

```text
node scripts/durissima-god-hand-probe.js 100
node scripts/durissima-gn-bot-check.js L [deal]
node scripts/diag-gn-stall.js L seed
node scripts/deck-compat-graph.js
node tests/core-regression.test.js
```

Probe pesanti: un solo job alla volta, lock `.heavy-probe.lock` (vedi `AGENTS.md`).