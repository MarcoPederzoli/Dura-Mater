# Dura Mater — Regolamento di gioco

Versione: giugno 2026.

**Dura Mater** e' il gioco di carte in cui i giocatori costruiscono una griglia **NxN** posando carte compatibili. L'obiettivo della partita competitiva e' **svuotare per primo la propria mano**. Esiste anche il **torneo a punteggio**, con le stesse regole di posa ma punteggio e fine di ciascuna **partita** del torneo diversi.

Questo documento riguarda **solo Dura Mater** (competitiva e torneo). La variante cooperativa/solitario **Durissima Mater** ha regolamento separato ed e' ancora in preparazione.

### Terminologia

| Termine | Significato |
|--------|-------------|
| **Sessione** | Periodo di gioco (serata); una o piu' partite, o un torneo |
| **Torneo** | Competizione a piu' **partite**, punteggio cumulativo |
| **Partita** | Unita' di gioco completa (distribuzione → vittoria / monte / fine punteggio) |
| **Mano** | Solo le carte tenute («carte in mano»); **mai** un'unita' di torneo |
| **Turno** | Periodo di un singolo giocatore |
| **Giro** | Passaggio di tavolo: G turni consecutivi |
| **Posa / giocata** | Collocare una carta sulla griglia |

---

## 1. Componenti

- **Mazzo:** 64 carte distinte, ciascuna identificata da un **codice a tre cifre** (es. `586`, `238`).
- **Scheda di riferimento** delle carte (consigliata).
- **Tavolo** per costruire la griglia (la **Dura Mater**).

In ogni partita con griglia **NxN** si usano solo le carte con **Valore <= N** (sono esattamente **N^2** carte).

---

## 2. Le carte

Ogni carta ha tre caratteristiche, lette nelle tre cifre del codice. **Le cifre non sono intercambiabili.**

| Posizione | Caratteristica | Valori |
|-----------|----------------|--------|
| 1a cifra | **Valore** | 1 (Asso) ... 8 (Otto) |
| 2a cifra | **Forma** | 1 Cerchi, 2 Cuori, 3 Triangoli, 4 Quadrati, 5 Stelle, 6 Esagoni, 7 Lampi, 8 Croci |
| 3a cifra | **Colore** | 1 Rosso, 2 Arancio, 3 Giallo, 4 Verde, 5 Azzurro, 6 Blu, 7 Viola, 8 Bianco |

**Esempi**

- `586` = Cinque di Croci Blu (valore 5, forma 8, colore 6)
- `238` = Due di Triangoli Bianchi (valore 2, forma 3, colore 8)

Il nome leggibile in italiano e' ricavato da queste tre cifre.

---

## 3. Parametri della partita

- **N** = lato della griglia (**da 3 a 8**).
- **G** = numero di giocatori (**da 2 a 2N**).
- Ogni giocatore deve ricevere **almeno 3 carte** all'inizio; altrimenti la configurazione non e' valida.

### Formati consigliati

| Fascia | Condizione | Ruolo |
|--------|------------|--------|
| **Ideale** | G = N | Nessun tallone iniziale; formato di riferimento |
| **Sotto-G** | G_min <= G < N | Legale; in torneo meno equo su griglie grandi |
| **Overcrowd** | N < G <= 2N | Legale; tallone iniziale; partite spesso lunghe |

**Minimo consigliato** (torneo e promozione prodotto):

```
G_min = ceil(N/2)    (arrotondamento per eccesso)
```

**Eccezione:** su griglia **7x7**, G_min consigliato = **3** (non 4).

| Griglia | G ideale | G_min | G max consigliato | G max ammesso |
|---------|----------|-------|-------------------|---------------|
| 3x3 | 3 | 2 | 3 | 6 |
| 4x4 | 4 | 2 | 4 | 8 |
| 5x5 | 5 | 3 | 5 | 10 |
| 6x6 | 6 | 3 | 6 | 12 |
| 7x7 | 7 | **3** | 7 | 14 |
| 8x8 | 8 | 4 | 8 | 16 |

**Solitario:** non e' una modalita' Dura Mater (minimo **2 giocatori**). Il solitario del prodotto e' previsto solo nella variante Durissima (regolamento a parte).

---

## 4. Preparazione

1. Scegliete **N** (lato griglia) e **G** (giocatori), nel rispetto dei limiti sopra.
2. Filtrate il mazzo: solo carte con **Valore <= N**.
3. Mescolate le **N^2** carte ottenute.
4. Distribuite in mano:
   - se **G <= N:** **N carte** a ciascun giocatore;
   - se **G > N (overcrowd):** ripartizione **uguale** di tutte le N^2 carte — ciascuno riceve `floor(N^2 / G)` carte; le rimanenti formano il **tallone** (mazzo di pesca).
5. Verificate che ogni giocatore abbia **almeno 3** carte.

**Esempio:** 5x5 con 7 giocatori -> 3 carte ciascuno (21 in mano), **4** nel tallone.

**Controesempio:** 3x3 con 4 giocatori -> 2 carte a testa -> **non ammesso**.

---

## 5. La Dura Mater (griglia di gioco)

La **Dura Mater** e' la matrice **NxN** che si costruisce in partita.

- All'inizio la griglia **non ha posizione fissa** sul tavolo: conta solo la posizione **relativa** tra le carte.
- In ogni momento l'ingombro delle carte posate non puo' superare **N righe** e **N colonne**.
- Prima che i confini siano fissati, ogni posa deve essere tale che tutte le carte posate possano ancora entrare in **almeno una** matrice NxN.
- Dopo la chiusura, non si posano carte fuori dalla matrice NxN.

### Chiusura della Dura Mater

La Dura Mater e' **chiusa** quando l'ingombro delle carte raggiunge **NxN** (larghezza e altezza entrambe pari a N).

### Inversione del turno

Alla chiusura di **ciascun limite** della Dura Mater l'**ordine di gioco si inverte** (si prosegue nella direzione opposta; l'elenco dei giocatori non cambia).

1. **Primo limite** — una sequenza continua di **N** carte in orizzontale **oppure** in verticale fissa una dimensione della griglia (larghezza o altezza).
2. **Secondo limite** — una posa porta l'ingombro al formato **NxN** (Dura Mater chiusa).

Dopo ogni inversione, chi aveva il turno passa al giocatore **precedente** nell'ordine ciclico iniziale (es. A -> B -> C diventa C -> B -> A).

**Eccezione:** se **nello stesso turno** si chiudono entrambi i limiti, le due inversioni si **annullano** e la direzione resta quella in corso prima di quel turno.

Ogni inversione si valuta **al momento della posa** della carta che chiude il limite.

---

## 6. Turno di gioco

- I giocatori agiscono a turno secondo l'ordine iniziale e la **direzione** in vigore.
- Nel proprio turno si possono posare **da 1 a 4 carte**, piu' eventualmente una **quinta** tramite l'**Idea** (sezione 8).
- Si puo' chiudere il turno posando **meno di 4** carte anche se altre mosse legali sono disponibili.

### Pesca di fine turno

- Se il **tallone non e' vuoto**, a fine turno si pesca **sempre 1 carta** — sia dopo aver posato, sia dopo un **passo** (turno chiuso senza posate).
- Passare senza posare e' lecito: si pesca ugualmente; le carte restano in mano (in torneo, a monte, conta solo cio' che resta in mano).
- Tallone vuoto: nessuna pesca.

### Passo e mosse legali

- Senza mosse legali, il giocatore **passa** (e pesca se il tallone non e' vuoto).
- Passare **con mosse disponibili** e' lecito dal motore ma va contro l'obiettivo di svuotare la mano; puo' essere una scelta strategica rischiosa.

### Monte (stallo)

Se per **G turni consecutivi** (un giro completo del tavolo) **nessun giocatore posa** una carta, la partita va a **monte** — **anche se il tallone non e' vuoto**. Ogni posa azzera il contatore dei pass consecutivi.

---

## 7. Posa delle carte

### Regole generali

- La **prima carta** della partita si posa **liberamente** (nessuna adiacenza richiesta).
- Ogni carta successiva deve essere **adiacente ortogonalmente** (su/giu/sinistra/destra) ad almeno una carta gia' in gioco. Le diagonali **non** contano.
- La carta posata deve **condividere almeno una caratteristica** (valore, forma o colore) con **ogni** carta adiacente ortogonalmente. La caratteristica condivisa **non** deve essere la stessa per tutte le adiacenze.

### Requisito crescente nel turno

Nel corso dello **stesso turno**, il numero minimo di adiacenze compatibili richieste **cresce** con l'ordine di posa:

| Ordine di posa nel turno | Requisito |
|--------------------------|-----------|
| 1a carta | 1 adiacenza compatibile |
| 2a carta | 2 adiacenze compatibili |
| 3a carta | 3 adiacenze compatibili |
| 4a carta | 4 adiacenze compatibili |

La **prima carta assoluta** della partita resta l'eccezione (requisito 0 / posa libera).

Una carta con requisito 4 puo' essere posata solo in una casella circondata sui quattro lati da carte compatibili.

---

## 8. Idea (quinta carta cieca)

Se in un turno avete posato **quattro carte legali** e avete ancora **almeno una carta in mano**, realizzate un'**Idea**:

- Potete posare **una quinta carta** nello stesso turno, subito dopo la quarta.
- **Non** si pesca tra la quarta e la quinta posa.
- La quinta carta e' **opzionale**: potete chiudere il turno dopo la quarta.
- Dopo la quinta (o dopo aver chiuso senza usarla), il turno termina normalmente, con pesca di fine turno se prevista.
- Se la quarta carta **svuota la mano** (vittoria) o non restano carte, l'Idea **non** si applica.

### Quinta carta a faccia in giu'

- Si posa **a faccia in giu'**, adiacente ad **almeno una** carta in gioco, con i **limiti della Dura Mater** come ogni altra posa.
- **Nessun** vincolo di compatibilita' con i vicini al momento della posa.
- Conta per **limiti** e **chiusura** della Dura Mater come una carta normale.
- Per i **legami tra carte** (grado di posa, vicini compatibili, ancoraggio) e' un **buco** nella griglia: **non** conta come vicino occupato, come il bordo esterno.
- In seguito, il lato che tocca la carta coperta **non** richiede tratti in comune (come il bordo della griglia).
- Non si puo' posare una carta **solo** sul jolly: serve sempre almeno un vicino **scoperto** con tratto in comune (salvo la **prima carta** della partita).

**Informazione:** in partita competitiva e torneo solo chi posa conosce la carta; in Durissima cooperativa e' nota a tutti.

---

## 9. Partita competitiva — obiettivo e vittoria

- **Obiettivo:** finire per primo le carte in mano.
- **Vittoria:** immediata dopo la posa che svuota la mano, **prima** della pesca di fine turno. Carte nel tallone **non** impediscono la vittoria.

---

## 10. Torneo a punteggio

Il torneo usa le **stesse regole di gioco** della partita competitiva (posa, pesca, Idea, Dura Mater, monte), ma **obiettivo, come termina ciascuna partita del torneo e punteggio** sono diversi. **Non** si applica alla Durissima Mater.

### Principi

- Ogni giocatore resta nella **stessa sede** (G1, G2, ...) per tutto il torneo.
- Vince il torneo chi totalizza **piu' punti** sommando tutte le **partite**.
- Dopo ogni partita, chi **inizia** la partita successiva **avanza di una sede** in senso orario (con G giocatori, dopo G partite si completa un ciclo).

### Fine di una partita del torneo

A differenza della partita libera, **la partita non finisce** al primo che svuota le carte in mano. La partita del torneo termina quando:

1. **Tutti** i giocatori hanno finito le carte in mano, oppure
2. Si verifica il **monte** (un **giro** di tavolo: G turni consecutivi senza posate da nessuno).

#### Arrivi (tutti finiscono)

Ogni giocatore che svuota le carte in mano riceve punti pari al **numero di giocatori ancora in gioco** in quel momento (incluso se stesso).

**Esempio con G = 4:** primo che finisce **4** punti; secondo **3**; terzo **2**; ultimo **1**.

#### Monte

- Stessa condizione della partita libera: G pass consecutivi senza posate (un giro senza posate).
- **Penalita':** ogni giocatore **ancora in gioco** con carte in mano riceve **-1 punto per ogni carta** in mano. Chi e' gia' uscito (mano vuota) non ha penalita'. Le carte nel **tallone non contano**.

### Punti durante la partita del torneo

| Evento | Punti |
|--------|--------|
| Svuotamento carte in mano (con k giocatori ancora in gioco, incluso chi finisce) | **+k** |
| **Idea:** posa della **4a carta legale** nel turno | **+1** (subito alla 4a posa; indipendente dalla 5a) |
| Monte: ogni carta ancora **in mano** | **-1** per carta |

Se la 4a carta svuota le carte in mano, valgono i punti di arrivo; l'Idea come quinta carta non si applica.

### Durata del torneo

- Formato simmetrico naturale: **G partite** (una per ogni rotazione di chi inizia).
- Con **G molto alto** (es. 16) si puo' concordare un **punteggio bersaglio** prima del torneo.

### Riepilogo partita libera vs torneo

| | Partita libera | Partita in torneo |
|---|----------------|-------------------|
| Primo che svuota le carte in mano | Fine partita, un vincitore | Punti arrivo, **partita continua** |
| Idea (4a carta) | Opzione 5a carta | **+1** punto torneo |
| Monte | Stallo, nessun punteggio | **-1** / carta in mano |

---

## 11. Riepilogo rapido (solo Dura Mater)

| Aspetto | Regola |
|---------|--------|
| Giocatori | Da **2** a **2N** (no solitario) |
| Formato ideale | **G = N** |
| Obiettivo | **Mano vuota** per primo |
| Pesca fine turno | **Sempre** se tallone non vuoto (anche su pass) |
| Max pose per turno | 4 (+ Idea opzionale) |
| Monte | **G** pass consecutivi senza posate |
| Torneo | Si (punteggio cumulativo) |

---

*Documento derivato da `RULES.md` (sezione Dura Mater). Per implementazione e test automatici vedi il repository del progetto.*