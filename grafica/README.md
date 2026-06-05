# Grafica carte — Dura Mater

## File

| File | Ruolo |
|------|--------|
| `01.jpg` … `64.jpg` | Facce (nome file **non** implica da solo il codice carta) |
| `Back.jpg` | Retro |

## Fonte di verità

La corrispondenza **immagine ↔ codice** è in `Carte.xlsx` (colonna A = nome senza `.jpg`, colonna B = codice a 3 cifre).

Il codice la applica in `card-art.js` e nell’ordine del mazzo in `mpcards-core.js`. Dopo modifiche al foglio:

```text
python scripts/sync-carte-from-xlsx.py
```

(oppure aggiornare manualmente seguendo il foglio).

## Esempi

| File | Codice |
|------|--------|
| 01.jpg | 118 |
| 23.jpg | 588 |
| 24.jpg | 586 |
| 64.jpg | 881 |

Prima del fix, il codice assumeva `NN.jpg` = carta alla posizione *N* nell’array del mazzo: **28 carte** risultavano con immagine sbagliata (es. `23.jpg` mostrava il codice 586 invece di 588).