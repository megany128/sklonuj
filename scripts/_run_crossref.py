#!/usr/bin/env python3
import json, os, sys

BASE = "/Users/meganyap/Desktop/projects.nosync/sklonuj"

# Load word bank
with open(os.path.join(BASE, "src/lib/data/word_bank.json")) as f:
    word_bank = json.load(f)

# Load chapters
with open(os.path.join(BASE, "src/lib/data/kzk_chapters.json")) as f:
    chapters_data = json.load(f)

# Build sets
wb_lemmas = {w["lemma"] for w in word_bank}
a1_lemmas = {w["lemma"] for w in word_bank if w.get("difficulty") == "A1"}

# Collect all KzK1 coreLemmas (expanded from slash-separated entries)
all_kzk1_core = set()
for ch in chapters_data["kzk1"]["chapters"]:
    for lemma in ch["coreLemmas"]:
        for part in lemma.split("/"):
            all_kzk1_core.add(part.strip())

# Unassigned: A1 words not in any KzK1 chapter
unassigned = sorted(a1_lemmas - all_kzk1_core)

# Gaps: coreLemmas parts not in word bank
gaps = []
for ch in chapters_data["kzk1"]["chapters"]:
    for lemma in ch["coreLemmas"]:
        for part in lemma.split("/"):
            p = part.strip()
            if p and p not in wb_lemmas:
                gaps.append(f"{ch['id']}: {lemma} -> '{p}'")

# Print summary
print(f"A1 word bank lemmas (glossary proxy): {len(a1_lemmas)}")
print(f"Already in chapter coreLemmas: {len(a1_lemmas & all_kzk1_core)}")
print(f"Newly added to unassignedLemmas: {len(unassigned)}")
print(f"Chapter coreLemma gaps (not in word bank): {len(gaps)}")
for g in gaps:
    print(f"  GAP: {g}")

# Update kzk_chapters.json - add unassignedLemmas to kzk1 book level
chapters_data["kzk1"]["unassignedLemmas"] = unassigned

with open(os.path.join(BASE, "src/lib/data/kzk_chapters.json"), "w") as f:
    json.dump(chapters_data, f, ensure_ascii=False, indent="\t")
    f.write("\n")

print(f"\nUpdated kzk_chapters.json with {len(unassigned)} unassignedLemmas")
print(f"\nFirst 30 unassigned: {unassigned[:30]}")
print(f"Last 30 unassigned: {unassigned[-30:]}")
