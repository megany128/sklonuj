#!/usr/bin/env python3
"""Rewrite the KzK1 ``coreLemmas`` lists in ``src/lib/data/kzk_chapters.json``
from ``scripts/kzk1_sheet.json`` (see ``parse_kzk1_sheet.py``).

The instructor's sheet is the source of truth for which nouns belong to which
lesson. Per lesson, ``coreLemmas`` becomes every sheet noun that

  * is not marked instructions-only (green) — those are classroom
    meta-vocabulary ("substantivum", "cvičení"), not declension practice;
  * exists in ``word_bank.json`` (lower-cased match), so proper nouns,
    indeclinables and adjectival nouns fall out until the bank supports them.

``scripts/kzk1_extra_lemmas.json`` adds, per chapter, common textbook nouns
that the sheet does not list (kept from the earlier glossary-based chapter
lists, filtered to standard A1/A2 vocabulary). Sheet words that need the
instructor's confirmation are deliberately not aliased in.

Everything else in the chapter config (cases, prepositions, subtitles,
pronoun lemmas) is left untouched. The KzK2 book is not touched at all.

Usage:
    python3 scripts/build_kzk1_chapters.py            # rewrite + report
    python3 scripts/build_kzk1_chapters.py --check    # report only, exit 1 if stale
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
SHEET_PATH = SCRIPT_DIR / "kzk1_sheet.json"
EXTRA_PATH = SCRIPT_DIR / "kzk1_extra_lemmas.json"
WORD_BANK_PATH = SCRIPT_DIR.parent / "src" / "lib" / "data" / "word_bank.json"
CHAPTERS_PATH = SCRIPT_DIR.parent / "src" / "lib" / "data" / "kzk_chapters.json"


def main(argv: list[str]) -> int:
    check_only = "--check" in argv

    with open(SHEET_PATH, encoding="utf-8") as f:
        sheet = json.load(f)
    with open(WORD_BANK_PATH, encoding="utf-8") as f:
        bank_lemmas = {w["lemma"] for w in json.load(f)}
    with open(CHAPTERS_PATH, encoding="utf-8") as f:
        config = json.load(f)
    with open(EXTRA_PATH, encoding="utf-8") as f:
        extras: dict[str, list[str]] = json.load(f)

    per_lesson: dict[int, set[str]] = defaultdict(set)
    missing: dict[str, set[int]] = defaultdict(set)
    green: set[str] = set()
    drilled: set[str] = set()
    for entry in sheet:
        lemma = entry["lemma"].lower()
        if entry["instructionsOnly"]:
            green.add(lemma)
            continue
        drilled.add(lemma)
        if lemma in bank_lemmas:
            per_lesson[entry["lesson"]].add(lemma)
        else:
            missing[lemma].add(entry["lesson"])
    # A lemma that is green in one lesson but drilled in another is not
    # skipped, so only report the ones that are instructions-only everywhere.
    skipped_green = green - drilled

    chapters = config["kzk1"]["chapters"]
    unknown_extra = sorted(
        l for ls in extras.values() for l in ls if l not in bank_lemmas
    )
    if unknown_extra:
        print(
            f"ERROR: {EXTRA_PATH.name} lists lemma(s) not in word bank: "
            + ", ".join(unknown_extra),
            file=sys.stderr,
        )
        return 1
    changed = 0
    for chapter in chapters:
        lesson = int(chapter["id"].rsplit("_", 1)[1])
        new_core = sorted(per_lesson.get(lesson, set()) | set(extras.get(chapter["id"], [])))
        if chapter["coreLemmas"] != new_core:
            changed += 1
            if not check_only:
                chapter["coreLemmas"] = new_core

    total = sum(len(c["coreLemmas"]) for c in chapters)
    n_extra = sum(len(v) for v in extras.values())
    print(
        f"KzK1: {total} lemma slots across {len(chapters)} lessons "
        f"({n_extra} from {EXTRA_PATH.name})",
        file=sys.stderr,
    )
    for chapter in chapters:
        print(f"  {chapter['id']}: {len(chapter['coreLemmas'])} lemmas", file=sys.stderr)
    print(
        f"  skipped {len(skipped_green)} instructions-only lemma(s); "
        f"{len(missing)} sheet lemma(s) not in word bank: "
        + ", ".join(sorted(missing)),
        file=sys.stderr,
    )

    if check_only:
        print(f"{changed} chapter(s) out of date", file=sys.stderr)
        return 1 if changed else 0

    with open(CHAPTERS_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent="\t")
        f.write("\n")
    print(f"Updated {changed} chapter(s) in {CHAPTERS_PATH.name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
