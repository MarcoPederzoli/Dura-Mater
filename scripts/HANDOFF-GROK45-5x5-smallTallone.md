# HANDOFF — Grok 4.5 — 5x5 G>5 (smallTallone) + Coordinatore Durissima

**Data handoff:** 2026-07-15 (mattina)  
**Stato contesto:** pieno (200k/200k) — utente ha chiesto di compattare.  
**Obiettivo principale della sessione:** portare il Coordinatore (una mente vs mazzo) a **90-95%+ carte posate sempre** su 5x5, e **100% solve** quando tallone 1-2 (in generale tallone < G con margine adeguato).  
**Non passare a 6x6** finché 5x5 non è stabile e affidabile. Non buttare la logica per G < N.

**File da leggere per riprendere (in ordine):**
1. Questo handoff (intero).
2. `C:\Dev\Dura-Mater\mpcards-core.js` — funzione `chooseDurissimaCoordinatedAction` (specialmente blocchi `smallTallone` / `treatAsIdeal` / minLate + follow).
3. `C:\Dev\Dura-Mater\SESSIONI.md` — voci del **2026-07-15** (tutte le 07-15, specialmente "FINGI ORDINE TALLONE", "Lezione dalla soluzione manuale", "Integrazione late game + interchangeability").
4. `scripts/durissima-matrix-solver.js` (findSchedulableMatrix + getTargetPlan).
5. Test: `temp-5x5-gt5.js`, `temp-5x5-gt5-worker.js`, `temp-5x5-quick.js`.
6. `scripts/TODO-SOLVER-DURISSIMA.md`, `promemoria.md` (Dev), AGENTS.md (regole parallel + lingua).
7. (opzionale) `Risultati_Durissima_Coordinatore_One_Mind.docx` e report precedenti per contesto più ampio.

---

## 1. Contesto e obiettivo preciso (parole utente)

Prima del lavoro di stamattina:
- Su G = N (tallone 0): vecchio oracolo + piano specifico + strict follow con passi dava **100% solve**.
- Su 5x5 G > 5 (small tallone < G): con realistico + bias vari si arrivava a ~**21-22/25** placed in media, **0% solve** anche con tallone=1 (G=8).
- Utente: "Dovremmo arrivare a posare almeno il 90%-95% delle carte, sempre. E mi aspetterei che con talloni di 1 o 2 carte il gioco venisse risolto sempre."
- "Non ha senso che siamo finiti da un solver magico da 100% di vittorie ad uno che cade a 0%."
- Utente ha risolto manualmente in solitario 5x5 (pesca legata solo alla posa, niente pool extra) **al primo tentativo**.

Utente ha fornito la griglia esatta del suo solve manuale 5x5 (concetto chiave):
- Blocco compatto di **tutti i 5** in basso a destra (area ~3x3).
- Prima chiudere un core 4x4 con valori bassi.
- Poi cornice esterna con valori alti, raggruppati per valore.

**Principi da integrare (non buttare):**
- Clustering per valore (forte) + forma/colore.
- Zone dense stesso valore = **interscambiabili** (banale sostituire una 5 con un'altra 5).
- **Carte problematiche/rigide** (poche connessioni possibili) → prioritarie early.
- **Carte comode** (alta flexibility, tanti legami) → lasciare late per margine.
- **Non strandare** carte di valore basso rimaste in fondo al tallone: forme e colori esistono apposta per gestire buchi.
- Per N grandi: non over-focus su valore (pool bilanciati).

---

## 2. Approccio deciso: "FINGI" un ordine per il tallone (smallTallone)

Utente (verbatim chiave):
> "credo serva un sistema che preveda la posa di tutte le carte nell'ordine in cui lo conosciamo e che FINGA di sapere già dove si trovino nel tallone le carte rimanenti. 
> Primo: se per quando è arrivato il momento di posare quelle carte l'ordine nel tallone risultasse diverso, sarebbe irrilevante: una volta in mano ai giocatori si posano quando si desiderano. 
> Secondo: lavorando in questo modo, siamo certi di avere il 100% di successo con talloni di 1 o 2 carte."

**Principio:**
- Quando `drawPileLen < players` (smallTallone) → il set completo delle carte rimanenti è **noto per eliminazione** dal mazzo fisso simulationDeck() filtrato per value <= size.
- Tratta come G=N ideal: costruisci **piano completo specifico (card + cell)** usando il solver per l'ordine celle + greedy assignment compatibile.
- **Fingi** un ordine: assegna le carte "missing/tallone" (non ancora owned) **solo a posizioni sufficientemente tarde** nella sequenza.
- Calcola `minLateForTallone` = (ceil(numMissing / players) + 1) * players   (+1 = margine di sicurezza).
- Owned riempiono il safe prefix iniziale.
- Follow: strict (con value-substitution per interscambiabili) + passi fino al titolare.
- L'ordine reale del tallone diventa irrilevante: i passi aspettano che la carta arrivi in mano.

Questo riprende il vecchio oracolo (piano specifico + strict follow che dava 100%) + integra tutta la flessibilità/margine/realistico scoperta dopo.

---

## 3. Implementazione attuale (in mpcards-core.js)

### 3.1 Rilevamento e treatAsIdeal
```js
const drawPileLen = (state.drawPile || []).length;
const players = state.players || 1;
const isSmallTallone = drawPileLen < players;
const treatAsIdeal = isIdeal || isSmallTallone;
```

Early guard (per N<=4 o very small) ancora usa search pesante; per N=5+ e smallTallone **fallthrough** al planning per permettere il path fullSeq.

### 3.2 Calcolo minLate + owned + aggiunta missing
```js
const remaining = [...mani...];
const ownedUids = new Set(remaining.map(c => c.uid));
let minLateForTallone = 0;
if (!isIdeal && isSmallTallone) {
  const fullGame = simulationDeck().filter(c => Number(c.value) <= size);
  const missing = fullGame.filter(c => !ownedUids.has(c.uid));
  remaining.push(...missing.map(c => ({...c})));
  const numMissing = missing.length;
  const minRounds = numMissing > 0 ? Math.ceil(numMissing / players) + 1 : 0;
  minLateForTallone = minRounds * players;
}
```

### 3.3 Assegnazione greedy (tre punti con skip)
1. Owned-first loop: `if (!ownedUids.has(c.uid)) continue;`
2. Any (con late enforcement): `if (!ownedUids.has(c.uid) && i < minLateForTallone) continue;`
3. Last resort: stesso skip.

Poi soft bias valore (low early per core 4x4, high late) — **fattore basso** (0.5) per non strandare low-value.

Due tentativi (normale + reversed pool) per N>=5.

Se `mapped.length === targetLen` e `isIdeal || isSmallTallone`:
- `state._gnFullSequence = mapped;`
- `state._gnTargetCellSequence = ...`

### 3.4 Follow stretto (con value substitution)
```js
let legal = legals.find(m => m.card.uid === step.card.uid && m.x===...);
if (!legal && step.card) {
  // value substitution per zone interscambiabili stesso valore
  legal = legals.find(m => m.card.value === step.card.value && m.x===... && m.y===...);
}
```
Se nessun legal per il prossimo step owned → return stop (passa al titolare).

### 3.5 Altre integrazioni (dal dialogo)
- Clustering bonus nel realistico scorer (valore +4, forma/colore +2 su adiacenti).
- Morph: rigidity alta → bonus early (priorità problematiche); flexibility alta → leggero malus.
- Tono moderato per N grandi.
- Value sub + owned defer + late enforcement.

---

## 4. Risultati fino a questo momento (mattina 2026-07-15)

**Prima della modifica FINGI (realistico + clustering + morph + late game boost):**
- 5x5 G>5: media ~21-22/25 placed (varianza per seed).
- Solve: 0% anche su tallone=1.
- Nessun blocco totale su low-value (forme/colori aiutano), ma non chiude.

**Dopo implementazione FINGI + minLate + fullSeq commit per smallTallone:**
- Codice presente e coerente con la richiesta.
- Test diagnostici lenti / timeout a causa del matrix-solver pesante (maxNodes alti) + N=5.
- Nessun run completo con output numeri nuovi ancora disponibile al momento del handoff (un tentativo 1-step ha fallito per tempo).
- Script pronti: `temp-5x5-gt5.js` (config G=6/7/8, 10 seed, usa 7 workers), worker corrispondente.

**Obiettivo da validare subito:**
- Con la logica fingi + margine: placed dovrebbe salire a 24-25/25 stabile.
- Win% (solve completo) dovrebbe arrivare a 90-100% su tallone 1-2 (G=6 e G=8 per 5x5).
- G=7 (tallone=4) come sanity.

---

## 5. Come continuare (istruzioni per Grok 4.5)

1. **Prima azione:** leggi questo file + ultime voci SESSIONI 07-15 + la sezione rilevante di mpcards-core.js.
2. **Test leggeri prima di tutto:**
   - Usa `node temp-5x5-quick.js` (pochi seed, veloce) o lancia il gt5 con pochi task.
   - Focus G=8 (tallone=1) e G=6 (tallone=1).
   - Non fare sweep massivi finché non vedi solves >0 e placed alti.
   - Se lento: riduci temporaneamente maxNodes nel solver o nel searchOpts per 5x5.
3. **Metriche da riportare:**
   - Per ogni G: win% (placed == 25), avg placed, max placed, qualche esempio di deal problematico.
   - Se ancora stranding: identifica perché (carta low-value assegnata troppo presto? cellPlan non abbastanza flessibile? minLate insufficiente?).
4. **Raffinate possibili (solo se necessario):**
   - Campionare più cellPlan dal solver finché non si trova uno che permette buon safe-prefix owned + late missing.
   - Regolare il +1 margine o usare `minRounds = ceil(...) + 2` per tallone molto piccolo.
   - Mantenere realistico come fallback quando fullSeq non è ancora attivo.
5. **Non:**
   - Non passare a 6x6 finché 5x5 non dà solve stabile alto.
   - Non buttare la logica "tallone basso" già validata per casi generali (la fingi è specifica estensione per smallTallone).
   - Non fare probe pesanti su bilanciamento regole finché il bot non è affidabile.
6. **Parallelismo (macchina di riferimento):** usa fino a 7-8 worker (i7-6700HQ 8 thread logici). Default prudente 7. Esponi flag.
7. **Lingua:** tutto in italiano (messaggi, commit, voci SESSIONI).

---

## 6. File / script utili

- **Core:** `mpcards-core.js` (scegli sempre il path relativo nel repo).
- **Test dedicati 5x5 G>5:** `temp-5x5-gt5.js` + worker (parallel).
- **Quick diag:** `temp-5x5-quick.js`.
- **Solver:** `scripts/durissima-matrix-solver.js`.
- **Memoria:** `SESSIONI.md` (aggiorna a fine lavoro significativo).
- **Divieti:** `scripts/TODO-SOLVER-DURISSIMA.md` (Priorita' 0: niente probe regole senza bot solido).

---

## 7. Promemoria AGENTS (riassunto obbligatorio)

- Leggi promemoria + ultime 5 voci SESSIONI + TODO all'avvio (già fatto).
- Scrivi voce SESSIONI a fine lavoro (almeno una modifica/test/discussione).
- Compatta promemoria quando utile.
- Proponi commit (messaggio italiano: `docs: sessione ...` o `feat: ...`).
- Hardware: CPU parallel (no CUDA/Numba per questo).
- Terminale: niente Unicode esotico (`<=`, `x`, parole).

---

## 8. AGGIORNAMENTO (stessa data, sessione Grok 4.5) — RISOLTO

**5x5 G>5 smallTallone: 100% solve** su 30 deal (G=6/7/8 x 10 seed).

### Cosa funzionava male
1. Search 2M nodi/turno con tallone<=1 su N=5 (hang).
2. Riassegnazione greedy carte (check illegal) al posto della griglia A del solver.
3. Value-sub nel follow che rompeva il piano.
4. Missing in prima cella assembly → 0 placed (swap carte impossibile sulla griglia A).

### Cosa funziona ora (in `chooseDurissimaCoordinatedAction`)
1. **Griglia A fissa** da `findSchedulableMatrix` (carte specifiche, remap uid deal).
2. **Assembly owned-first:** stesso labeling, ordine di posa che preferisce celle con carte in mano prima di `minLateForTallone`; le missing restano sulle loro celle ma vengono posate tardi (fingi).
3. **Follow strict:** solo step earliest + uid esatto + `canPlaceCardAt` (no value-sub).
4. Search pesante solo finish (remaining<=6) o N<=4.
5. 1-card activations via `_gnJustPlayedSeqStep`.

### Numeri
| G | tallone | win% | avg placed | sample |
|---|---------|------|------------|--------|
| 6 | 1 | 100% | 25.0 | 10 |
| 7 | 4 | 100% | 25.0 | 10 |
| 8 | 1 | 100% | 25.0 | 10 |
| 5 | 0 | 100% | 25.0 | 2 (quick) |

### Non rifare
- Search per-turno massiccia su N>=5
- Value-sub sul fullSeq oracolo
- Riassegnare carte greedy ignorando griglia A

### Prossimo
- Sample più ampio se serve certificazione
- Generalizzare ad altri N con tallone < G
- Non aprire 6x6 finché non richiesto

— Fine handoff + chiusura 5x5 smallTallone.
