#!/usr/bin/env python3
"""Convert starter_nouns.csv to word_bank.json."""

import csv
import json
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
CSV_PATH = SCRIPT_DIR / "starter_nouns.csv"
JSON_PATH = SCRIPT_DIR.parent / "src" / "lib" / "data" / "word_bank.json"

SG_COLS = ["sg_nom", "sg_gen", "sg_dat", "sg_acc", "sg_voc", "sg_loc", "sg_ins"]
PL_COLS = ["pl_nom", "pl_gen", "pl_dat", "pl_acc", "pl_voc", "pl_loc", "pl_ins"]


def main():
    words = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            words.append(
                {
                    "lemma": row["lemma"],
                    "translation": row["translation"],
                    "gender": row["gender"],
                    "animate": row["animate"].lower() == "true",
                    "paradigm": row["paradigm"],
                    "difficulty": row["difficulty"],
                    "categories": [c.strip() for c in row["categories"].split(",")],
                    "forms": {
                        "sg": [row[c] for c in SG_COLS],
                        "pl": [row[c] for c in PL_COLS],
                    },
                }
            )

    JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

    # Summary
    paradigms = Counter(w["paradigm"] for w in words)
    difficulties = Counter(w["difficulty"] for w in words)

    print(f"Total words: {len(words)}")
    print(f"Output: {JSON_PATH}")
    print()
    print("By paradigm:")
    for k, v in sorted(paradigms.items()):
        print(f"  {k}: {v}")
    print()
    print("By difficulty:")
    for k, v in sorted(difficulties.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
