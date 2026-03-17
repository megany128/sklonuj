#!/usr/bin/env python3
"""
Comprehensive audit of CEFR levels and KzK chapter matching.

Checks:
1. CEFR level distribution and plausibility
2. KzK1 chapter coreLemmas vs word bank coverage
3. KzK2 chapter coreLemmas vs word bank coverage
4. kzk1_nouns.json / kzk2_nouns.json vs word bank coverage
5. CEFR level consistency with KzK book assignments
6. Corrupted translations in extraction files
7. Duplicate lemmas
8. Words in KzK chapters but missing from word bank
9. Words with implausible CEFR levels (e.g., "káva" at B2)
10. difficulty_patch.json analysis
"""

import json
import os
import sys
from collections import Counter, defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Load all data
with open(os.path.join(BASE, "src/lib/data/word_bank.json")) as f:
    word_bank = json.load(f)

with open(os.path.join(BASE, "src/lib/data/kzk_chapters.json")) as f:
    chapters_data = json.load(f)

with open(os.path.join(BASE, "scripts/kzk1_nouns.json")) as f:
    kzk1_nouns = json.load(f)

with open(os.path.join(BASE, "scripts/kzk2_nouns.json")) as f:
    kzk2_nouns = json.load(f)

patch_path = os.path.join(BASE, "scripts/difficulty_patch.json")
if os.path.exists(patch_path):
    with open(patch_path) as f:
        difficulty_patch = json.load(f)
else:
    difficulty_patch = []

# ============================================================
# Build indexes
# ============================================================
wb_by_lemma = {}
for w in word_bank:
    lemma = w["lemma"]
    if lemma in wb_by_lemma:
        print(f"  DUPLICATE in word_bank: '{lemma}'")
    wb_by_lemma[lemma] = w

wb_lemmas = set(wb_by_lemma.keys())

# CEFR distribution
cefr_counter = Counter()
for w in word_bank:
    cefr_counter[w.get("difficulty", "(none)")] += 1

# KzK chapter indexes
def expand_lemmas(raw_list):
    """Expand compound lemmas like 'asistent/asistentka' into individual parts."""
    expanded = set()
    for lemma in raw_list:
        for part in lemma.split("/"):
            expanded.add(part.strip())
    return expanded

kzk1_core_by_chapter = {}
kzk1_core_all = set()
kzk1_core_all_raw = set()
for ch in chapters_data.get("kzk1", {}).get("chapters", []):
    raw = ch["coreLemmas"]
    kzk1_core_all_raw.update(raw)
    expanded = expand_lemmas(raw)
    kzk1_core_by_chapter[ch["id"]] = expanded
    kzk1_core_all.update(expanded)

kzk2_core_by_chapter = {}
kzk2_core_all = set()
kzk2_core_all_raw = set()
for ch in chapters_data.get("kzk2", {}).get("chapters", []):
    raw = ch["coreLemmas"]
    kzk2_core_all_raw.update(raw)
    expanded = expand_lemmas(raw)
    kzk2_core_by_chapter[ch["id"]] = expanded
    kzk2_core_all.update(expanded)

# Extracted nouns from PDFs
kzk1_extracted = {}
for n in kzk1_nouns.get("nouns", []):
    for part in n["lemma"].split("/"):
        part = part.strip()
        kzk1_extracted[part] = n

kzk2_extracted = {}
if isinstance(kzk2_nouns, list):
    for n in kzk2_nouns:
        for part in n["lemma"].split("/"):
            part = part.strip()
            kzk2_extracted[part] = n
elif isinstance(kzk2_nouns, dict) and "nouns" in kzk2_nouns:
    for n in kzk2_nouns["nouns"]:
        for part in n["lemma"].split("/"):
            part = part.strip()
            kzk2_extracted[part] = n

# ============================================================
# AUDIT 1: CEFR Distribution
# ============================================================
print("=" * 70)
print("AUDIT 1: CEFR Level Distribution in word_bank.json")
print("=" * 70)
print(f"Total words: {len(word_bank)}")
for level in ["A1", "A2", "B1", "B2", "C1", "C2", "(none)"]:
    count = cefr_counter.get(level, 0)
    pct = count / len(word_bank) * 100
    print(f"  {level:6s}: {count:5d} ({pct:5.1f}%)")

# ============================================================
# AUDIT 2: KzK1 coreLemmas coverage
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 2: KzK1 Chapter coreLemmas vs Word Bank")
print("=" * 70)
print(f"KzK1 total coreLemmas (raw): {len(kzk1_core_all_raw)}")
print(f"KzK1 total coreLemmas (expanded): {len(kzk1_core_all)}")

kzk1_missing_from_wb = sorted(kzk1_core_all - wb_lemmas)
print(f"Missing from word bank: {len(kzk1_missing_from_wb)}")
for m in kzk1_missing_from_wb:
    # Find which chapter
    for ch_id, lemmas in kzk1_core_by_chapter.items():
        if m in lemmas:
            print(f"  {ch_id}: '{m}'")
            break

# ============================================================
# AUDIT 3: KzK2 coreLemmas coverage
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 3: KzK2 Chapter coreLemmas vs Word Bank")
print("=" * 70)
print(f"KzK2 total coreLemmas (raw): {len(kzk2_core_all_raw)}")
print(f"KzK2 total coreLemmas (expanded): {len(kzk2_core_all)}")

kzk2_missing_from_wb = sorted(kzk2_core_all - wb_lemmas)
print(f"Missing from word bank: {len(kzk2_missing_from_wb)}")
for m in kzk2_missing_from_wb:
    for ch_id, lemmas in kzk2_core_by_chapter.items():
        if m in lemmas:
            print(f"  {ch_id}: '{m}'")
            break

# ============================================================
# AUDIT 4: CEFR consistency with KzK book assignment
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 4: CEFR Consistency with KzK Book Assignment")
print("=" * 70)
print("Words in KzK1 chapters should generally be A1.")
print("Words in KzK2 chapters should generally be A2.")
print()

kzk1_wrong_cefr = []
for lemma in sorted(kzk1_core_all):
    if lemma in wb_by_lemma:
        w = wb_by_lemma[lemma]
        d = w.get("difficulty", "")
        if d not in ("A1",):
            kzk1_wrong_cefr.append((lemma, d))

print(f"KzK1 coreLemmas with non-A1 difficulty: {len(kzk1_wrong_cefr)}")
by_level = defaultdict(list)
for lemma, d in kzk1_wrong_cefr:
    by_level[d].append(lemma)
for level in sorted(by_level.keys()):
    words = by_level[level]
    print(f"  {level}: {len(words)} words")
    for w in words[:15]:
        print(f"    - {w}")
    if len(words) > 15:
        print(f"    ... and {len(words) - 15} more")

print()
kzk2_wrong_cefr = []
for lemma in sorted(kzk2_core_all):
    if lemma in wb_by_lemma:
        w = wb_by_lemma[lemma]
        d = w.get("difficulty", "")
        if d not in ("A2",):
            kzk2_wrong_cefr.append((lemma, d))

print(f"KzK2 coreLemmas with non-A2 difficulty: {len(kzk2_wrong_cefr)}")
by_level2 = defaultdict(list)
for lemma, d in kzk2_wrong_cefr:
    by_level2[d].append(lemma)
for level in sorted(by_level2.keys()):
    words = by_level2[level]
    print(f"  {level}: {len(words)} words")
    for w in words[:15]:
        print(f"    - {w}")
    if len(words) > 15:
        print(f"    ... and {len(words) - 15} more")

# ============================================================
# AUDIT 5: Extracted nouns not in word bank
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 5: Extracted KzK Nouns Not in Word Bank")
print("=" * 70)
kzk1_ext_missing = sorted(set(kzk1_extracted.keys()) - wb_lemmas)
print(f"KzK1 extracted nouns not in word bank: {len(kzk1_ext_missing)}")
for m in kzk1_ext_missing[:30]:
    n = kzk1_extracted[m]
    print(f"  L{n.get('lesson', '?')}: '{m}' ({n.get('translation', '')})")
if len(kzk1_ext_missing) > 30:
    print(f"  ... and {len(kzk1_ext_missing) - 30} more")

print()
kzk2_ext_missing = sorted(set(kzk2_extracted.keys()) - wb_lemmas)
print(f"KzK2 extracted nouns not in word bank: {len(kzk2_ext_missing)}")
for m in kzk2_ext_missing[:30]:
    n = kzk2_extracted[m]
    print(f"  L{n.get('lesson', '?')}: '{m}' ({n.get('translation', '')})")
if len(kzk2_ext_missing) > 30:
    print(f"  ... and {len(kzk2_ext_missing) - 30} more")

# ============================================================
# AUDIT 6: Corrupted translations in extraction files
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 6: Corrupted Translations in Extraction Files")
print("=" * 70)
print("Looking for translations with multiple unrelated words, OCR artifacts, etc.")
print()

def check_translation(lemma, trans, source):
    issues = []
    # Multi-word translations with apparent concatenation (e.g., "cigarette Countries / Země")
    if "/" in trans and len(trans) > 30:
        issues.append(f"possible concatenation: '{trans}'")
    # Mixed Czech and English
    czech_chars = set("áčďéěíňóřšťúůýž")
    has_czech = any(c in czech_chars for c in trans.lower())
    # Count uppercase words (likely OCR noise if many)
    words = trans.split()
    upper_words = [w for w in words if w[0].isupper() and len(w) > 1] if words else []
    if has_czech and len(words) > 3 and len(upper_words) >= 2:
        issues.append(f"mixed Czech/English: '{trans}'")
    # Very long translation (likely corrupted)
    if len(trans) > 80:
        issues.append(f"very long ({len(trans)} chars): '{trans[:60]}...'")
    return issues

corrupted_kzk1 = []
for n in kzk1_nouns.get("nouns", []):
    issues = check_translation(n["lemma"], n.get("translation", ""), "kzk1")
    if issues:
        corrupted_kzk1.append((n["lemma"], n.get("lesson", "?"), issues))

print(f"KzK1 corrupted translations: {len(corrupted_kzk1)}")
for lemma, lesson, issues in corrupted_kzk1[:20]:
    print(f"  L{lesson}: '{lemma}' - {'; '.join(issues)}")
if len(corrupted_kzk1) > 20:
    print(f"  ... and {len(corrupted_kzk1) - 20} more")

print()
kzk2_list = kzk2_nouns if isinstance(kzk2_nouns, list) else kzk2_nouns.get("nouns", [])
corrupted_kzk2 = []
for n in kzk2_list:
    issues = check_translation(n["lemma"], n.get("translation", ""), "kzk2")
    if issues:
        corrupted_kzk2.append((n["lemma"], n.get("lesson", "?"), issues))

print(f"KzK2 corrupted translations: {len(corrupted_kzk2)}")
for lemma, lesson, issues in corrupted_kzk2[:20]:
    print(f"  L{lesson}: '{lemma}' - {'; '.join(issues)}")

# ============================================================
# AUDIT 7: A1 words that seem too advanced
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 7: Potentially Mis-leveled A1 Words (too advanced)")
print("=" * 70)
# Words marked A1 that are NOT in any KzK1 chapter AND NOT in kzk1 extracted nouns
a1_words = [w for w in word_bank if w.get("difficulty") == "A1"]
a1_not_in_kzk1 = []
for w in a1_words:
    lemma = w["lemma"]
    if lemma not in kzk1_core_all and lemma not in kzk1_extracted:
        a1_not_in_kzk1.append(w)

print(f"A1 words not in any KzK1 chapter or extraction: {len(a1_not_in_kzk1)}")
print("These may be incorrectly leveled (should be A2 or higher):")
# Group by category
cat_groups = defaultdict(list)
for w in a1_not_in_kzk1:
    cats = w.get("categories", ["uncategorized"])
    for c in cats:
        cat_groups[c].append(w["lemma"])

for cat in sorted(cat_groups.keys()):
    words = cat_groups[cat]
    print(f"  [{cat}] ({len(words)}): {', '.join(sorted(words)[:10])}")
    if len(words) > 10:
        print(f"    ... and {len(words) - 10} more")

# ============================================================
# AUDIT 8: A2 words that seem too basic (should be A1)
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 8: A2 Words in KzK1 Chapters (should be A1?)")
print("=" * 70)
a2_in_kzk1 = []
for lemma in sorted(kzk1_core_all):
    if lemma in wb_by_lemma and wb_by_lemma[lemma].get("difficulty") == "A2":
        a2_in_kzk1.append(lemma)

print(f"A2 words appearing in KzK1 chapters: {len(a2_in_kzk1)}")
for w in a2_in_kzk1:
    print(f"  - {w} ({wb_by_lemma[w].get('translation', '')})")

# ============================================================
# AUDIT 9: Difficulty patch analysis
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 9: Difficulty Patch Analysis")
print("=" * 70)
print(f"Total entries in difficulty_patch.json: {len(difficulty_patch)}")
patch_transitions = Counter()
applied = 0
not_found = 0
for p in difficulty_patch:
    lemma = p["lemma"]
    fr = p["from"]
    to = p["to"]
    patch_transitions[f"{fr} -> {to}"] += 1
    if lemma in wb_by_lemma:
        current = wb_by_lemma[lemma].get("difficulty", "")
        if current == to:
            applied += 1
        elif current == fr:
            not_found += 1  # patch not yet applied
    else:
        not_found += 1

print(f"Patches already applied: {applied}")
print(f"Patches NOT yet applied (still at old level): {not_found}")
print("Transition counts:")
for trans, count in sorted(patch_transitions.items()):
    print(f"  {trans}: {count}")

# Check for patches that reference lemmas not in word bank
patch_missing = [p for p in difficulty_patch if p["lemma"] not in wb_by_lemma]
if patch_missing:
    print(f"\nPatch lemmas not in word bank: {len(patch_missing)}")
    for p in patch_missing[:10]:
        print(f"  - {p['lemma']}")

# ============================================================
# AUDIT 10: Words in KzK chapters appearing in BOTH books
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 10: Words Appearing in Both KzK1 and KzK2 Chapters")
print("=" * 70)
overlap = sorted(kzk1_core_all & kzk2_core_all)
print(f"Overlapping words: {len(overlap)}")
for w in overlap[:20]:
    d = wb_by_lemma.get(w, {}).get("difficulty", "?")
    print(f"  - {w} (difficulty: {d})")
if len(overlap) > 20:
    print(f"  ... and {len(overlap) - 20} more")

# ============================================================
# AUDIT 11: KzK1 extracted nouns not in any chapter
# ============================================================
print("\n" + "=" * 70)
print("AUDIT 11: KzK1 Extracted Nouns Not Assigned to Any Chapter")
print("=" * 70)
kzk1_ext_not_assigned = sorted(set(kzk1_extracted.keys()) & wb_lemmas - kzk1_core_all)
print(f"In word bank but not in any KzK1 chapter: {len(kzk1_ext_not_assigned)}")
by_lesson = defaultdict(list)
for lemma in kzk1_ext_not_assigned:
    n = kzk1_extracted[lemma]
    by_lesson[n.get("lesson", "?")].append(lemma)
for lesson in sorted(by_lesson.keys()):
    words = by_lesson[lesson]
    print(f"  Lesson {lesson}: {', '.join(words[:10])}")
    if len(words) > 10:
        print(f"    ... and {len(words) - 10} more")

# ============================================================
# SUMMARY
# ============================================================
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)
print(f"Word bank total entries: {len(word_bank)}")
print(f"KzK1 chapter coreLemmas (expanded): {len(kzk1_core_all)}")
print(f"KzK2 chapter coreLemmas (expanded): {len(kzk2_core_all)}")
print(f"KzK1 coreLemmas missing from word bank: {len(kzk1_missing_from_wb)}")
print(f"KzK2 coreLemmas missing from word bank: {len(kzk2_missing_from_wb)}")
print(f"KzK1 coreLemmas with wrong CEFR: {len(kzk1_wrong_cefr)}")
print(f"KzK2 coreLemmas with wrong CEFR: {len(kzk2_wrong_cefr)}")
print(f"A1 words not in KzK1 at all: {len(a1_not_in_kzk1)}")
print(f"A2 words in KzK1 chapters: {len(a2_in_kzk1)}")
print(f"Corrupted kzk1 translations: {len(corrupted_kzk1)}")
print(f"Corrupted kzk2 translations: {len(corrupted_kzk2)}")
print(f"Difficulty patches unapplied: {not_found}")
print(f"Words in both KzK1 and KzK2: {len(overlap)}")
print(f"KzK1 extracted but unassigned to chapters: {len(kzk1_ext_not_assigned)}")
