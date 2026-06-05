Per un gioco di carte devo definire un mazzo di 64 carte.
Ogni carta ha: un VALORE, una FORMA e un COLORE.
Ciascuna di queste proprietà è definita in 8 varianti:
VALORE: 1,2,3,4,5,6,7,8
FORMA: Cerchi, Cuori, Triangoli, Quadrati, Stelle, Esagoni, Frecce, Fiori
COLORE: Rosso, Arancione, Giallo, Verde, Ciano, Indaco, Magenta, Nero

Ognuna di queste varianti deve comparire un numero di volte definito: 1, 3, 5, 7, 9, 11, 13, 15 (somma 64). Quindi Il colore Nero deve comparire 15 volte, la forma Quadrato deve comparire 7 volte, il valore 2 deve comparire 3 volte.

Non devono esistere carte con stesso VALORE; FORMA e COLORE. Vorrei poi, se possibile, che nessuna carta condividesse due caratteristiche, ma, credo non sia possibile, quindi, nel caso, vorrei minimizzare il numero di coppie che hanno due caratteristiche comuni.

Vorrei che tu mi facessi una piccola paginetta web che permette sia di fare la ricerca automatica di una soluzione al mio problema, sia di visualizzare, con una qualche forma tabellare (ad esempio una tabella in cui in riga ci sono le forme, in colonna i valori e nelle celle compare un pallino per ogni colore di cui esiste una carta con quelle 3 caratteristiche).

Fammi domande su ciò che non è chiaro e crea un file README.md che indica lo scopo del progetto e un file AGENTS.md con le istruzioni che ti serviranno per lavorare.

Decidi tu se ti serve una build o se il problema è abbastanza semplice da creare una singola html SPA direttamente.
