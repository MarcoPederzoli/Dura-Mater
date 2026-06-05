import json
import sys
from pathlib import Path


def slot_stats(cell, players):
    wins = cell.get("winsByInitialTurnSlot") or [0] * 8
    succ = cell["done"] - cell["stalls"]
    if succ < 1:
        return None
    expected = 100 / players
    win_rates = [wins[i] / succ * 100 for i in range(players)]
    deviations = [abs(win_rates[i] - expected) for i in range(players)]
    return {
        "spread": max(win_rates) - min(win_rates),
        "max_dev": max(deviations),
        "win_rates": win_rates,
        "expected": expected,
        "stall_pct": cell["stalls"] / cell["done"] * 100,
    }


def main():
    path = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else "tests/dura-mater-sim-turn-inversion-modes-2026-06-05-14-48-17.json"
    )
    data = json.loads(path.read_text(encoding="utf-8"))
    steps = {step["config"]["turnOrderMode"]: step for step in data["steps"]}
    scenarios = [f"{n}x{n}" for n in range(3, 9)]

    print("Confronto dm-close vs axis-close (G=L, ruolo nel turno)")
    print("spread = differenza max-min % vittorie; max_dev = scostamento max da parita\n")

    dm_spreads, ax_spreads = [], []
    axis_wins = 0
    compared = 0

    for sid in scenarios:
        players = int(sid[0])
        dm_cell = steps["dm-close"]["cells"].get(sid)
        ax_cell = steps["axis-close"]["cells"].get(sid)
        if not dm_cell or not ax_cell or dm_cell.get("players") != players:
            continue
        dm = slot_stats(dm_cell, players)
        ax = slot_stats(ax_cell, players)
        if not dm or not ax:
            continue
        compared += 1
        dm_spreads.append(dm["spread"])
        ax_spreads.append(ax["spread"])
        if ax["max_dev"] < dm["max_dev"] - 0.5:
            axis_wins += 1
            tag = "axis"
        elif dm["max_dev"] < ax["max_dev"] - 0.5:
            tag = "dm"
        else:
            tag = "~="
        print(
            f"{sid}: spread {dm['spread']:.1f}% vs {ax['spread']:.1f}% | "
            f"max_dev {dm['max_dev']:.1f}pp vs {ax['max_dev']:.1f}pp -> {tag}"
        )

    print(
        f"\nMedia spread: dm-close {sum(dm_spreads) / len(dm_spreads):.1f}% | "
        f"axis-close {sum(ax_spreads) / len(ax_spreads):.1f}%"
    )
    print(f"axis-close piu equo in {axis_wins}/{compared} scenari G=L\n")

    for mode, title in [("dm-close", "Cambio solo DM"), ("axis-close", "Doppio cambio assi+DM")]:
        step = steps[mode]
        summary = step["analysis"]["summary"]
        print(f"--- {title} ---")
        print(f"Successo {summary['successPct']:.1f}%, stallo {summary['stallPct']:.1f}%")
        for sid in scenarios:
            cell = step["cells"].get(sid)
            if not cell or cell.get("players") != int(sid[0]):
                continue
            st = slot_stats(cell, cell["players"])
            if not st:
                continue
            roles = ", ".join(
                f"{i + 1}={st['win_rates'][i]:.0f}%"
                for i in range(cell["players"])
            )
            print(f"  {sid} (atteso {st['expected']:.0f}%): {roles}")


if __name__ == "__main__":
    main()