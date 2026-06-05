"""Rigenera mappatura immagini da Carte.xlsx (col A = nome file, col B = codice)."""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "Carte.xlsx"


def read_pairs():
    with zipfile.ZipFile(XLSX) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join((t.text or "") for t in si.findall(".//m:t", NS)))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    rows = {}
    for cell in sheet.findall(".//m:sheetData/m:row/m:c", NS):
        ref = cell.attrib["r"]
        col = "".join(c for c in ref if c.isalpha())
        row = int("".join(c for c in ref if c.isdigit()))
        value = cell.find("m:v", NS)
        if value is None:
            continue
        text = value.text or ""
        if cell.attrib.get("t") == "s":
            text = shared[int(text)]
        rows.setdefault(row, {})[col] = str(text).strip()

    pairs = []
    for row in sorted(rows):
        data = rows[row]
        if "A" not in data or "B" not in data:
            continue
        image = str(data["A"]).zfill(2)
        code = str(data["B"]).zfill(3)
        pairs.append((image, code))
    if len(pairs) != 64:
        raise SystemExit(f"Attese 64 righe, trovate {len(pairs)}")
    return pairs


def patch_file(path, pattern, replacement):
    text = path.read_text(encoding="utf-8")
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"Pattern non trovato in {path}")
    path.write_text(new_text, encoding="utf-8")


def main():
    pairs = read_pairs()
    codes = [int(code) for _, code in pairs]

    codes_block = ", ".join(str(c) for c in codes)
    codes_lines = ",\n    ".join(
        ", ".join(str(c) for c in codes[i : i + 16]) for i in range(0, 64, 16)
    )

    art_entries = ",\n    ".join(
        f'["{code}", "grafica/{image}.jpg"]' for image, code in pairs
    )

    core_path = ROOT / "mpcards-core.js"
    patch_file(
        core_path,
        r"const SIM_DECK_CODES = \[[\s\S]*?\];",
        f"const SIM_DECK_CODES = [\n    {codes_lines}\n  ];",
    )

    art_path = ROOT / "card-art.js"
    art_body = f'''\"use strict\";

/** Generato da Carte.xlsx — col A = file in grafica/, col B = codice carta. */
(function () {{
  const IMAGE_BY_CODE = new Map([
    {art_entries}
  ]);

  const CODES = [
    {codes_lines}
  ];

  globalThis.MPCardsArt = {{
    dir: "grafica",
    back: "grafica/Back.jpg",
    codes: CODES.map(c => String(c).padStart(3, "0")),
    imageForCode(code) {{
      return IMAGE_BY_CODE.get(String(code).padStart(3, "0")) || null;
    }},
    codeForImage(imageName) {{
      const key = String(imageName).replace(/\\.jpg$/i, "").padStart(2, "0");
      for (const [code, file] of IMAGE_BY_CODE) {{
        if (file.endsWith(`/${{key}}.jpg`)) return code;
      }}
      return null;
    }},
    entries() {{
      return Array.from(IMAGE_BY_CODE.entries()).map(([code, file]) => ({{ code, file }}));
    }}
  }};
}})();
'''
    art_path.write_text(art_body, encoding="utf-8")

    deck_path = ROOT / "deck-manager.js"
    deck_text = ", ".join(str(c) for c in codes)
    deck_wrapped = ",\n".join(
        deck_text[i : i + 60] for i in range(0, len(deck_text), 60)
    )
    patch_file(
        deck_path,
        r'text: `[\s\S]*?`',
        f"text: `{deck_wrapped}`",
        # only within KNOWN_DECKS - need more specific pattern
    )
    print("OK:", len(pairs), "coppie da", XLSX.name)
    print("Aggiornati:", core_path.name, art_path.name)
    print("Esegui manualmente deck-manager se il patch non e' andato a buon fine.")


if __name__ == "__main__":
    main()