#!/usr/bin/env python3
"""Cap CEFR difficulty for KzK1 chapter vocabulary by lesson position.

"Čeština krok za krokem 1" spans A1->A2: its first half (lessons 1-12) is A1
and its second half (lessons 13-24) is A2. Every lemma in a kzk1 chapter's
``coreLemmas`` (src/lib/data/kzk_chapters.json, the instructor-sheet truth)
is therefore capped at the level of the earliest lesson that teaches it:
a B1/B2 word taught in lesson 3 becomes A1, one taught in lesson 20 becomes
A2. Words already at or below the cap are left alone, so a basic word the
textbook happens to introduce late is never pushed *up* out of the A1 pool.

The same value is written to scripts/starter_nouns_meta.csv so the bank and
the meta CSV agree (the bank builder keeps the JSON difficulty in
``--merge --only`` mode and takes the CSV with ``--take-meta``; either way
the two must not drift).

Idempotent. After running, normalise formatting with `pnpm format`.
"""

import csv
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_BANK = os.path.join(BASE, "src/lib/data/word_bank.json")
KZK_CHAPTERS = os.path.join(BASE, "src/lib/data/kzk_chapters.json")
STARTER_META = os.path.join(BASE, "scripts/starter_nouns_meta.csv")

LEVEL_ORDER = ["A1", "A2", "B1", "B2"]


def cap_for_chapter(index: int, chapter_count: int) -> str:
    """0-based chapter index -> CEFR cap. First half A1, second half A2."""
    return "A1" if index < chapter_count / 2 else "A2"


def main() -> None:
    with open(WORD_BANK, encoding="utf-8") as f:
        word_bank = json.load(f)
    with open(KZK_CHAPTERS, encoding="utf-8") as f:
        chapters = json.load(f)["kzk1"]["chapters"]

    # Earliest chapter wins when a lemma recurs.
    cap_by_lemma: dict[str, str] = {}
    for index, chapter in enumerate(chapters):
        cap = cap_for_chapter(index, len(chapters))
        for lemma in chapter["coreLemmas"]:
            cap_by_lemma.setdefault(lemma, cap)

    new_difficulty: dict[str, str] = {}
    changed: list[tuple[str, str, str]] = []
    for word in word_bank:
        cap = cap_by_lemma.get(word["lemma"])
        if cap is None:
            continue
        current = word["difficulty"]
        if LEVEL_ORDER.index(current) > LEVEL_ORDER.index(cap):
            changed.append((word["lemma"], current, cap))
            word["difficulty"] = cap
        new_difficulty[word["lemma"]] = word["difficulty"]

    with open(WORD_BANK, "w", encoding="utf-8") as f:
        json.dump(word_bank, f, ensure_ascii=False, indent="\t")
        f.write("\n")

    # Sync the meta CSV for every KzK1 lemma so the two sources agree.
    with open(STARTER_META, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    csv_changed = 0
    for row in rows:
        target = new_difficulty.get(row["lemma"])
        if target is not None and row["difficulty"] != target:
            row["difficulty"] = target
            csv_changed += 1
    with open(STARTER_META, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    missing = sorted(set(cap_by_lemma) - set(new_difficulty))
    print(f"capped {len(changed)} KzK1 nouns in word_bank.json")
    for lemma, before, after in changed:
        print(f"  {lemma}: {before} -> {after}")
    print(f"synced {csv_changed} rows in starter_nouns_meta.csv")
    if missing:
        print(f"WARNING: {len(missing)} chapter lemmas not in the bank: {', '.join(missing)}")


if __name__ == "__main__":
    main()
