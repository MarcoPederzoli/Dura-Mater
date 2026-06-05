# Requisiti simulatore batch

Il simulatore batch vive in `simulator.html` e usa `simulator.js`.
Le regole di gioco e le strategie sono definite in `mpcards-core.js`, condiviso con `index.html`.

`simulator.html` e' solo l'interfaccia statica: definisce controlli, tabelle e textarea del mazzo. Carica, in ordine, `version.js`, `mpcards-core.js`, `deck-manager.js` e `simulator.js`.

`simulator.js` legge i controlli della pagina, normalizza il mazzo tramite `MPCardsCore.parseDeckCodes`, inizializza `MPCardsDeckManager` sulla textarea dei codici e costruisce job indipendenti per ogni coppia valida `(L, G)`. La simulazione di una singola partita non vive nella UI: viene delegata a `MPCardsCore.simulateGame`, cosi' il comportamento resta allineato a `index.html`.

## Input

- `C`: numero di simulazioni per ogni caso, default `100`.
- `Lmin`: lato matrice minimo, default `3`.
- `Lmax`: lato matrice massimo, default `8`.
- `Gmin`: numero minimo di giocatori, default `1`.
- `Gmax`: numero massimo di giocatori, default `8`.
- `S`: strategia per ogni giocatore, default `auto`.

I casi validi sono solo quelli con `L >= G`. Per ogni coppia valida `(L, G)` vengono eseguite `C` partite.

## Mazzo

Il simulatore usa il mazzo finale incorporato in `mpcards-core.js` come array numerico `SIM_DECK_CODES`.

Per ogni partita con lato `L`, il sottomazzo e' composto dalle carte con prima cifra `<= L`; per il vincolo del mazzo questo produce `L * L` carte.

La pesca avviene a fine turno: prima di passare al giocatore successivo si pesca una carta dal mazzo di pesca, se disponibile, sia dopo aver giocato sia dopo aver passato. Se pero' una posa svuota la mano del giocatore, la partita termina subito e la pesca di fine turno non avviene.

## Strategie

Le strategie effettive disponibili sono:

- `A` / `high-value`: tra le mosse legali sceglie una carta con `VALORE` massimo, casuale a parita' di valore.
- `B` / `low-value`: tra le mosse legali sceglie una carta con `VALORE` minimo, casuale a parita' di valore.
- `M` / `compatibility`: tra le mosse legali sceglie una carta con punteggio di compatibilita' minimo. Il punteggio del codice `ABC` e' `comp[A] + comp[B] + comp[C]`, con `comp = [1, 3, 5, 7, 9, 11, 13, 15]`.
- `C` / `greedy`: preferisce mosse con meno caratteristiche condivise totali.
- `D` / `adjacent`: preferisce mosse con meno adiacenze.
- `E` / `draw-random-finish-random`: finche' il mazzo di pesca contiene carte gioca una sola carta casuale legale; quando il mazzo di pesca e' esaurito prova a giocare piu' carte possibile con criterio casuale.
- `R` / `random`: sceglie una mossa legale casuale.

L'interfaccia include anche `auto`, che non e' una strategia di gioco: a ogni partita assegna casualmente al giocatore una delle strategie effettive.

## Output

Il simulatore produce tre matrici `L x G`:

- rendimento per giocatore: percentuale rispetto all'aspettativa di vittoria e, se presente, percentuale di stallo;
- vittorie per strategia: percentuale di vittorie della strategia effettivamente usata dal vincitore e, se presente, percentuale di stallo;
- turni: numero minimo, medio e massimo di turni osservati per terminare con vittoria o stallo.

Ogni matrice include anche totali di riga, totali di colonna e totale complessivo. Questi totali non sommano le percentuali visibili nelle celle: aggregano i conteggi grezzi delle partite incluse e poi ricalcolano le stesse metriche della singola cella.

Nella matrice del rendimento per giocatore, una vittoria vale tanti punti quanti sono i giocatori della partita. Il valore mostrato e' `punti / partite giocate`. Quindi `100%` significa che il giocatore ha vinto in linea con l'aspettativa media, `>100%` significa che ha vinto piu' dell'aspettativa, `<100%` significa che ha vinto meno dell'aspettativa.

Per una singola cella con `G` fisso, questa metrica equivale a confrontare le vittorie reali con l'aspettativa `partite giocate / G`. Nei totali aggregati e' piu' robusta perche' ogni vittoria viene pesata con il numero di giocatori effettivamente presenti in quella partita.

Le statistiche vengono aggiornate progressivamente mentre i worker completano gruppi di simulazioni.

## Parallelismo

`simulator.js` usa Web Worker creati da Blob a runtime. Questo evita dipendenze da build e riduce i problemi quando la pagina viene aperta direttamente dal filesystem.

Il numero di worker e' configurabile. Il default usa `navigator.hardwareConcurrency`, limitato a un valore ragionevole per non saturare il browser.

Ogni worker riceve il sorgente condiviso `MPCARDS_CORE_SOURCE` esposto da `mpcards-core.js`, ricostruisce il core nel proprio contesto e restituisce conteggi aggregati. La pagina principale si limita a fondere i risultati, aggiornare progresso e tabelle, e interrompere i job ancora pendenti quando l'utente preme `Stop`.
