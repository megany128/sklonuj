#!/usr/bin/env python3
"""Parse the Columbia KzK1 noun vocabulary sheet (xlsx export) into
``scripts/kzk1_sheet.json``.

The sheet is a Google Sheet maintained by the Columbia Czech instructor: one
column per declension paradigm (plus "plurália tantum", "nesklonné",
"adjektivní"), one block of rows per lesson ("lekce N" in column A). Cell
formatting carries meaning that a CSV export loses, which is why this reads
the xlsx directly (no openpyxl dependency — plain zipfile + XML):

  * green fill  (D9EAD3) — noun appears only in exercise instructions
                            ("classroom" vocabulary; not drilled)
  * yellow fill (FFF2CC) — not in the textbook at that point, but the
                            instructor adds it there
  * italic      — diverges in at least one form from the regular paradigm

Cells may hold several words ("králík, králíček", "email, e-mail"), an
optional attributive prefix ("(Česká) republika"), or a trailing note
("taxi (neut.)", "šachy (jako hrad, ale o šachách)"). Each word becomes its
own entry; the note and prefix are preserved verbatim.

Usage:
    python3 scripts/parse_kzk1_sheet.py <path-to-xlsx>

Downstream:
    python3 scripts/build_kzk1_chapters.py   # regenerates kzk1 coreLemmas
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_PATH = SCRIPT_DIR / "kzk1_sheet.json"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
GREEN_FILL = "FFD9EAD3"
YELLOW_FILL = "FFFFF2CC"

# Spelling slips in the sheet, corrected to the dictionary lemma. The original
# spelling is kept in ``sheetSpelling`` so the instructor can be told. Only
# unambiguous slips belong here. Two are left as written until the instructor
# confirms what was meant: "průplava" (lesson 23, filed under *žena*; Cimrman
# lore suggests *průplav*) and "připravka" (lesson 20, a cooking lesson, where
# *příprava* "preparation" fits better than *přípravka* "prep course"). Both
# therefore show up as "not in word bank" in build_kzk1_chapters.py, as do
# "hranolka" (lesson 3, fem. sg of a word the bank has as hranolek/hranolky)
# and "sluchátka" (lesson 15, listed as plurale tantum; bank has sluchátko).
TYPO_FIXES: dict[str, str] = {
    "skadatel": "skladatel",
    "Framcouz": "Francouz",
    "hroč": "hroch",
    "bohuslužba": "bohoslužba",
    "němcina": "němčina",
    "skleníce": "sklenice",
    "dopívání": "dospívání",
    "vydej": "výdej",
    "scénarista": "scénárista",
    "leginy": "legíny",
    "zachranná": "záchranná",
}


def _col_row(ref: str) -> tuple[int, int]:
    m = re.match(r"([A-Z]+)(\d+)$", ref)
    if not m:
        raise ValueError(f"bad cell ref {ref!r}")
    col = 0
    for ch in m.group(1):
        col = col * 26 + ord(ch) - 64
    return col, int(m.group(2))


def read_cells(xlsx_path: Path) -> list[dict]:
    """Return every non-empty cell with its text, fill and italic flag."""
    z = zipfile.ZipFile(xlsx_path)

    styles = ET.fromstring(z.read("xl/styles.xml"))
    fonts_el = styles.find("m:fonts", NS)
    fills_el = styles.find("m:fills", NS)
    xfs_el = styles.find("m:cellXfs", NS)
    if fonts_el is None or fills_el is None or xfs_el is None:
        raise ValueError("styles.xml missing fonts/fills/cellXfs")

    font_italic = []
    for f in fonts_el:
        i = f.find("m:i", NS)
        # <i/> and <i val="1"/> mean italic; <i val="0"/> explicitly not.
        font_italic.append(i is not None and i.attrib.get("val", "1") not in ("0", "false"))
    fill_rgb: list[str | None] = []
    for f in fills_el:
        pf = f.find("m:patternFill", NS)
        fg = pf.find("m:fgColor", NS) if pf is not None else None
        solid = pf is not None and pf.attrib.get("patternType") == "solid"
        if solid and fg is not None and "rgb" not in fg.attrib:
            # Theme/indexed colours can't be matched against GREEN/YELLOW_FILL;
            # such a cell would be silently treated as plain.
            print(
                f"WARNING: solid fill without rgb ({dict(fg.attrib)}) — "
                "export the sheet with explicit colours",
                file=sys.stderr,
            )
        fill_rgb.append(fg.attrib.get("rgb") if (solid and fg is not None) else None)
    xfs = [
        (int(x.attrib.get("fontId", 0)), int(x.attrib.get("fillId", 0))) for x in xfs_el
    ]

    shared: list[str] = []
    sst = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in sst.findall("m:si", NS):
        shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

    sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    cells: list[dict] = []
    for c in sheet.iter(f"{{{NS['m']}}}c"):
        v = c.find("m:v", NS)
        if v is None or v.text is None:
            continue
        text = shared[int(v.text)] if c.attrib.get("t") == "s" else v.text
        if not text.strip():
            continue
        col, row = _col_row(c.attrib["r"])
        font_id, fill_id = xfs[int(c.attrib.get("s", 0))]
        cells.append(
            {
                "row": row,
                "col": col,
                "text": text,
                "italic": font_italic[font_id],
                "fill": fill_rgb[fill_id],
            }
        )
    return cells


def split_cell(raw: str) -> tuple[list[str], str | None, str | None]:
    """Split a cell into (words, optionalPrefix, note)."""
    raw = raw.strip()
    prefix: str | None = None
    note: str | None = None
    body = raw
    if raw.startswith("("):
        m = re.match(r"^\(([^)]*)\)\s*(.+)$", raw)
        if m:
            prefix, body = m.group(1), m.group(2)
            prefix = " ".join(TYPO_FIXES.get(w, w) for w in prefix.split())
    else:
        m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", raw)
        if m:
            body, note = m.group(1), m.group(2)
    words = [w.strip() for w in body.split(",") if w.strip()]
    return words, prefix, note


def parse(xlsx_path: Path) -> list[dict]:
    cells = read_cells(xlsx_path)
    header = {c["col"]: c["text"].strip() for c in cells if c["row"] == 1}

    lesson_of_row: dict[int, int] = {}
    current: int | None = None
    for row in sorted({c["row"] for c in cells}):
        for c in cells:
            if c["row"] == row and c["col"] == 1:
                m = re.search(r"\d+", c["text"])
                if m:
                    current = int(m.group())
        if current is not None:
            lesson_of_row[row] = current

    entries: list[dict] = []
    unknown_fills: dict[str, int] = {}
    for c in sorted(cells, key=lambda c: (c["row"], c["col"])):
        if c["row"] == 1 or c["col"] == 1:
            continue
        lesson = lesson_of_row.get(c["row"])
        if lesson is None:
            continue
        if c["fill"] not in (None, GREEN_FILL, YELLOW_FILL):
            unknown_fills[c["fill"]] = unknown_fills.get(c["fill"], 0) + 1
        words, prefix, note = split_cell(c["text"])
        for i, word in enumerate(words):
            # "příbuzný (masc.), příbuzná (fem.)" — per-word gender tags
            inner = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", word)
            word_note = note
            if inner:
                word, word_note = inner.group(1), inner.group(2)
            fixed = TYPO_FIXES.get(word, word)
            entry: dict = {
                "lesson": lesson,
                "paradigmColumn": header.get(c["col"], ""),
                "lemma": fixed,
                "cellText": c["text"].strip(),
                "instructionsOnly": c["fill"] == GREEN_FILL,
                "instructorAddition": c["fill"] == YELLOW_FILL,
                "irregularForm": bool(c["italic"]),
            }
            if fixed != word:
                entry["sheetSpelling"] = word
            if word_note:
                entry["note"] = word_note
            if prefix:
                entry["optionalPrefix"] = prefix
            if i > 0:
                first = re.sub(r"\s*\([^)]*\)\s*$", "", words[0])
                entry["variantOf"] = TYPO_FIXES.get(first, first)
            entries.append(entry)
    if unknown_fills:
        # A fill that is neither green nor yellow is most likely a different
        # shade of one of them (or a theme colour); refuse to guess.
        raise ValueError(
            "unrecognised cell fills (count per ARGB): "
            + ", ".join(f"{k}×{v}" for k, v in sorted(unknown_fills.items()))
        )
    return entries


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 1
    entries = parse(Path(argv[1]))
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent="\t")
        f.write("\n")
    lessons = sorted({e["lesson"] for e in entries})
    print(
        f"Wrote {len(entries)} entries across lessons {lessons[0]}–{lessons[-1]} "
        f"to {OUTPUT_PATH.relative_to(SCRIPT_DIR.parent)}",
        file=sys.stderr,
    )
    print(
        f"  instructions-only (green): {sum(e['instructionsOnly'] for e in entries)}, "
        f"instructor additions (yellow): {sum(e['instructorAddition'] for e in entries)}, "
        f"irregular (italic): {sum(e['irregularForm'] for e in entries)}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
