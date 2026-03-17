#!/usr/bin/env python3
"""
Cross-reference word bank with kzk_chapters to find unassigned KzK1 nouns.

Since we cannot extract the PDF directly, we use the word bank's categories
and difficulty levels to identify KzK1-relevant nouns. We also look at the
kzk1_nouns.json (per-chapter extraction) for additional context.

Strategy: A word is a "KzK1 glossary noun" if it appears in the word bank
AND has difficulty A1 or A2 (KzK1 level vocabulary), since the word bank
was built from KzK1/KzK2 textbook content.

We refine this by checking which words are in the per-chapter kzk1_nouns.json
(which was extracted from the chapter PDFs) but not yet in coreLemmas.
"""

import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load all data
with open(os.path.join(BASE, "src/lib/data/word_bank.json")) as f:
    word_bank = json.load(f)

with open(os.path.join(BASE, "src/lib/data/kzk_chapters.json")) as f:
    chapters_data = json.load(f)

with open(os.path.join(BASE, "scripts/kzk1_nouns.json")) as f:
    kzk1_nouns = json.load(f)

# Build word bank lemma set
wb_lemmas = {w["lemma"] for w in word_bank}
wb_by_difficulty = {}
for w in word_bank:
    d = w.get("difficulty", "")
    wb_by_difficulty.setdefault(d, set()).add(w["lemma"])

print(f"Word bank total: {len(wb_lemmas)}")
for d, s in sorted(wb_by_difficulty.items()):
    print(f"  {d}: {len(s)}")

# Build kzk1_nouns lemma set (from per-chapter PDF extraction)
kzk1_extracted_lemmas = set()
for noun in kzk1_nouns["nouns"]:
    lemma = noun["lemma"]
    # Handle compound lemmas like "asistent/asistentka"
    for part in lemma.split("/"):
        kzk1_extracted_lemmas.add(part.strip())
print(f"\nKzK1 per-chapter extracted nouns (expanded): {len(kzk1_extracted_lemmas)}")

# Collect all KzK1 coreLemmas (already assigned to chapters)
all_kzk1_core = set()
all_kzk1_core_raw = set()  # Keep the raw entries too for gap checking
for ch in chapters_data["kzk1"]["chapters"]:
    for lemma in ch["coreLemmas"]:
        all_kzk1_core_raw.add(lemma)
        for part in lemma.split("/"):
            all_kzk1_core.add(part.strip())
print(f"KzK1 coreLemmas (raw entries): {len(all_kzk1_core_raw)}")
print(f"KzK1 coreLemmas (expanded): {len(all_kzk1_core)}")

# Find KzK1 glossary nouns: words in word bank that are KzK1-level
# A1 words are from KzK1, A2 from KzK2
# But the user said there are 624 glossary-in-wb-but-not-in-chapters words
# Let's check all word bank entries since the glossary covers all KzK1 words
# The user said these are specifically in the full KzK1 glossary

# Since we can't parse the PDF, we'll identify KzK1-level words as:
# 1. Words in kzk1_extracted_lemmas (from per-chapter PDFs) that are in word bank
# 2. Words with difficulty A1 in word bank (typical KzK1 level)
# 3. Union of both, minus what's already in coreLemmas

# First let's see what the per-chapter extraction gives us
extracted_in_wb = kzk1_extracted_lemmas & wb_lemmas
extracted_not_in_core = extracted_in_wb - all_kzk1_core
print(f"\nPer-chapter extracted in word bank: {len(extracted_in_wb)}")
print(f"Per-chapter extracted NOT in coreLemmas: {len(extracted_not_in_core)}")
if extracted_not_in_core:
    print("  Examples:", sorted(extracted_not_in_core)[:20])

# A1 words not in coreLemmas
a1_lemmas = wb_by_difficulty.get("A1", set())
a1_not_in_core = a1_lemmas - all_kzk1_core
print(f"\nA1 word bank lemmas: {len(a1_lemmas)}")
print(f"A1 NOT in coreLemmas: {len(a1_not_in_core)}")

# Let's use A1 as the proxy for "KzK1 glossary" since the user mentioned 624
# and A1 is the KzK1 difficulty level
# The unassigned = A1 words in word bank, not in any KzK1 chapter coreLemma
unassigned = sorted(a1_not_in_core)
print(f"\nCandidate unassigned KzK1 lemmas: {len(unassigned)}")

# Check gaps: coreLemmas NOT in word bank
gaps = []
for ch in chapters_data["kzk1"]["chapters"]:
    for lemma in ch["coreLemmas"]:
        parts = lemma.split("/")
        for part in parts:
            part = part.strip()
            if part and part not in wb_lemmas:
                gaps.append((ch["id"], lemma, part))

print(f"\n=== GAPS: coreLemmas not in word bank ({len(gaps)}) ===")
for ch_id, raw, part in gaps:
    print(f"  {ch_id}: {raw} -> missing '{part}'")

# Print summary
print(f"\n=== SUMMARY ===")
print(f"A1 words in word bank: {len(a1_lemmas)}")
print(f"Already in chapter coreLemmas: {len(a1_lemmas & all_kzk1_core)}")
print(f"Newly identified as unassigned: {len(unassigned)}")
print(f"Chapter coreLemma gaps (not in word bank): {len(gaps)}")

# Output the unassigned list as JSON for inspection
with open(os.path.join(BASE, "scripts/unassigned_kzk1.json"), "w") as f:
    json.dump(unassigned, f, ensure_ascii=False, indent=2)
print(f"\nWrote unassigned list to scripts/unassigned_kzk1.json")

# Also print all unassigned for inspection
print(f"\n=== ALL UNASSIGNED ({len(unassigned)}) ===")
for u in unassigned:
    print(f"  {u}")
