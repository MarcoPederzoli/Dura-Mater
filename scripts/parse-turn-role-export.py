import json
import sys
from pathlib import Path

def slot_stats(cell, players):
    w = cell.get("winsByInitialTurnSlot") or [0] * 8
    played = cell.get("playedByInitialTurnSlot") or [0] * 8
    points = cell.get("pointsByInitialTurnSlot") or [0] * 8
    rows = []
    for slot in range(players):
        if played[slot]:
            ratio = points[slot] / played[slot] * 100
            rows.append((slot, ratio, w[slot], played[slot]))
    if len(rows) < 2:
        return None
    devs = [r[1] - 100 for r in rows]
    spread = max(devs) - min(devs)
    starter = cell.get("starterWins", 0)
    succ = cell["done"] - cell["stalls"]
    return {
        "spread": spread,
        "best": max(rows, key=lambda r: r[1]),
        "worst": min(rows, key=lambda r: r[1]),
        "starter_pct": starter / succ * 100 if succ else 0,
        "expected_starter": 100 / players,
        "stall_pct": cell["stalls"] / cell["done"] * 100,
        "done": cell["done"],
    }


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "tests/dura-mater-sim-turn-role-audit-2026-06-05-13-53-32.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    scenarios = [f"{n}x{n}" for n in range(3, 9)]

    for step in data["steps"]:
        label = step["stepLabel"]
        cells = step.get("cells") or {}
        a = step.get("analysis", {})
        it = a.get("initialTurn", {})
        print(f"\n=== {label} ===")
        print(
            f"Totale: successo {a['summary']['successPct']:.1f}%, stallo {a['summary']['stallPct']:.1f}% | "
            f"spread aggregato (ingannevole) {it.get('spread', 0):.1f} pt | "
            f"chi apre vince {it.get('starterWinPct', 0):.1f}% (atteso globale {it.get('expectedStarterWinPct', 0):.1f}%)"
        )
        dm = a.get("dmCloser", {})
        if dm and not dm.get("skipped"):
            print(f"DM closer: {dm.get('verdict', '')[:120]}")

        print("Per scenario G=L (confronto equo):")
        spreads = []
        for sid in scenarios:
            cell = cells.get(sid)
            if not cell:
                continue
            L = int(sid[0])
            if cell.get("players") != L:
                continue
            st = slot_stats(cell, L)
            if not st:
                continue
            spreads.append(st["spread"])
            print(
                f"  {sid}: spread {st['spread']:.1f} pt | "
                f"1° vince {st['starter_pct']:.1f}% (atteso {st['expected_starter']:.1f}%) | "
                f"stallo {st['stall_pct']:.1f}% | "
                f"migliore {st['best'][0] + 1}° ({st['best'][1]:.1f}%) "
                f"peggiore {st['worst'][0] + 1}° ({st['worst'][1]:.1f}%)"
            )
        if spreads:
            print(f"  Media spread G=L: {sum(spreads) / len(spreads):.1f} pt")


if __name__ == "__main__":
    main()