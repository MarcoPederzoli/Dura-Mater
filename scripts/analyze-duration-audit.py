"""Analisi durata partite: G<=N vs G>N dagli export simulatore."""
import json
import re
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAY = ROOT / "tests" / "dura-mater-sim-playability-audit-2026-06-06-12-05-42.json"
OVER = ROOT / "tests" / "dura-mater-sim-overcrowd-audit-2026-06-06-11-34-14.json"


def extract_cells(data):
    cells = {}
    for step in data.get("steps", []):
        for k, v in (step.get("cells") or {}).items():
            cells[k] = v
    return cells


def metrics(v, lid, gid):
    done = v.get("done") or 0
    if not done:
        return None
    avg = v["turnSum"] / done
    hand = v.get("initialHandSize")
    if hand is None:
        total = lid * lid
        hand = lid if gid <= lid else total // gid
    overcrowd = gid > lid
    rounds = avg / gid
    return {
        "L": lid,
        "G": gid,
        "avg": avg,
        "min": v.get("turnMin"),
        "max": v.get("turnMax"),
        "hand": hand,
        "overcrowd": overcrowd,
        "rounds": rounds,
        "done": done,
        "all_pct": 100 * v.get("gamesAllPlayersPlaced", 0) / done,
        "last_pct": 100 * v.get("gamesLastPlayerPlaced", 0) / done,
        "avg_placed": v.get("playersPlacedSum", 0) / done,
    }


def parse_cells(cells):
    rows = []
    for k, v in cells.items():
        m = re.match(r"(\d+)x(\d+)", k)
        if not m:
            continue
        L, G = int(m.group(1)), int(m.group(2))
        r = metrics(v, L, G)
        if r:
            rows.append(r)
    return rows


def summarize_group(name, group):
    if not group:
        return
    avgs = [r["avg"] for r in group]
    rounds = [r["rounds"] for r in group]
    g_range = f"G={group[0]['G']}-{group[-1]['G']}"
    print(f"  {name} ({len(group)} formati, {g_range}):")
    print(
        f"    turni medi: min {min(avgs):.1f} | med {statistics.median(avgs):.1f} | max {max(avgs):.1f}"
    )
    print(
        f"    giri medi (turni/G): min {min(rounds):.2f} | med {statistics.median(rounds):.2f} | max {max(rounds):.2f}"
    )
    short = [r for r in group if r["rounds"] < 2]
    if short:
        ids = ", ".join(
            f"{r['L']}x{r['G']}({r['avg']:.0f} turni, {r['hand']} carte)" for r in short
        )
        print(f"    sotto 2 giri completi: {len(short)} -> {ids}")
    else:
        print("    sotto 2 giri completi: 0")


def main():
    play = parse_cells(extract_cells(json.loads(PLAY.read_text(encoding="utf-8"))))
    print("=== PLAYABILITY AUDIT (matrice L×G, strategia P, ordine casuale) ===")
    print(f"Celle: {len(play)}")
    print()

    for L in range(3, 9):
        sub = sorted([r for r in play if r["L"] == L], key=lambda r: r["G"])
        classic = [r for r in sub if not r["overcrowd"]]
        crowd = [r for r in sub if r["overcrowd"]]
        print(f"L={L}×{L}:")
        summarize_group("G≤N (classico)", classic)
        summarize_group("G>N (overcrowd)", crowd)
        if classic and crowd:
            med_c = statistics.median([r["avg"] for r in classic])
            med_o = statistics.median([r["avg"] for r in crowd])
            print(f"    Δ mediana turni: {med_c:.1f} → {med_o:.1f} ({med_o - med_c:+.1f})")
        print()

    print("=== TUTTI I FORMATI CON MENO DI 2 GIRI COMPLETI (turni/G < 2) ===")
    short_all = sorted([r for r in play if r["rounds"] < 2], key=lambda r: (r["L"], r["G"]))
    for r in short_all:
        tag = "overcrowd" if r["overcrowd"] else "classico"
        print(
            f"  {r['L']}×{r['G']}: {r['avg']:.1f} turni, {r['rounds']:.2f} giri, "
            f"{r['hand']} carte, ultimo posa {r['last_pct']:.0f}%, tutti {r['all_pct']:.0f}% [{tag}]"
        )
    print(f"Totale: {len(short_all)} / {len(play)}")
    print()

    print("=== CLASSICO (G≤N): tabella L × G ===")
    print(f"{'L':>3} {'G':>3} {'carte':>5} {'turni':>6} {'giri':>5} {'ult%':>5} {'tutti%':>6}")
    for r in sorted([x for x in play if not x["overcrowd"]], key=lambda x: (x["L"], x["G"])):
        print(
            f"{r['L']:>3} {r['G']:>3} {r['hand']:>5} {r['avg']:>6.1f} {r['rounds']:>5.2f} "
            f"{r['last_pct']:>5.0f} {r['all_pct']:>6.0f}"
        )
    print()

    print("=== OVERCROWD (G>N): tabella L × G ===")
    print(f"{'L':>3} {'G':>3} {'carte':>5} {'turni':>6} {'giri':>5} {'ult%':>5} {'tutti%':>6}")
    for r in sorted([x for x in play if x["overcrowd"]], key=lambda x: (x["L"], x["G"])):
        print(
            f"{r['L']:>3} {r['G']:>3} {r['hand']:>5} {r['avg']:>6.1f} {r['rounds']:>5.2f} "
            f"{r['last_pct']:>5.0f} {r['all_pct']:>6.0f}"
        )
    print()

    print("=== OVERCROWD AUDIT: baseline G=L vs overcrowd per L ===")
    over_data = json.loads(OVER.read_text(encoding="utf-8"))
    seen_L = set()
    for step in over_data.get("steps", []):
        cfg = step.get("config", {})
        lid = cfg.get("lMin")
        if not lid or lid in seen_L:
            continue
        if cfg.get("gMin", 0) > lid:
            continue
        cells = step.get("cells", {})
        base_key = f"{lid}x{lid}"
        if base_key not in cells:
            continue
        seen_L.add(lid)
        b = metrics(cells[base_key], lid, lid)
        oc = []
        for k, v in cells.items():
            m = re.match(rf"{lid}x(\d+)", k)
            if m and int(m.group(1)) > lid:
                oc.append(metrics(v, lid, int(m.group(1))))
        if not b:
            continue
        oc.sort(key=lambda r: r["G"])
        print(
            f"L={lid}: baseline {lid}×{lid} → {b['avg']:.1f} turni "
            f"({b['rounds']:.2f} giri, {b['hand']} carte)"
        )
        for r in oc:
            print(
                f"       overcrowd {r['L']}×{r['G']} → {r['avg']:.1f} turni "
                f"({r['rounds']:.2f} giri, {r['hand']} carte)  ultimo={r['last_pct']:.0f}%"
            )
        print()


if __name__ == "__main__":
    main()