# INDICE â€” Artefatti probe e audit

File **pesanti o rigenerabili**: non in Git (vedi `.gitignore`). Le **conclusioni** vanno in `SESSIONI.md`; qui solo dove trovare i dati grezzi.

---


## Solo G=1 refill A/B (2026-07-19)

| File | Contenuto |
|------|-----------|
| `solo-refill-ab-2026-07-19.txt` | A/B refill ON vs OFF, N=3..8 equo early-abort |

**Script:** `temp-solo-refill-probe.js`, `temp-solo-refill-worker.js`  
**Sessione:** `SESSIONI.md` 2026-07-19.
## Refill Durissima G>1 (2026-07-18)

| File | Contenuto |
|------|-----------|
| `durissima-refill-ggt1-2026-07-18.txt` | Sweep 20 seed N=3..8 G>=2: overall 67.5%, G>=N 100%, G<N ~20% |
| `durissima-refill-hunt-ggt1-2026-07-18.txt` | Hunt: >=1 win su tutte le 21 celle G<N + seed documentati |

**Script:** `temp-durissima-refill-probe.js`, `temp-durissima-refill-worker.js`, `temp-durissima-refill-hunt.js`  
**Sessione:** `SESSIONI.md` voci 2026-07-18 (regola + hunt).

---

## `results/tournament-audit/` â€” Audit torneo Dura (2026-06-10)

| File | Contenuto | Dimensione indicativa |
|------|-----------|------------------------|
| `index.json` | Manifest delle 6 run N=3..8 | ~2 KB |
| `audit-N3-c300-planner.json` | 600 tornei, griglia 3x3 | ~16 KB |
| `audit-N4-c300-planner.json` | 1200 tornei, 4x4 | ~43 KB |
| `audit-N5-c300-planner.json` | 2100 tornei, 5x5 | ~125 KB |
| `audit-N6-c300-planner.json` | 3300 tornei, 6x6 | ~309 KB |
| `audit-N7-c300-planner.json` | 3900 tornei, 7x7 | ~455 KB |
| `audit-N8-c300-planner.json` | 4500 tornei, 8x8 | ~654 KB |
| `REPORT-definitivo.json` | Sintesi aggregata 52 celle | ~380 KB |
| `REPORT-definitivo.txt` | Sintesi leggibile (equita', monte, mani) | ~4 KB |

**Sessione:** `SESSIONI.md` voce 2026-06-10.
**Comando tipico:** workflow audit torneo / script dedicato (vedi `simulator-workflows-audit.js`).

---

## `tests/*.json` â€” Probe Durissima (2026-06-11 â€” 2026-06-19)

Output locali dei probe `durissima-*`, `diag-gn-*`, solver overnight. **Non eliminare** senza aver annotato conclusioni in `SESSIONI.md`.

| Pattern nome file | Script correlato | Note |
|-------------------|------------------|------|
| `dura-mater-durissima-l3-probe-*.json` | `durissima-l*-probe` | Probe livello/formato |
| `dura-mater-durissima-l4-probe-*.json` | idem | |
| `dura-mater-durissima-l5-probe-*.json` | idem | |
| `dura-mater-durissima-l6-selective-*.json` | `durissima-l6-selective-probe` | |
| `dura-mater-durissima-pool-N-sweep-*.json` | `durissima-pool-sweep` | Sweep pool reshuffle |
| `dura-mater-durissima-global-probe-*.json` | `durissima-global-probe` | Bot G=N |
| `dura-mater-durissima-global-matrix-*.json` | `durissima-global-matrix` | Matrice esiti |
| `dura-mater-durissima-gn-solver-*.json` | `durissima-gn-solver-probe` | Solver vs bot |
| `dura-mater-durissima-gn-solver-morph-*.json` | morphologia / CSP | Molti run L3-L5 |
| `dura-mater-durissima-gn-solver-overnight-*.json` | overnight solver | Run lunga |
| `overnight-solver-log.txt` | log testuale overnight | |

**Sessione:** `SESSIONI.md` voce 2026-06-11 â€” 2026-06-19.
**Non usare per:** decisioni di bilanciamento reshuffle/pool (vedi `TODO-SOLVER-DURISSIMA.md`).

---

## `results/ideal-layouts/` â€” Layout robusti Livello A (2026-07-09)

| File | Contenuto |
|------|-----------|
| `index.json` | Manifest run 3x3 + 4x4 |
| `layout-N3.json` / `.txt` | 160 soluzioni, top 10, regole morfologiche (118 mai centro, zone scambio) |
| `layout-N4.json` / `.txt` | 1.250.416 soluzioni, top 10 (swapPairs fino a 10) |
| `rules-export.json` | Regole compatte per planner (sync in `mpcards-core.js`) |
| `ab-probe-20deals.json` | Probe A/B ideal vs baseline (20 seed, 3x3/4x4) |

**Script:** `node scripts/analyze-ideal-layouts.js` â€” lib `scripts/ideal-layout-lib.js`, sync `scripts/sync-ideal-layout-rules.js`.
**Planner:** `GN_IDEAL_LAYOUT_RULES_DATA` in `mpcards-core.js`; disabilita con `GN_SKIP_IDEAL_LAYOUT=1`.
**Sessione:** `SESSIONI.md` voce 2026-07-09 layout ideali.

---

## Altri artefatti locali (non in Git)

| Path | Note |
|------|------|
| `Analisi-Mazzo-Dura-Mater.docx` | Documento editore; generato da `scripts/build-analisi-mazzo-docx.py` |
| `*.xlsx` (confronti, carte) | Esport simulatore / analisi |
| `terminals/`, `agent-tools/` | Cache Grok â€” cancellabili, non backup |

## 2026-07-11 â€” Report finale coordinatore One Mind (Durissima G=2..2N)

**File:** `results/Risultati_Durissima_Coordinatore_One_Mind.docx` (anche nella cartella fisica Dropbox)

**Contenuto:** Capitoli per N=3..8 con tabelle G=2..2N (solo combinazioni con >=3 carte in mano). Win% , tallone, mano, seed e spiegazioni. Overall 98.3% su tallone<=20. 8x2 a 4% (accettato come epico). Solitario marcato come regime separato.

**Sessione:** SESSIONI.md voce 2026-07-11 "Documento Word riassuntivo finale".

---

*Aggiornare questa tabella quando si aggiungono probe con nomi nuovi.*
