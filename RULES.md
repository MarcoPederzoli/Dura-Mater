# Regole di gioco

Questo documento formalizza le regole note per testare il mazzo MPCards e raccoglie i punti ancora da chiarire.

Le regole operative sono implementate in `mpcards-core.js`, caricato da `index.html` (gioco) e `simulator.html`. La UI locale usa `game.js` e `game-state.js`; il simulatore batch usa `simulator.js` e delega ogni partita a `MPCardsCore.simulateGame`.

## Codice carta (3 cifre)

Ogni carta e' identificata da un codice numerico di **tre cifre** (es. `118`, `586`). Le cifre non sono intercambiabili:

| Posizione | Proprieta' | Cifre |
|-----------|------------|-------|
| **1a** | `VALORE` | 1-8 |
| **2a** | `FORMA` | 1-8 |
| **3a** | `COLORE` | 1-8 |

Esempio: `586` → valore **5**, forma **8** (Croci), colore **6** (Blu) → «Cinque di Croci Blu».  
Esempio: `577` → valore **5**, forma **7** (Lampi), colore **7** (Viola) → «Cinque di Lampi Viola».  
Esempio: `238` → valore **2**, forma **3** (Triangoli), colore **8** (Bianco) → «Due di Triangoli Bianchi».

### Valori (1a cifra)

| Cifra | Valore di gioco | Nome in partita |
|-------|-----------------|-----------------|
| 1 | 1 | Asso |
| 2 | 2 | Due |
| 3 | 3 | Tre |
| 4 | 4 | Quattro |
| 5 | 5 | Cinque |
| 6 | 6 | Sei |
| 7 | 7 | Sette |
| 8 | 8 | Otto |

### Forme (2a cifra)

| Cifra | Forma |
|-------|--------|
| 1 | Cerchi |
| 2 | Cuori |
| 3 | Triangoli |
| 4 | Quadrati |
| 5 | Stelle |
| 6 | Esagoni |
| 7 | Lampi |
| 8 | Croci |

### Colori (3a cifra)

La cifra del colore sul codice carta segue questa scala (1 = Rosso, 8 = Bianco):

| Cifra | Colore |
|-------|--------|
| 1 | Rosso |
| 2 | Arancio |
| 3 | Giallo |
| 4 | Verde |
| 5 | Azzurro |
| 6 | Blu |
| 7 | Viola |
| 8 | Bianco |

Il nome leggibile in italiano (es. «Cinque di Croci Gialle») e' generato da `card-names.js` a partire da queste tre cifre. La corrispondenza **codice ↔ file immagine** e' in `Carte.xlsx` / `card-art.js`.

## Componenti

- Il gioco usa il mazzo filtrato in base al lato della matrice scelto per la partita.
- Ogni carta ha le tre proprieta' sopra, codificate nel numero a tre cifre.
- Il mazzo completo contiene 64 codici distinti; l'elenco e' in `mpcards-core.js` (`SIM_DECK_CODES`).

## Parametri della partita

- Numero di giocatori: `G`, con `1 <= G <= 2N`.
- Lato della matrice: `N`.
- Vincoli su `N`:
  - `N >= 3`
  - `N <= 8`
- Per la partita si usano solo le carte con `VALORE <= N`.
- Dato il vincolo di composizione del mazzo, il filtro `VALORE <= N` produce sempre `N * N` carte.
- Ogni giocatore deve ricevere **almeno 3 carte** in mano all'inizio (come nel gioco normale: la griglia minima 3x3 con 1-3 giocatori parte sempre da 3 carte a testa).
- Numero massimo **ammesso**: `G <= 2N`. Esempi: 3x3 -> **6**; 5x5 -> **10**; 8x8 -> **16**. La partita si avvia solo se la distribuzione rispetta anche il minimo di 3 carte a testa.
- Formato **consigliato**: `G = N`. In quel caso non c'e' mazzo di pesca e la fortuna e' gia' tutta nelle mani iniziali. Con `G > N` (overcrowd) la partita resta legale fino a `2N`, ma le carte in mano sono meno e le carte non distribuite formano il mazzo di pesca.

## Formati consigliati (schema)

Tre fasce per il numero di giocatori `G` su una griglia `NxN`:

| Fascia | Condizione | Ruolo |
|--------|------------|--------|
| **Ideale** | `G = N` | Formato di riferimento: nessun tallone, torneo simmetrico (`N` mani), Durissima coop sulle griglie previste |
| **Sotto-G** | `G_min <= G < N` | Variante «under»; legale e a volte utile, ma meno equa (soprattutto in torneo) |
| **Overcrowd** | `N < G <= 2N` | Variante con tallone; legale, spesso lunga e quasi tutta a monte in torneo |
| **Extra / sconsigliato** | `G < G_min` | Ancora **legale** in competitiva se restano >= 3 carte a testa (es. duello 7x2) — da evitare in torneo |
| **Non prodotto** | `G = 1` | **Solitario Dura abbandonato** (giugno 2026): il motore puo' ancora simulare `1xN` con `--all-legal`, ma non e' una modalita' del gioco. Il solitario resta solo in **Durissima** (griglia piena), da definire con quella modalita' |

### Minimo consigliato sotto-G (`G_min`)

In generale, per non scendere negli under «disastro» (duelli sbilanciati su griglie grandi):

```
G_min = ceil(N/2)   (arrotondamento per eccesso)
```

**Eccezione:** su **7x7** il minimo consigliato e' **3**, non 4. Con 4 giocatori il torneo e' equo ma quasi tutto a monte; con 3 giocatori resta equo ed e' molto piu' giocabile. Il vero problema su 7x7 e' il duello **7x2**, non il trio **7x3**.

Implementazione: `recommendedMinPlayers(N)` in `mpcards-core.js` (speculare a `maxPlayersForSize` / `recommendedMaxPlayers`).

### Tabella riepilogativa

| Griglia | `G` ideale | `G_min` consigliato | `G` max consigliato | `G` max ammesso | Note |
|---------|------------|---------------------|---------------------|-----------------|------|
| 3x3 | 3 | 2 | 3 | 6 | 3x2 ammesso come duello breve |
| 4x4 | 4 | 2 | 4 | 8 | 4x2 ammesso come duello |
| 5x5 | 5 | 3 | 5 | 10 | sotto 3 -> duello sbilanciato in torneo |
| 6x6 | 6 | 3 | 6 | 12 | |
| 7x7 | 7 | **3** | 7 | 14 | **eccezione** a ceil(N/2) |
| 8x8 | 8 | 4 | 8 | 16 | |

- **Consigliato (banda utile):** `G_min <= G <= N` — include il formato ideale `G = N`.
- **Ammesso (motore / simulatori):** `1 <= G <= 2N` con almeno 3 carte a testa (salvo combinazioni che violano il minimo carte).
- **UI gioco** (`gioco.html`, `simulazione-singolo.html`): il selettore giocatori **non scende sotto `G_min`** (sempre **>= 2** su Dura; `G = 1` non selezionabile).
- **Sweep / audit** (`classic-sweep`, `tournament-audit`, workflow simulator): per default solo `G >= G_min`; flag **`--all-legal`** se serve il campione completo delle combinazioni legali.
- **Torneo:** formato ideale `G = N`; sotto `G_min` non selezionabile in UI; overcrowd possibile ma variante.

### Per modalità

| Modalità | Cosa promuovere |
|----------|-----------------|
| **Dura competitiva** | `G = N`; banda `G_min … N` per under leggeri; overcrowd come variante; **nessun solitario** (`G >= G_min`, minimo 2 giocatori) |
| **Torneo** | **`G = N`**; evitare `G < G_min`; overcrowd opzionale, non core |
| **Durissima coop** | solo **`G = N`** sulle griglie previste; tutto il resto è extra estremo |
| **Durissima solitario** | `G = 1` — unica modalita' solitario del prodotto; regole e bilanciamento **in preparazione** (non in UI Dura) |

## Preparazione

1. Si sceglie il numero di giocatori `G`.
2. Si sceglie il lato della matrice `N`, rispettando i vincoli della partita e il massimo giocatori per quella griglia.
3. Si filtra il mazzo, mantenendo solo le carte con `VALORE <= N`.
4. Si mescola il mazzo filtrato.
5. Si distribuiscono le carte in mano:
   - se `G <= N`: **N** carte a ciascun giocatore (come prima);
   - se `G > N`: si ripartiscono le `N * N` carte in modo **uguale** tra tutti i giocatori — ciascuno riceve `floor(N * N / G)` carte; se una ripartizione piena lascerebbe qualcuno con meno carte degli altri, si ferma all'ultimo conteggio identico per tutti; le carte rimanenti formano il mazzo di pesca.
6. La distribuzione e' valida solo se ogni giocatore riceve almeno **3** carte (altrimenti la configurazione non si puo' avviare).
7. Le carte non distribuite formano il mazzo di pesca.

Esempio: griglia **5x5** (25 carte) con **7** giocatori -> 3 carte ciascuno (21 in mano), **4** carte nel mazzo di pesca.

Controesempio: **3x3** con **4** giocatori -> `floor(9/4) = 2` carte a testa -> **non ammesso** (sotto il minimo di 3).

## Inversione del turno (limiti della Dura Mater)

La **Dura Mater** e' l'intera griglia di gioco (la matrice **NxN** che si costruisce in partita). Avviene un'**inversione** dell'ordine di gioco alla chiusura di **ciascun limite** della Dura Mater:

1. **Primo limite** — con una posa, per la prima volta in partita, una sequenza continua di **N** carte in orizzontale **oppure** in verticale fissa un lato della griglia (larghezza o altezza della Dura Mater).
2. **Secondo limite** — con una posa che porta l'ingombro delle carte al formato **NxN** (Dura Mater chiusa).

Dopo ogni inversione, chi aveva il turno passa al giocatore precedente nell'ordine ciclico iniziale (es. dopo A → B → C si prosegue C → B → A). L'elenco dei giocatori non cambia: cambia solo la **direzione** (avanti o indietro). Non si ottiene un turno aggiuntivo per chi ha chiuso un limite.

Se **nello stesso turno** si chiudono entrambi i limiti (due inversioni nella stessa sequenza di pose), gli effetti si **annullano** e la direzione resta quella in corso prima di quel turno.

Ogni inversione e' verificata **al momento della posa** di una carta.

## Dura Mater chiusa

La Dura Mater e' **chiusa** quando l'ingombro delle carte posate raggiunge **NxN** (larghezza e altezza relative entrambe pari a **N**). La chiusura avviene con la posa che porta l'ingombro al limite (ed e' il **secondo limite** che provoca inversione, salvo annullamento come sopra).

## Turno di gioco

- I giocatori agiscono a turno secondo l'ordine iniziale e la direzione in vigore.
- Nel proprio turno un giocatore puo' posare da 1 a 4 carte, piu' eventualmente una quinta carta tramite l'**Idea** (vedi sotto).
- Il giocatore puo' scegliere di posare meno di 4 carte anche se avrebbe mosse legali disponibili.
- **Pesca in partita competitiva:** alla fine del proprio turno, se il mazzo non e' vuoto, si pesca **sempre** — sia dopo aver posato una o piu' carte, sia dopo un **passo** (turno chiuso senza posate). Passare senza posare e' una scelta strategica: si pesca ugualmente, ma le carte restano in mano (nel **torneo**, a monte: penalita' solo sulle carte ancora in mano).
- **Monte (competitiva e Durissima multi):** se **G turni consecutivi** passano senza che **nessuno** posi una carta, la partita va a **monte** (stallo), **anche se il tallone non e' vuoto**. Ogni posa azzera il contatore dei pass consecutivi.
- Se il mazzo di pesca e' vuoto, il giocatore non pesca a fine turno.
- Se un giocatore non ha mosse legali, passa (e in competitiva pesca se il mazzo non e' vuoto).
- In partita **competitiva**, un giocatore umano distratto puo' passare anche con mosse disponibili: non e' consentito dalle regole di buon gioco (va contro l'obiettivo di svuotare la mano), ma il motore non lo impedisce. La scelta di passare con mosse disponibili resta lecita (es. per tentare pescate utili accettando il rischio di carte in mano).

## Posa delle carte

- Una carta viene posata nella matrice di gioco.
- La prima carta della partita puo' essere posata liberamente.
- Ogni carta successiva deve essere posata adiacente ortogonalmente ad almeno una carta gia' in gioco.
- Per essere posata, la carta deve soddisfare un requisito di compatibilita' con le carte adiacenti ortogonalmente.
- Le adiacenze diagonali non contano.
- Le caratteristiche considerate per la compatibilita' sono `VALORE`, `FORMA` e `COLORE`.
- Il requisito indica il numero minimo di carte adiacenti ortogonalmente necessarie.
- La carta posata deve condividere almeno una caratteristica con ciascuna carta adiacente ortogonalmente.
- Non serve che la caratteristica condivisa sia la stessa per tutte le adiacenze.
- Una carta con requisito 2 deve quindi avere almeno 2 carte adiacenti compatibili.
- Una carta con requisito 4 puo' essere posata solo in una casella circondata sui 4 lati da carte compatibili.
- Nel corso dello stesso turno, il requisito cresce in base all'ordine di posa:
  - prima carta posata nel turno: requisito 1
  - seconda carta posata nel turno: requisito 2
  - terza carta posata nel turno: requisito 3
  - quarta carta posata nel turno: requisito 4
- La prima carta assoluta della partita e' un'eccezione: puo' essere posata senza adiacenze.

## Idea (quinta carta)

- Se in un turno un giocatore posa **quattro carte legali** e ha ancora almeno una carta in mano, realizza un'**Idea**: puo' posare **una quinta carta** nello stesso turno, subito dopo la quarta, **senza pescare** tra le due pose.
- La quinta carta segue solo il vincolo fondamentale di compatibilita': deve essere adiacente ortogonalmente ad almeno una carta in gioco e condividere almeno una caratteristica con **ogni** carta adiacente ortogonalmente (equivalente al requisito 1 del turno, non al requisito 4).
- La quinta carta e' **opzionale**: il giocatore puo' chiudere il turno dopo la quarta posa.
- Dopo la quinta carta (o dopo aver chiuso il turno senza usarla), il turno termina normalmente (pesca di fine turno inclusa, se prevista).
- Se la quarta carta svuota la mano (vittoria) o non restano carte in mano, l'Idea non si applica.

## Idea (quinta carta)

- Se in un turno un giocatore posa **quattro carte legali** e ha ancora almeno una carta in mano, realizza un'**Idea**: puo' posare **una quinta carta** nello stesso turno, subito dopo la quarta, **senza pescare** tra le due pose.
- La quinta carta segue solo il vincolo fondamentale di compatibilita': deve essere adiacente ortogonalmente ad almeno una carta in gioco e condividere almeno una caratteristica con **ogni** carta adiacente ortogonalmente (equivalente al requisito 1 del turno, non al requisito 4).
- La quinta carta e' **opzionale**: il giocatore puo' chiudere il turno dopo la quarta posa.
- Dopo la quinta carta (o dopo aver chiuso il turno senza usarla), il turno termina normalmente (pesca di fine turno inclusa, se prevista).
- Se la quarta carta svuota la mano (vittoria) o non restano carte in mano, l'Idea non si applica.

## Matrice di gioco

- La matrice di gioco ha lato `N`, ma la sua posizione assoluta non e' definita all'inizio della partita.
- Le carte posate hanno posizioni relative tra loro, per esempio una carta puo' essere a destra, sinistra, sopra o sotto un'altra carta.
- Lo stato interno puo' rappresentare la prima carta in `(0, 0)` e le successive con coordinate relative.
- Una mossa puo' essere dichiarata come coordinate relative normalizzate, per esempio `{ cardId, x, y }`, oppure come posa rispetto a una carta gia' in gioco, per esempio `{ cardId, anchorId, dir }`.
- Il motore normalizza le mosse dichiarate rispetto a una carta in coordinate relative e valida sempre il risultato.
- Prima che la matrice sia fissata, una posa e' legale solo se l'insieme di tutte le carte posate puo' ancora essere contenuto in almeno una possibile matrice `N x N`.
- In termini formali, prima della fissazione deve esistere almeno un inquadramento `N x N` che contenga tutte le coordinate relative occupate.
- Se l'ingombro relativo delle carte posate supera `N` in larghezza o in altezza, la posa non e' legale.
- La prima carta della partita viene posata senza scegliere quale cella definitiva della matrice occupera'.
- Quando viene completata una sequenza continua di `N` carte in orizzontale o in verticale, quella sequenza fissa una dimensione della matrice:
  - una sequenza orizzontale di `N` carte stabilisce l'intera larghezza della matrice;
  - una sequenza verticale di `N` carte stabilisce l'intera altezza della matrice.
- Dopo la fissazione di una dimensione, resta indefinita solo la traslazione nell'altra dimensione, finche' non viene determinata anch'essa dai vincoli delle carte posate.
- Se dopo la fissazione di una dimensione esistono piu' inquadramenti validi nell'altra dimensione, la scelta viene determinata dalla posa successiva che rende necessario scegliere uno di quegli inquadramenti.
- In ogni momento, prima e dopo la fissazione, le carte posate non possono occupare piu' di `N` righe e piu' di `N` colonne.
- Dopo che i confini della matrice sono determinati, e' vietato posare carte fuori dalla matrice `N x N`.

### Esempio: matrice 3x3

1. La prima carta viene posata. Non e' ancora noto quale delle 9 celle occupera' nella matrice finale.
2. La seconda carta viene posata a destra della prima. L'ingombro relativo e' largo 2 e alto 1.
3. Poiche' `N = 3`, la futura matrice puo' ancora includere una colonna libera a sinistra oppure una colonna libera a destra delle due carte. In verticale restano ancora due righe libere da collocare sopra, sotto, o una sopra e una sotto.
4. Se una terza carta viene posata orizzontalmente, completando una sequenza continua di 3 carte, quelle tre carte occupano necessariamente una riga intera della matrice 3x3.
5. A quel punto non e' ancora noto se le altre due righe della matrice saranno entrambe sopra, entrambe sotto, oppure una sopra e una sotto quella riga.

## Obiettivo (partita competitiva)

- Lo scopo del gioco e' finire le carte in mano.
- Vince il primo giocatore che resta senza carte in mano.
- La vittoria viene assegnata immediatamente dopo la posa che svuota la mano, prima della pesca di fine turno. Quindi la presenza di carte nel mazzo di pesca non impedisce la vittoria.

## Durissima Mater

Modalita' separata dalla Dura competitiva: al tavolo e' **collaborativa** (un solo obiettivo comune); in solitario (`G = 1`) equivale a tenere tutte le carte insieme.

### Variante di riferimento: **N reshuffle**

Per le partite Durissima (tavolo, simulazione, bilanciamento) il riferimento ufficiale e' **N reshuffle**: regole **core** Durissima (sotto) + pool di **N reshuffle a partita** (N = dimensione griglia). In codice: `durissimaVitaExtraEnabled` (default **on** con `durissimaMater`; opt-out con `durissimaVitaExtraEnabled: false` per confronti «solo core»).

La variante **senza** reshuffle resta documentata come **core puro** (storico probe giugno 2026); non e' il default prodotto Durissima.

### Regole core Durissima

Valgono **tutte le regole di Dura Mater** (codice carta, posa 1-4 + Idea, Dura Mater / inversioni assi, matrice NxN, monte a **G pass consecutivi** senza posate da nessuno, ecc.) con **sole due eccezioni**:

| Aspetto | Dura Mater | Durissima |
|---------|------------|-----------|
| **Pesca** | A fine turno sempre (anche su pass) | **Solo se nel turno hai posato** almeno una carta |
| **Vittoria** | Mano vuota (primo che svuota) | **Griglia piena** — tutte le carte della partita posate |

Conseguenze del core (gia' coerenti col motore):

- **Pass senza posare** resta lecito (scelta tattica in coop), ma **non fa pescare** — ne' in multi ne' in solitario.
- **Mano vuota** non chiude la partita; si continua finche' la matrice e' completa o la partita va a **monte**.
- **Monte:** come in Dura multi — G pass consecutivi senza posate, anche con tallone pieno.
- **Posare meno carte del massimo** nello stesso turno resta lecito: dopo la prima posa si puo' chiudere il turno anche con altre mosse legali.

**Cooperativo (2+ giocatori):** al tavolo mani e mazzo restano **coperti**. Con la scheda delle 64 carte e il dialogo si costruisce l'**universo noto** (quali carte esistono ancora, non l'ordine di pesca). Solo il giocatore attivo posa dalla propria mano. La simulazione coop usa `durissima-team-planner`.

**Solitario (`G = 1`):** stesse eccezioni di pesca e vittoria. Bloccati senza mosse legali all'inizio del turno → partita **persa** (nessun passo nel core). *Da rivedere:* monte e stallo senza compagni (`promemoria.md`).

### N reshuffle — regola operativa (riferimento Durissima)

- **Quando:** solo **a inizio del proprio turno**, **prima** di posare la prima carta del turno (`turnPlayed = 0`). Dopo la prima posa del turno non si puo' piu' reshufflare fino al turno successivo.
- **Condizione:** **non** dipende dall'avere o meno mosse legali. Si puo' reshufflare anche con mosse legali disponibili (scelta strategica in coop).
- **Budget:** pool condiviso di **N reshuffle a partita** (N = dimensione griglia).
- **Meccanica:** tutta la mano va nel tallone, si mescola, si ripescano carte fino alla dimensione mano iniziale.
- **Costo:** ogni reshuffle consuma **1** dal pool.
- **Alternativa al reshuffle:** posare (se si sceglie una mossa accettabile), **passare** (coop multi), o — solitario a pool esaurito — **sconfitta** se non resta alcuna mossa accettabile.
- **Cooperativo:** al tavolo e' una decisione di gruppo: evitare una posa legale ma dannosa puo' essere motivo per reshufflare o passare invece di giocare.
- **Simulazione:** bot `durissima-planner` / `durissima-team-planner` con reshuffle strategico a inizio turno (vedi `scripts/BILANCIAMENTO-PAUSA.md`).

### Altre varianti (sperimentali, non riferimento)

In valutazione o in pausa: **core puro** (senza reshuffle), **riserva** N, **buffer emergenza**, reshuffle selettivo (tenere parte della mano), ecc. Probe storici: `confronto-varianti-durissima.xlsx`, JSON in `tests/`.

## Giocabilita' (etichettatura provvisoria — giugno 2026)

Classificazione per il prodotto e per l'UI. I test di bilanciamento Durissima sono in **pausa** (dati conservati in `tests/` e `scripts/BILANCIAMENTO-PAUSA.md`); le soglie sotto restano valide fino a nuova campagna di simulazione.

### Dura — partita competitiva (normale)

- **Ambito prodotto:** `G_min <= G <= 2N` (minimo **2** giocatori). Obiettivo: **mano vuota** prima degli avversari.
- **Giudizio:** **giocabile** in tutte le combinazioni promosse. Nei sweep (`classic-sweep`, bot `planner`, celle con `G >= G_min`) ogni cella conclude con un vincitore nel **74-100%** delle partite; nessuna cella a stallo totale.
- L'**overcrowd** (`G > N`) resta variante legale; il **solitario Dura** (`G = 1`) e' stato **escluso** (sfida debole o banale a seconda di `N`, senza avversari). Vedi nota sotto su Durissima solitario.

### Durissima Mater — formato consigliato `G = N` (cooperativo)

| Livello | Griglia `NxN` | Etichetta | Note (simulazione **N reshuffle**, giu 2026) |
|---------|---------------|-----------|---------------------------------------------|
| **Core** | 3x3, 4x4 | Giocabile | Es. 3x3 G=N ~12%; 4x4 G=N ~10% (bot strategico) |
| **Difficile** | 5x5 | Molto difficile | Es. G=N ~1-2%; vita med ~4,9/5 |
| **Estremo** | 6x6 | Quasi impossibile | Non previsto come modalita' standard |
| **Epico** | 7x7, 8x8 | Non standard / impossibile | Solo come sfida dichiarata, non come core |

### Durissima — altre configurazioni

- **Ambito Durissima:** `G = 1 … 2N` — **tutte le combinazioni legali** (>= 3 carte a testa). **Nessun `G_min` competitivo** (`ceil(N/2)` vale solo per Dura/torneo).
- **Massimo:** `G <= 2N` (come la competitiva); oltre non e' legale.
- **Solitario** (`G = 1`): unica modalita' solitario del gioco (obiettivo **griglia piena**); bilanciamento in pausa (`scripts/BILANCIAMENTO-PAUSA.md`), non ancora in UI Dura.
- **Sotto-G** (`1 < G < N`) e **overcrowd** (`N < G <= 2N`) in Durissima: varianti **extra**; il formato coop consigliato resta **`G = N`**.

## Torneo a punteggio (solo partita competitiva)

Il **torneo** usa le stesse regole di gioco della partita competitiva (mosse, pesca, Idea, Dura Mater chiusa, ecc.), ma **obiettivo, fine mano e punteggio** sono diversi. **Non** si applica alla Durissima Mater.

### Scopo del torneo

- **Equità tra posti al tavolo:** ogni giocatore resta nella **stessa posizione fisica** (G1, G2, …) per tutto il torneo; non si scambiano sedi.
- Il vincitore del torneo non è chi vince una singola mano, ma chi totalizza **più punti** sommando tutte le mani giocate.
- Dopo ogni mano, il **primo giocatore** della mano successiva **avanza di una posizione in senso orario** (es. mano 1 inizia G1, mano 2 G2, …, mano G inizia di nuovo G1 con G giocatori). Così il vantaggio del posto e dell’ordine di turno si distribuisce nel tempo.

### Sede e punteggio

- I giocatori sono **G** al tavolo; il punteggio è tenuto **per sede** (G1…G**G**), non per «vincitore della mano».
- Le mani si susseguono fino a fine torneo; i punti **si sommano** (positivi e negativi) da una mano all’altra.

### Fine di una mano (due modi)

A differenza della partita libera (dove la prima mano vuota **termina** la partita), in torneo **la mano continua** dopo che un giocatore finisce le carte, finché non si verifica uno dei due casi sotto.

#### 1) Tutti i giocatori finiscono le carte

- Ogni volta che un giocatore **svuota la mano**, riceve subito punti pari al **numero di giocatori ancora in gioco in quel momento** (incluso sé stesso al momento dello svuotamento).
- Esempio con **G = 4:** primo che finisce → **4** punti; secondo → **3**; terzo → **2**; ultimo → **1**.
- Quando anche l’ultimo ha finito, la mano è conclusa (tutte le carte sono state posate; la griglia può risultare completata se tutte le carte del sottomazzo erano in gioco).

#### 2) Monte (stallo)

- La mano va a **monte** quando, per un **giro completo** di **G** turni consecutivi, **nessun giocatore posa** una carta — **anche se il tallone non è vuoto** (stessa condizione della partita competitiva; vedi «Turno di gioco»).
- **Penalità a fine mano per monte:** ogni giocatore **ancora in gioco** con carte rimaste in mano riceve **−1 punto per ogni carta** (i giocatori già **usciti** hanno mano vuota e non subiscono penalità). Le carte nel tallone **non** contano: la penalità riguarda solo la mano.
- È un esito da evitare, soprattutto con poche carte posate; con **4 o più giocatori** chi non posa può costringere gli altri al monte, ma la penalità resta limitata alle carte in mano di ciascuno.

### Punti durante la mano

| Evento | Punti |
|--------|--------|
| Giocatore **N‑esimo** che svuota la mano (con **k** giocatori ancora in gioco, incluso lui) | **k** |
| **Idea:** posa della **quarta carta** legale nello stesso turno | **+1** subito al momento della quarta posa; indipendentemente dal fatto che si giochi o meno la quinta carta |
| **Monte:** ogni carta ancora **in mano** | **−1** per carta (chi è uscito: 0) |

- Il punto Idea si assegna al momento della quarta posa legale del turno, non alla quinta.
- Se la quarta carta svuota la mano, valgono le regole normali di arrivo (punti per ordine di finish); l’Idea come quinta carta non si applica (come in partita libera).

### Fine del torneo e classifica

- **Classifica:** si ordina per punteggio totale; primo, secondo, terzo posto, ecc.
- **Durata:** da definire in base a **G**:
  - **G mani** (una per ogni rotazione del primo giocatore) è il formato simmetrico naturale.
  - Con **G molto alto** (es. 16), si può preferire un **punteggio bersaglio** annunciato prima del torneo: vince (o si chiude il torneo) chi per primo raggiunge quella soglia — da stabilire in regolamento casa.

### Riepilogo differenze partita libera vs torneo

| | Partita libera | Mano in torneo |
|---|----------------|----------------|
| Prima mano vuota | Fine partita, un vincitore | **+G** punti, mano continua |
| Idea (4ª carta) | Solo opzione 5ª carta | **+1** punto torneo |
| Monte | G pass senza posate (anche con tallone pieno); nessun punteggio | G pass senza posate; **−1**/carta in mano (solo carte in mano, non il tallone) |
| Durissima | Variante separata | **Non usata** |

*Implementazione motore / UI torneo: presente in `mpcards-core.js` (`tournamentMode`), `game.js` / `gioco.html` / `simulazione-singolo.html` e `simulator.js` / `simulatore-massivo.html`.*

## Timeline locale

- L'interfaccia locale mantiene una timeline completa della partita.
- `Undo` torna allo snapshot precedente e puo' risalire fino all'inizio partita.
- `Redo` avanza nella timeline finche' non si gioca una nuova azione dopo un undo.
- Se, dopo essere tornati indietro, viene giocata una nuova azione, gli stati futuri vengono scartati.
- Le impostazioni dei giocatori e delle strategie non sono parte dell'undo/redo, ma vengono salvate nel file partita.
- Il salvataggio della partita include configurazione, timeline, posizione corrente nella timeline e stato del generatore casuale usato da mescolamento e bot.

## Interfacce che usano queste regole

- `index.html` e' l'interfaccia manuale/locale: mazzo, seed, giocatori, lato matrice, modalita' manuale o bot e strategie. `game.js` renderizza la plancia e applica `MPCardsCore.applyPlacement`, `passTurn`, `endTurn` e `botStep`.
- `simulator.html` e' l'interfaccia batch: combina parametri e strategie e usa `MPCardsCore.simulateGame` per statistiche aggregate.
