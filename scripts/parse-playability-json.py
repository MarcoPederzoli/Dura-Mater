import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"))
rows = []
for step in data["steps"]:
    L = step["config"]["lMin"]
    for key, c in sorted(step["cells"].items(), key=lambda x: int(x[0].split("x")[1])):
        done = c["done"]
        G = c["players"]
        last = 100 * c.get("gamesLastPlayerPlaced", 0) / done
        allp = 100 * c.get("gamesAllPlayersPlaced", 0) / done
        avg = c.get("playersPlacedSum", 0) / done
        hand = c.get("initialHandSize")
        ratio = avg / G if G else 0
        if last >= 80 and ratio >= 0.85:
            verdict = "solido"
        elif last < 50 or ratio < 0.5:
            verdict = "fragile"
        else:
            verdict = "mediocre"
        rows.append((L, G, hand, last, allp, avg, ratio, verdict))

print("L\tG\thand\tlast%\tall%\tavg/G\tverdict")
for r in rows:
    print(f"{r[0]}\t{r[1]}\t{r[2]}\t{r[3]:.1f}\t{r[4]:.1f}\t{r[6]:.2f}\t{r[7]}")

print("\n--- FRAGILE ---")
for r in rows:
    if r[7] == "fragile":
        print(f"{r[0]}x{r[0]} G{r[1]} ({r[2]} carte): ultimo {r[3]:.1f}%, tutti {r[4]:.1f}%, media {r[5]:.2f}/{r[1]}")

print("\n--- SOLIDO con G > L ---")
for r in rows:
    if r[7] == "solido" and r[1] > r[0]:
        print(f"{r[0]}x{r[0]} G{r[1]} ({r[2]} carte): ultimo {r[3]:.1f}%, tutti {r[4]:.1f}%")

print("\n--- MAX G solido per L ---")
for L in range(3, 9):
    sub = [r for r in rows if r[0] == L and r[7] == "solido"]
    if sub:
        best = max(sub, key=lambda r: r[1])
        print(f"L={L}: fino a G={best[1]} ({best[2]} carte, ultimo {best[3]:.1f}%)")