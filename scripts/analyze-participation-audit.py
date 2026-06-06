"""Partecipazione reale dagli export simulatore (metriche nuove + legacy)."""
import json
import re
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"


def latest_export():
    candidates = sorted(
        list(TESTS.glob("dura-mater-sim-participation*.json"))
        + list(TESTS.glob("dura-mater-sim-playability*.json")),
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


def participation_from_cell(v, G):
    done = v.get("done") or 0
    if not done:
        return {}
    if v.get("totalPlacementsSum") is not None:
        return {
            "avg_cards_per_player": v["totalPlacementsSum"] / done / G,
            "avg_min_placements": v.get("minPlacementsPerGameSum", 0) / done,
            "zero_game_pct": 100 * v.get("gamesWithZeroPlacementPlayer", 0) / done,
            "one_game_pct": 100 * v.get("gamesWithOnePlacementPlayer", 0) / done,
            "all_two_plus_pct": 100 * v.get("gamesEveryoneAtLeastTwoPlacements", 0) / done,
            "avg_one_players": v.get("onePlacementPlayersSum", 0) / done,
        }
    return {
        "avg_cards_per_player": None,
        "legacy_only": True,
    }


def row_from_cell(k, v):
    m = re.match(r"(\d+)x(\d+)", k)
    if not m:
        return None
    L, G = int(m.group(1)), int(m.group(2))
    done = v.get("done") or 0
    if not done:
        return None
    part = participation_from_cell(v, G)
    return {
        "id": k,
        "L": L,
        "G": G,
        "overcrowd": G > L,
        "hand": v.get("initialHandSize") or (L if G <= L else (L * L) // G),
        "g_vs_2n": G / (2 * L),
        **part,
        "all_pct": 100 * v.get("gamesAllPlayersPlaced", 0) / done,
        "last_pct": 100 * v.get("gamesLastPlayerPlaced", 0) / done,
    }


def main():
    play = latest_export()
    if not play or not play.exists():
        print("Nessun export in tests/ (dura-mater-sim-participation*.json o playability*.json)")
        return
    print(f"File: {play.name}")
    data = json.loads(play.read_text(encoding="utf-8"))
    cells = extract_cells(data)
    if not cells and data.get("cells"):
        cells = data["cells"]
    rows = [row_from_cell(k, v) for k, v in cells.items()]
    rows = [r for r in rows if r]
    has_new = any(r.get("avg_cards_per_player") is not None for r in rows)
    if not has_new:
        print("Export senza metriche nuove: rieseguire playability-audit dopo aggiornamento simulatore.")
        return

    print("=== PARTECIPAZIONE PER CELLA ===")
    print(f"{'LxG':>6} {'G/2N':>5} {'carte':>5} {'pose/g':>6} {'min':>5} {'0pos%':>6} {'1pos%':>6} {'≥2%':>6}")
    for r in sorted(rows, key=lambda x: (x["L"], x["G"])):
        if r.get("avg_cards_per_player") is None:
            continue
        print(
            f"{r['id']:>6} {r['g_vs_2n']:>5.2f} {r['hand']:>5} "
            f"{r['avg_cards_per_player']:>6.2f} {r['avg_min_placements']:>5.2f} "
            f"{r['zero_game_pct']:>6.1f} {r['one_game_pct']:>6.1f} {r['all_two_plus_pct']:>6.1f}"
        )

    print()
    print("=== CONFRONTO G≤N vs G>N (mediane) ===")
    for L in range(3, 9):
        sub = [r for r in rows if r["L"] == L and r.get("avg_cards_per_player") is not None]
        if not sub:
            continue
        cl = [r for r in sub if not r["overcrowd"]]
        oc = [r for r in sub if r["overcrowd"]]
        if cl:
            base = cl[-1]
            print(
                f"L={L} classico {base['id']}: pose/g={base['avg_cards_per_player']:.2f}, "
                f"≥2 pose={base['all_two_plus_pct']:.0f}%"
            )
        if oc:
            print(
                f"       overcrowd med: pose/g={statistics.median([r['avg_cards_per_player'] for r in oc]):.2f}, "
                f"1pos partita={statistics.median([r['one_game_pct'] for r in oc]):.0f}%, "
                f"≥2={statistics.median([r['all_two_plus_pct'] for r in oc]):.0f}%"
            )

    print()
    print("=== OLTRE G=2N (orientamento regola) ===")
    over_2n = sorted([r for r in rows if r.get("avg_cards_per_player") is not None and r["G"] > 2 * r["L"]], key=lambda x: (x["L"], x["G"]))
    for r in over_2n[:20]:
        print(
            f"  {r['id']}: G/2N={r['g_vs_2n']:.2f}, 1pos={r['one_game_pct']:.0f}%, "
            f"≥2={r['all_two_plus_pct']:.0f}%, min pose={r['avg_min_placements']:.2f}"
        )
    print(f"  ... totale celle con G>2N: {len(over_2n)}")


if __name__ == "__main__":
    main()