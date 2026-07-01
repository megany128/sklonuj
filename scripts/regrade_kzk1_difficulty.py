#!/usr/bin/env python3
"""Re-grade CEFR difficulty for KzK1-sourced nouns by lesson position.

bulk_add_missing.py originally stamped every KzK1 word with a blanket A1. In
reality "Čeština krok za krokem 1" spans A1->A2: its first half (lessons 1-10)
is A1 and its second half (lessons 11-19) is A2. This script corrects the
difficulty field in word_bank.json for KzK1 nouns accordingly.

Starter-curated lemmas (those present in starter_nouns_meta.csv) keep their
authoritative difficulty and are never touched. recognition_only status tracks
production vs. recognition and is orthogonal to the CEFR level.

Idempotent. After running, normalise formatting with `pnpm format`.
"""

import csv
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_BANK = os.path.join(BASE, "src/lib/data/word_bank.json")
KZK1_NOUNS = os.path.join(BASE, "scripts/kzk1_nouns.json")
STARTER_META = os.path.join(BASE, "scripts/starter_nouns_meta.csv")

KZK1_A1_MAX_LESSON = 10


def main() -> None:
    with open(WORD_BANK, encoding="utf-8") as f:
        word_bank = json.load(f)

    lesson_by_lemma: dict[str, int] = {}
    with open(KZK1_NOUNS, encoding="utf-8") as f:
        for noun in json.load(f).get("nouns", []):
            for part in noun["lemma"].split("/"):
                lesson_by_lemma.setdefault(part.strip(), noun["lesson"])

    starter: set[str] = set()
    with open(STARTER_META, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            starter.add(row["lemma"])

    changed = 0
    for word in word_bank:
        lesson = lesson_by_lemma.get(word["lemma"])
        if lesson is None or word["lemma"] in starter:
            continue
        expected = "A1" if lesson <= KZK1_A1_MAX_LESSON else "A2"
        if word["difficulty"] != expected:
            word["difficulty"] = expected
            changed += 1

    with open(WORD_BANK, "w", encoding="utf-8") as f:
        json.dump(word_bank, f, ensure_ascii=False, indent="\t")
        f.write("\n")

    print(f"regraded {changed} KzK1 nouns")


if __name__ == "__main__":
    main()
