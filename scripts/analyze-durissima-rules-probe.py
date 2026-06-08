"""Riepilogo successPct probe regole Durissima (solo + multi)."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"


def latest_export():
    candidates = sorted(
        TESTS.glob("dura-mater*durissima*rules-probe*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def success_pct(v):
    done = v.get("done") or 0
    if not done:
        return None
    return 100 * (done - (v.get("stalls") or 0)) / done


def main():
    path = latest_export()
    if not path:
        print("Nessun export rules-probe in tests/")
        return
    print(f"File: {path.name}\n")
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = []
    for step in data.get("steps", []):
        for key, cell in (step.get("cells") or {}).items():
            pct = success_pct(cell)
            if pct is None:
                continue
            m = re.match(r"(\d+)x(\d+)", key)
            rows.append((int(m.group(1)), int(m.group(2)), pct, cell.get("done", 0)))
    if not rows and data.get("cells"):
        for key, cell in data["cells"].items():
            pct = success_pct(cell)
            m = re.match(r"(\d+)x(\d+)", key)
            if pct is not None and m:
                rows.append((int(m.group(1)), int(m.group(2)), pct, cell.get("done", 0)))

    rows.sort(key=lambda r: (r[0], r[1]))
    print("LxG      ok%     n")
    print("-" * 24)
    for L, G, pct, n in rows:
        tag = "solo" if G == 1 else ("G=N" if G == L else "multi")
        print(f"{L}x{G:<2} {pct:6.1f}%  {n:>4}  ({tag})")

    solo = [pct for L, G, pct, _ in rows if G == 1]
    multi = [pct for L, G, pct, _ in rows if G > 1]
    if solo:
        print(f"\nSolitario: media {sum(solo) / len(solo):.1f}% su {len(solo)} celle")
    if multi:
        print(f"Multi:     media {sum(multi) / len(multi):.1f}% su {len(multi)} celle")


if __name__ == "__main__":
    main()