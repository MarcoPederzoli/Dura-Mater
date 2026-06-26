# INDICE — Artefatti probe e audit

File **pesanti o rigenerabili**: non in Git (vedi `.gitignore`). Le **conclusioni** vanno in `SESSIONI.md`; qui solo dove trovare i dati grezzi.

---

## `results/tournament-audit/` — Audit torneo Dura (2026-06-10)

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

## `tests/*.json` — Probe Durissima (2026-06-11 — 2026-06-19)

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

**Sessione:** `SESSIONI.md` voce 2026-06-11 — 2026-06-19.
**Non usare per:** decisioni di bilanciamento reshuffle/pool (vedi `TODO-SOLVER-DURISSIMA.md`).

---

## Altri artefatti locali (non in Git)

| Path | Note |
|------|------|
| `Analisi-Mazzo-Dura-Mater.docx` | Documento editore; generato da `scripts/build-analisi-mazzo-docx.py` |
| `*.xlsx` (confronti, carte) | Esport simulatore / analisi |
| `terminals/`, `agent-tools/` | Cache Grok — cancellabili, non backup |

---

*Aggiornare questa tabella quando si aggiungono probe con nomi nuovi.*