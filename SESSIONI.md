# SESSIONI — Dura Mater

**Diario cronologico** di ipotesi, test, risultati e decisioni prese con l'agente IA.
La chat Grok e' effimera: **questo file e' la memoria persistente** del ragionamento.

**Come usarlo**

- All'inizio di una sessione: leggere le ultime voci e `promemoria.md`.
- A fine sessione significativa: l'agente aggiunge una voce (formato sotto).
- Artefatti pesanti (json, xlsx): in `results/` o `tests/` — indicizzati in `results/INDICE.md`.

**Formato voce**

```markdown
## YYYY-MM-DD — Titolo breve

**Ipotesi:** ...
**Test:** comando o script
**Risultato:** numeri / osservazioni
**Decisione:** cosa tenere, cosa scartare
**Artefatti:** path file (se esistono)
**Non rifare:** (opzionale)
```

---

## 2026-06-10 — Audit torneo Dura (planner)

**Ipotesi:** il formato torneo competitivo (G da G_min a 2N) e' bilanciato con strategia `planner`.
**Test:** audit N=3..8, 300 tornei per cella, 52 combinazioni, ~15.600 tornei totali.
**Risultato:** undercrowded finisce spesso (29.9%); overcrowded quasi sempre al monte (99.9%). G=N: 6 formati, monte 98.2%, bias sede su 3x3 e 5x5 (chi2 significativo). Dettaglio in `REPORT-definitivo.txt`.
**Decisione:** Dura competitiva considerata chiusa come prodotto; audit di riferimento per torneo.
**Artefatti:** `results/tournament-audit/` (vedi `results/INDICE.md`)
**Non rifare:** reinterpretare questo audit come probe Durissima/solitario.

---

## 2026-06-11 — 2026-06-19 — Probe Durissima (pool, reshuffle, bot)

**Ipotesi:** si puo' bilanciare Durissima (reshuffle, pool N, hand-cap) misurando % vittoria bot su pochi seed.
**Test:** decine di script `durissima-*-probe`, `durissima-pool-sweep`, `durissima-l*-probe`, `durissima-gn-solver-probe`, output in `tests/*.json`.
**Risultato:** numeri utili come diagnostica ma **non conclusivi** per bilanciamento regole. Campioni piccoli (es. 7x7 1/3 seed) insufficienti. Probe pesanti in parallelo rallentano tutto (lock `.heavy-probe.lock`).
**Decisione:** sospendere decisioni su reshuffle/pool/vite finche' non esiste solver affidabile livelli A+B. Vedi `scripts/TODO-SOLVER-DURISSIMA.md` priorita' 0.
**Artefatti:** `tests/dura-mater-durissima-*.json`, `tests/overnight-solver-log.txt` (vedi `results/INDICE.md`)
**Non rifare:** usare `durissima-grid-probe` / sweep per decidere bilanciamento; certificare formati su 3 seed.

---

## 2026-06-19 — Regola Idea jolly e pursue opt-in

**Ipotesi:** la regola Idea (5a carta cieca, buco topologico) migliora il bot Durissima.
**Test:** implementazione in core + probe frequenza (`durissima-idea-frequency`, `durissima-idea-impact-probe`).
**Risultato:** con `durissimaPursueIdea` attivo la frequenza cresce con N (5x5 ~1%, 8x8 ~26%); feedback umani: troppo aggressivo in gioco reale.
**Decisione:** `durissimaPursueIdea` reso **opt-in** (`=== true`); default **off**. Regola Idea resta in `RULES.md` e docx editore.
**Artefatti:** commit regole Idea gia' pushato; probe in `tests/`
**Non rifare:** patchare euristiche (`gnTryForcedMove`, pursue Idea) prima del solver Livello A.

---

## 2026-06-23 — Paradosso solver: miliardi di soluzioni ma bot che «non risolve»

**Ipotesi:** con G=N e conoscenza perfetta delle carte, il bot dovrebbe chiudere quasi sempre (incastro banale, poi schedulazione).
**Test:**
- Enumerazione Livello A: `deck-grid-solution-count.js` (3x3, 4x4 esatti)
- Grafo compatibilita': `deck-compat-graph.js`
- Bot/solver attuali: `durissima-global-planner`, `solveGnStateOutcome`, god-hand probe
**Risultato:**

| Strumento | Livello | Esito tipico |
|-----------|---------|--------------|
| `durissima-global-planner` (G=N) | B/C misto | 7x7 ~1/3 seed; 8x8 ~0 |
| `solveGnStateOutcome` (DFS) | B parziale | 4x4 ~93%; 5x5 ~20% |
| God-hand + planner | B greedy | 5x5 ~19% |
| (nessuno) | **A puro** | **non implementato** |

Conteggio Livello A (griglia NxN piena, >=1 tratto tra adiacenti, no vincoli turno):

| Griglia | Soluzioni raw (esatto/stima) |
|---------|------------------------------|
| 3x3 | 160 (esatto) |
| 4x4 | 1.250.416 (esatto) |
| 5x5 | ~10^10 (stima; lower bound > 8,8x10^8) |
| 6x6 | ~10^14 (stima) |
| 7x7 | ~10^17 (stima) |
| 8x8 | ~10^21 (stima) |

Canonical (carta 0 fissa in (0,0)): 3x3 -> 32; 4x4 -> 179.648; 5x5 -> lower bound > 127.326.267 (conteggio incompleto).

**Decisione:** il puzzle non e' impossibile — manca separazione livelli A/B/C. Piano obbligato:
1. Solver Livello A (CSP incastro)
2. Scheduler Livello B (linearizzazione turni)
3. Bot pipeline A -> B -> C
4. Solo dopo: pattern/sottogriglie e bilanciamento solitario/undercrowded
5. Documento editore: aggiungere tabella configurazioni finali in `Analisi-Mazzo-Dura-Mater.docx`

**Artefatti:** `scripts/deck-grid-solution-count-lib.js`, `scripts/BOT-STRATEGIA-GN.md`, `scripts/BILANCIAMENTO-PAUSA.md`
**Non rifare:** enumerare 5x5+ esatto senza mandato esplicito; probe pesanti senza piano (budget crediti esaurito fine giugno).

*Contenuto migrato da `scripts/STATO-LAVORO-GIU-2026.md` (file rimosso).*

---

## 2026-06-26 — Spostamento su C:\Dev (SSD)

**Decisione:** repo da `D:\Grok\projects\Dura Mater` a `C:\Dev\Dura-Mater`. D: e' HDD lento; codice su SSD. Dropbox solo per hub e documenti.

---

## 2026-06-26 — Memoria a carico zero sull'utente

**Ipotesi:** l'utente non deve ricordare frasi rituali («leggi promemoria», «aggiorna SESSIONI»).
**Decisione:** protocollo obbligatorio in `C:\Users\marco\.grok\AGENTS.md` + `AGENTS.md` progetto: agente legge memoria all'avvio e scrive a fine lavoro senza istruzioni esplicite.
**Non rifare:** chiedere all'utente di compensare la memoria della chat.

---

## 2026-06-26 — Architettura memoria progetto

**Ipotesi:** Git da solo non basta a ricordare ipotesi scartate e test gia' fatti; serve un diario committato.
**Test:** inventario file esistenti (`promemoria.md`, `PROJECT_RECOVERY_SUMMARY.md`, `STATO-LAVORO` non tracciato su Git).
**Risultato:** buona base gia' presente ma frammentata; `STATO-LAVORO` a rischio perdita.
**Decisione:** introdurre `SESSIONI.md` (questo file) + `results/INDICE.md`; regole in `AGENTS.md`; `promemoria.md` = fotografia attuale, non diario.
**Artefatti:** `SESSIONI.md`, `results/INDICE.md`, `AGENTS.md`
**Non rifare:** affidarsi alla chat come unica memoria tra sessioni distanti.

---

*Prossima azione (invariata): implementare Solver Livello A — non nuovi probe.*