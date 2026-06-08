"""Completamento matrice Durissima Mater dagli export simulatore."""
import json
import re
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"


def latest_export():
    candidates = sorted(
        TESTS.glob("dura-mater-sim-durissima*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def extract_cells(data):
    cells = {}
    for step in data.get("steps", []):
        for k, v in (step.get("cells") or {}).items():
            cells[k] = v
    return cells


def row_from_cell(k, v):
    m = re.match(r"(\d+)x(\d+)", k)
    if not m:
        return None
    L, G = int(m.group(1)), int(m.group(2))
    done = v.get("done") or 0
    if not done:
        return None
    successes = done - (v.get("stalls") or 0)
    return {
        "id": k,
        "L": L,
        "G": G,
        "classic": G <= L,
        "hand": v.get("initialHandSize"),
        "draw": v.get("initialDrawCount"),
        "success_pct": 100 * successes / done,
        "stall_pct": 100 * (v.get("stalls") or 0) / done,
        "dm_closed_pct": 100 * (v.get("dmClosedCount") or 0) / done,
        "avg_turns": (v.get("turnSum") or 0) / done,
        "done": done,
    }


def main():
    path = latest_export()
    if not path or not path.exists():
        print("Nessun export in tests/ (dura-mater-sim-durissima*.json)")
        return
    print(f"File: {path.name}")
    data = json.loads(path.read_text(encoding="utf-8"))
    cells = extract_cells(data)
    if not cells and data.get("cells"):
        cells = data["cells"]
    rows = [row_from_cell(k, v) for k, v in cells.items()]
    rows = [r for r in rows if r]
    if not rows:
        print("Nessuna cella con partite simulate.")
        return

    print("=== COMPLETAMENTO MATRICE (DURISSIMA) ===")
    print(f"{'LxG':>6} {'carte':>5} {'pesca':>5} {'ok%':>6} {'stall%':>7} {'DM%':>6} {'turni':>6}")
    for r in sorted(rows, key=lambda x: (x["L"], x["G"])):
        print(
            f"{r['id']:>6} {r['hand'] or '-':>5} {r['draw'] or '-':>5} "
            f"{r['success_pct']:>6.1f} {r['stall_pct']:>7.1f} {r['dm_closed_pct']:>6.1f} "
            f"{r['avg_turns']:>6.1f}"
        )

    print()
    print("=== PER LIVELLO (mediana successPct) ===")
    for L in range(3, 9):
        sub = [r for r in rows if r["L"] == L]
        if not sub:
            continue
        classic = [r for r in sub if r["classic"]]
        oc = [r for r in sub if not r["classic"]]
        line = f"L={L}: mediana {statistics.median([r['success_pct'] for r in sub]):.1f}%"
        if classic:
            g_eq_n = next((r for r in classic if r["G"] == L), None)
            if g_eq_n:
                line += f" | G=N {g_eq_n['success_pct']:.1f}%"
        if oc:
            line += f" | overcrowd med {statistics.median([r['success_pct'] for r in oc]):.1f}%"
        print(line)

    print()
    print("=== PEGGIORI (successPct) ===")
    for r in sorted(rows, key=lambda x: x["success_pct"])[:12]:
        tag = "G=N" if r["G"] == r["L"] else ("oc" if not r["classic"] else "")
        print(
            f"  {r['id']}: ok {r['success_pct']:.1f}%, stall {r['stall_pct']:.1f}%"
            + (f" [{tag}]" if tag else "")
        )


if __name__ == "__main__":
    main()