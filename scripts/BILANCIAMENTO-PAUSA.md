# Bilanciamento Durissima — pausa (giugno 2026)

Campagna di simulazione **sospesa**. I risultati restano in repo; non cancellare i JSON in `tests/` né gli script probe.

## Stato regole testate (baseline «semplici»)

- Nessuna vita extra, pool, riserva, buffer emergenza (default engine).
- Durissima coop: coordinamento simulato con `durissima-team-planner`.
- Durissima solitario: `durissima-planner`; pesca solo dopo posata.

## Export principali

| File / script | Contenuto |
|---------------|-----------|
| `tests/dura-mater-classic-sweep-*.json` | Competitiva: tutte le celle L×G legali (58), vittoria 74–100% |
| `tests/dura-mater-durissima-rules-probe-2026-06-09-23-40-04.json` | Durissima semplice + team, 15 celle × 300 |
| `tests/dura-mater-durissima-riserva-team-probe-2026-06-10-11-53-53.json` | Riserva post-deal + team, 15 celle × 300 |
| `scripts/durissima-rules-probe-check.js` | Probe CLI (`--full`, `--riserva`) |
| `scripts/build-confronto-varianti-durissima-xlsx.py` | Confronto varianti storiche |
| `confronto-varianti-durissima.xlsx` | Tabella varianti |

## G=N — numeri di riferimento (semplice + team, 300 partite)

| Formato | Successo griglia piena |
|---------|------------------------|
| 3×3 | ~10% |
| 4×4 | ~7% |
| 5×5 | ~2% |
| 6×6 | ~0,3% |
| 7×7, 8×8 | ~0% |

## Ripresa

Quando si riprende: aggiornare questa nota, `RULES.md` (sezione giocabilità) e i workflow in `simulator-workflows-durissima.js`.