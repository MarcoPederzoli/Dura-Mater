"""Stima rapporto carte a disposizione vs successo Durissima solitario."""
import math

pool_solo = {3: 24.1, 4: 12.8, 5: 3.8, 6: 0.7, 7: 0.2}
vita1_solo = {3: 22.1, 4: 11.1, 5: 0.7, 6: 0.0}
riserva_solo = {3: 23.5, 4: 6.2, 5: 0.0, 6: 0.0, 7: 0.0, 8: 0.0}
buffer_solo = {3: 13.7, 4: 2.0, 5: 0.0, 6: 0.0, 7: 0.0, 8: 0.0}
senza_solo = {3: 0.0, 4: 0.0, 5: 0.0, 6: 0.0, 7: 0.0, 8: 0.0}


def f_hand(N, G=1):
    total = N * N
    cpp = N if G <= N else total // G
    return G * cpp / total


def f_equiv_pool(N, k=1):
    return (N + k * N) / (N * N)


def fit_exp(points):
    xs, ys = zip(*points)
    logy = [math.log(max(y, 1e-5)) for y in ys]
    n = len(xs)
    mx = sum(xs) / n
    my = sum(logy) / n
    denom = sum((x - mx) ** 2 for x in xs)
    b = sum((x - mx) * (y - my) for x, y in zip(xs, logy)) / denom
    a = my - b * mx
    return a, b


def f_for_target(a, b, target):
    return (math.log(target) - a) / b


def main():
    print("=== Solo: frazione carte vs successo % ===\n")
    print(f"{'N':>3} {'f_mano':>8} {'f_2N':>8} {'Pool':>7} {'Riserva':>8} {'Vita1':>7} {'Buffer':>7}")
    for N in range(3, 9):
        print(
            f"{N:3d} {1/N:7.1%} {2/N:7.1%} "
            f"{pool_solo.get(N, float('nan')):7.1f} "
            f"{riserva_solo.get(N, float('nan')):7.1f} "
            f"{vita1_solo.get(N, float('nan')):7.1f} "
            f"{buffer_solo.get(N, float('nan')):7.1f}"
        )

    pts = [(2 / N, pool_solo[N] / 100) for N in pool_solo]
    a, b = fit_exp(pts)
    print("\n=== Fit su Pool N (modello f_equiv = 2/N, p in frazione) ===")
    print(f"log(p) = {a:.3f} + {b:.3f} * f_equiv")
    print("Stime f_equiv per obiettivo di successo solitario:\n")
    for target, label in [
        (0.20, "~20% (3x1 attuale)"),
        (0.10, "~10% (4x1 attuale)"),
        (0.05, "~5%  (soglia 'giocabile')"),
        (0.01, "~1%  (raro ma non zero)"),
        (0.001, "~0.1% (quasi impossibile)"),
    ]:
        f_req = f_for_target(a, b, target)
        print(f"  {label:28s} -> f_equiv >= {f_req:6.1%}  (~{f_req*100:.0f}% carte/total nel modello 2N)")

    print("\n=== Osservazioni empiriche (senza fit) ===\n")
    print("Mano sola (1/N) senza aiuti: 0% su L3-L8 -> f=33%-12.5% NON basta mai.")
    print("Pool N (~2/N): successo >0% fino a f~28.6% (7x7), ma <1% oltre f~33%.")
    print("Riserva (2/N visibili, no reshuffle): 3x1 ok, 4x1 debole, 5x1+ 0%.")
    print("=> 2/N 'vedere carte' basta al 3x1; dal 5x1 serve molto più accesso reale.")

    print("\n=== Multi: frazione carte in mano (inizio partita) ===\n")
    for N, G in [(3, 1), (3, 3), (4, 4), (6, 6), (8, 2), (8, 4), (8, 8)]:
        fh = f_hand(N, G)
        print(f"  {N}x{G}: {fh:.1%} delle {N*N} carte in mano ai giocatori")

    print("\n=== Stima grossolana 'carte da conoscere' per vincere ===\n")
    # interpolazione empirica: a 66.7% (3x1) ~24%; a 50% (4x1) ~13%; a 40% (5x1) ~4%
    # per 20% successo serve f tra 60-70%? extrapolate from steep curve
    print("Per ~20% successo solitario (oggi solo 3x1): f_equiv ~ 60-70% nel modello semplice.")
    print("Per ~10% successo (4x1): f_equiv ~ 45-55%.")
    print("Per ~5% successo (soglia minima 'a tavolo'): f_equiv ~ 35-45%.")
    print("Per ~1% successo (5x1 con pool): f_equiv ~ 38-42% — ma pool != vedere carte.")
    print("\nSe traduci in 'carte visibili/conoscibili' (riserva+mani+mazzo noto):")
    print("  - 3x1: ~6 carte su 9 (67%) — coerente col tuo esempio.")
    print("  - 4x1: per 10% servirebbero ~8-9 su 16 (50-56%) con accesso UTILE, non solo nominale.")
    print("  - 6x1: per anche solo 1% con pool, f nominale 33% ma accesso utile molto più alto (reshuffle).")
    print("  - Per 6x1+ SENZA reshuffle: i dati riserva suggeriscono f>=50-75% visibili o scelte reali.")


if __name__ == "__main__":
    main()