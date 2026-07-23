# Ricostruzione log — solitario 6x6 (Biancaneve)

Log UI: eventi dal piu' recente al piu' vecchio; ricostruzione in ordine cronologico.
Seed: non presente nel log.

Celle: 36 | bbox x=[-5..0] y=[-3..2] | 6x6
Codici unici: 36
Jolly Idea: 666 @ (-5,0)

## Griglia finale (codice; J = ideaBlind)

```
         -5    -4    -3    -2    -1     0
y= -3  586  554  674  663  637  247
y= -2  687  655  684  564  577  467
y= -1  675  445  646  548  587  227
y=  0 J666  575  678  118  588  328
y=  1  456  478  428  538  348  356
y=  2  486  688  238  437  367  336
```

## Sequenza cronologica delle pose

 1.      328 @ (0, 0)
 2.      588 @ (-1, 0)
 3.      227 @ (0, -1)
 4.      587 @ (-1, -1)
 5.      118 @ (-2, 0)
 6.      548 @ (-2, -1)
 7.      678 @ (-3, 0)
 8.      646 @ (-3, -1)
 9.      575 @ (-4, 0)
10.      445 @ (-4, -1)
11.      348 @ (-1, 1)
12.      367 @ (-1, 2)
13.      437 @ (-2, 2)
14.      684 @ (-3, -2)
15.      428 @ (-3, 1)
16.      577 @ (-1, -2)
17.      467 @ (0, -2)
18.      564 @ (-2, -2)
19.      538 @ (-2, 1)  [offerta Idea dopo questa posa — log]
20. IDEA 666 @ (-5, 0)
21.      655 @ (-4, -2)
22.      554 @ (-4, -3)
23.      674 @ (-3, -3)
24.      663 @ (-2, -3)
25.      675 @ (-5, -1)
26.      238 @ (-3, 2)
27.      687 @ (-5, -2)
28.      586 @ (-5, -3)
29.      336 @ (0, 2)
30.      356 @ (0, 1)
31.      247 @ (0, -3)
32.      637 @ (-1, -3)
33.      688 @ (-4, 2)
34.      478 @ (-4, 1)
35.      486 @ (-5, 2)
36.      456 @ (-5, 1)

## Turni

Numero turni: 22
Carte/turno: 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 1, 5, 1, 2, 1, 2, 1, 1, 2, 2, 2, 2
Max catena: 5
Fine forzata (nessuna altra posa): 11 · Chiudi volontario: 11

- T1 (1 pose, fine auto): 328:(0,0)
- T2 (1 pose, fine auto): 588:(-1,0)
- T3 (2 pose, fine auto): 227:(0,-1) → 587:(-1,-1)
- T4 (2 pose, fine auto): 118:(-2,0) → 548:(-2,-1)
- T5 (2 pose, fine auto): 678:(-3,0) → 646:(-3,-1)
- T6 (2 pose, fine auto): 575:(-4,0) → 445:(-4,-1)
- T7 (1 pose, chiude): 348:(-1,1)
- T8 (1 pose, chiude): 367:(-1,2)
- T9 (1 pose, chiude): 437:(-2,2)
- T10 (1 pose, chiude): 684:(-3,-2)
- T11 (1 pose, chiude): 428:(-3,1)
- T12 (5 pose, chiude): 577:(-1,-2) → 467:(0,-2) → 564:(-2,-2) → 538:(-2,1) → J666:(-5,0)
- T13 (1 pose, chiude): 655:(-4,-2)
- T14 (2 pose, fine auto): 554:(-4,-3) → 674:(-3,-3)
- T15 (1 pose, chiude): 663:(-2,-3)
- T16 (2 pose, fine auto): 675:(-5,-1) → 238:(-3,2)
- T17 (1 pose, chiude): 687:(-5,-2)
- T18 (1 pose, chiude): 586:(-5,-3)
- T19 (2 pose, fine auto): 336:(0,2) → 356:(0,1)
- T20 (2 pose, fine auto): 247:(0,-3) → 637:(-1,-3)
- T21 (2 pose, fine auto): 688:(-4,2) → 478:(-4,1)
- T22 (2 pose, chiude): 486:(-5,2) → 456:(-5,1)

## Note sul log Idea

Turno Idea (cronologico): quattro pose 577 → 467 → 564 → 538 (log: offerta quinta), poi **jolly 666 @ (-5,0)** e chiusura turno.
Il jolly 666 e' sul bordo sinistro della griglia finale (colonna x=-5, riga y=0), come buco topologico verso il packing del lato ovest.

Turni con >=4 pose: T12:5
