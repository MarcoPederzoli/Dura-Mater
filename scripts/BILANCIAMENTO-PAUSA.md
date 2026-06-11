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

Quando si riprende: aggiornare questa nota, `RULES.md` (sezione giocabilita') e i workflow in `simulator-workflows-durissima.js`. Sweep pool N full L3-8 opzionale dopo altri fix bot.