# Regole di gioco

Questo documento formalizza le regole note per testare il mazzo MPCards e raccoglie i punti ancora da chiarire.

Le regole operative sono implementate in `mpcards-core.js`, caricato da `index.html` (gioco) e `simulator.html`. La UI locale usa `game.js` e `game-state.js`; il simulatore batch usa `simulator.js` e delega ogni partita a `MPCardsCore.simulateGame`.

## Codice carta (3 cifre)

Ogni carta e' identificata da un codice numerico di **tre cifre** (es. `118`, `586`). Le cifre non sono intercambiabili:

| Posizione | Proprieta' | Cifre |
|-----------|------------|-------|
| **1a** | `VALORE` | 1–8 |
| **2a** | `FORMA` | 1–8 |
| **3a** | `COLORE` | 1–8 |

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
- Ogni giocatore deve ricevere **almeno 3 carte** in mano all'inizio (come nel gioco normale: la griglia minima 3×3 con 1–3 giocatori parte sempre da 3 carte a testa).
- Numero massimo **ammesso**: `G <= 2N`. Esempi: 3×3 → **6**; 5×5 → **10**; 8×8 → **16**. La partita si avvia solo se la distribuzione rispetta anche il minimo di 3 carte a testa.
- Formato **consigliato**: `G = N`. In quel caso non c'e' mazzo di pesca e la fortuna e' gia' tutta nelle mani iniziali. Con `G > N` (overcrowd) la partita resta legale fino a `2N`, ma le carte in mano sono meno e le carte non distribuite formano il mazzo di pesca.

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

Esempio: griglia **5×5** (25 carte) con **7** giocatori → 3 carte ciascuno (21 in mano), **4** carte nel mazzo di pesca.

Controesempio: **3×3** con **4** giocatori → `floor(9/4) = 2` carte a testa → **non ammesso** (sotto il minimo di 3).

## Inversione del turno (limiti della Dura Mater)

La **Dura Mater** e' l'intera griglia di gioco (la matrice **N×N** che si costruisce in partita). Avviene un'**inversione** dell'ordine di gioco alla chiusura di **ciascun limite** della Dura Mater:

1. **Primo limite** — con una posa, per la prima volta in partita, una sequenza continua di **N** carte in orizzontale **oppure** in verticale fissa un lato della griglia (larghezza o altezza della Dura Mater).
2. **Secondo limite** — con una posa che porta l'ingombro delle carte al formato **N×N** (Dura Mater chiusa).

Dopo ogni inversione, chi aveva il turno passa al giocatore precedente nell'ordine ciclico iniziale (es. dopo A → B → C si prosegue C → B → A). L'elenco dei giocatori non cambia: cambia solo la **direzione** (avanti o indietro). Non si ottiene un turno aggiuntivo per chi ha chiuso un limite.

Se **nello stesso turno** si chiudono entrambi i limiti (due inversioni nella stessa sequenza di pose), gli effetti si **annullano** e la direzione resta quella in corso prima di quel turno.

Ogni inversione e' verificata **al momento della posa** di una carta.

## Dura Mater chiusa

La Dura Mater e' **chiusa** quando l'ingombro delle carte posate raggiunge **N×N** (larghezza e altezza relative entrambe pari a **N**). La chiusura avviene con la posa che porta l'ingombro al limite (ed e' il **secondo limite** che provoca inversione, salvo annullamento come sopra).

## Turno di gioco

- I giocatori agiscono a turno secondo l'ordine iniziale e la direzione in vigore.
- Nel proprio turno un giocatore puo' posare da 1 a 4 carte, piu' eventualmente una quinta carta tramite l'**Idea** (vedi sotto).
- Il giocatore puo' scegliere di posare meno di 4 carte anche se avrebbe mosse legali disponibili.
- Alla fine del proprio turno, prima di passare il turno al giocatore successivo, il giocatore deve pescare una carta se il mazzo di pesca contiene ancora carte.
- La pesca di fine turno avviene sia se il giocatore ha posato una o piu' carte, sia se ha passato.
- Se il mazzo di pesca e' vuoto, il giocatore non pesca a fine turno.
- Se un giocatore non ha mosse legali, passa (e pesca se il mazzo non e' vuoto).
- In partita **competitiva**, un giocatore umano distratto puo' passare anche con mosse disponibili: non e' consentito dalle regole di buon gioco (va contro l'obiettivo di svuotare la mano), ma il motore non lo impedisce.
- La partita va in stallo quando il mazzo di pesca e' vuoto e tutti i giocatori passano consecutivamente senza che nessuno posi una carta.

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

Variante in cui l'obiettivo e' **completare la matrice N×N** (tutte le carte posate). Non conta chi finisce le carte per primo; la partita finisce quando la griglia e' piena.

- Al tavolo la Durissima e' **collaborativa** (un solo obiettivo comune). In solitario equivale a tenere tutte le carte insieme.
- **Due o piu' giocatori**: turno e pesca come nel **gioco normale** (si pesca passando/chiudendo il turno se c'e' mazzo). La collaborazione al tavolo compensa la mancanza di un bot «globale». Se un giro completo passa senza che **nessuno** posi, la partita va a **monte**.
- **Informazione condivisa (cooperativo):** tutti i giocatori conoscono **l'intero contenuto** delle mani di tutti e del **mazzo di pesca** ancora da distribuire. Si sa **quali** carte restano in gioco, non **in che ordine** verranno pescate dal mazzo. Al tavolo si possono coordinare mosse e chiusure di «isole» (es. completare un 2×2) sapendo se la carta necessaria e' in una mano o ancora nel mazzo. Il bot cooperativo (`durissima-planner`) usa lo stesso pool informativo per valutare isole e frontiera; per «chi puo' posare adesso» in una cella considera solo le carte gia' in mano.
- **Un solo giocatore (solitario)**: a fine turno si pesca **solo se nel turno si e' posata almeno una carta** (se il mazzo non e' vuoto). Se non si puo' posare, si usano fino a **N pescate extra per partita** dal mazzo (**buffer di emergenza**, `N` = lato della griglia). Sono pescate aggiuntive da fermo, non sostituiscono la pesca dopo una posa. Su griglie piccole il buffer e' rilevante (3×3: 3 pescate su 6 nel mazzo; 5×5: 5 su 20). Buffer esaurito e ancora bloccati → partita persa.
- **Posare meno carte del massimo** nello stesso turno resta lecito e spesso strategico: dopo la prima posa si puo' **chiudere il turno** anche se si potevano posare altre carte.
- Mano vuota **non** termina la partita: si continua finche' la matrice non e' completa o la partita non va a monte.

*Nota (bilanciamento provvisorio):* le regole sopra sono quelle concordate; il completamento reale della griglia va verificato in simulazione (solitario e multi‑giocatore). Se le percentuali di successo fossero troppo basse, le regole potrebbero essere riviste.

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
