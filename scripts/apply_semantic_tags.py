#!/usr/bin/env python3
"""Add semantic tags to word_bank.json from scripts/semantic_tag_patch.json.

Each key of the patch is a category/tag, each value the lemmas that get it.
The tag is appended to the noun's ``categories`` (existing order is kept).
A key written as ``-tag`` removes that tag from the listed lemmas instead,
for nouns that were mis-tagged (e.g. "-family": ["sekretář"]). The resulting
category list is mirrored into the matching row of
scripts/starter_nouns_meta.csv so a full rebuild keeps it. Lemmas match
case-insensitively (the bank capitalizes proper nouns, the CSV does not). Lemmas the
CSV doesn't know are reported, not added. A lemma missing from the bank is an
error, so a typo can't silently do nothing.

Idempotent. After running, normalise formatting with `pnpm format`.
"""

import csv
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_BANK = os.path.join(BASE, "src/lib/data/word_bank.json")
PATCH = os.path.join(BASE, "scripts/semantic_tag_patch.json")
STARTER_META = os.path.join(BASE, "scripts/starter_nouns_meta.csv")


def main() -> int:
    with open(PATCH, encoding="utf-8") as f:
        patch = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    with open(WORD_BANK, encoding="utf-8") as f:
        word_bank = json.load(f)
    by_lemma = {w["lemma"].lower(): w for w in word_bank}

    missing = sorted({l for ls in patch.values() for l in ls if l.lower() not in by_lemma})
    if missing:
        print(f"ERROR: not in word_bank.json: {', '.join(missing)}", file=sys.stderr)
        return 1

    conflicting = sorted(
        {
            l
            for k, ls in patch.items()
            if k.startswith("-") and k[1:] in patch
            for l in ls
            if l.lower() in {m.lower() for m in patch[k[1:]]}
        }
    )
    if conflicting:
        print(f"ERROR: tag both added and removed for: {', '.join(conflicting)}", file=sys.stderr)
        return 1

    touched: dict[str, list[str]] = {}
    added = 0
    removed = 0
    # Additions first, so a noun being re-tagged is never left empty in between.
    for key, lemmas in sorted(patch.items(), key=lambda kv: kv[0].startswith("-")):
        remove = key.startswith("-")
        tag = key[1:] if remove else key
        for lemma in lemmas:
            cats = by_lemma[lemma.lower()]["categories"]
            if remove and tag in cats:
                cats.remove(tag)
                removed += 1
                touched.setdefault(lemma, []).append(f"-{tag}")
            elif not remove and tag not in cats:
                cats.append(tag)
                added += 1
                touched.setdefault(lemma, []).append(f"+{tag}")
            if not cats:
                print(f"ERROR: removing '{tag}' leaves '{lemma}' with no category", file=sys.stderr)
                return 1

    with open(WORD_BANK, "w", encoding="utf-8") as f:
        json.dump(word_bank, f, ensure_ascii=False, indent="\t")
        f.write("\n")

    with open(STARTER_META, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    patched_lemmas = {l.lower() for ls in patch.values() for l in ls}
    csv_lemmas = {r["lemma"].lower() for r in rows}
    csv_changed = 0
    for row in rows:
        if row["lemma"].lower() in patched_lemmas:
            target = ",".join(by_lemma[row["lemma"].lower()]["categories"])
            if row["categories"] != target:
                row["categories"] = target
                csv_changed += 1
    with open(STARTER_META, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    print(f"added {added} and removed {removed} tags on {len(touched)} nouns in word_bank.json")
    for lemma, tags in sorted(touched.items()):
        print(f"  {lemma}: {', '.join(tags)}")
    print(f"synced {csv_changed} rows in starter_nouns_meta.csv")
    no_row = sorted(patched_lemmas - csv_lemmas)
    if no_row:
        print(f"no meta CSV row (JSON only): {', '.join(no_row)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
