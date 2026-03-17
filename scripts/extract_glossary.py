#!/usr/bin/env python3
"""
Extract nouns from KzK1 full glossary PDF, cross-reference with word bank,
and update kzk_chapters.json with unassignedLemmas.
"""

import json
import os
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Try to extract text from PDF using pdftotext if available
PDF_PATH = os.path.join(BASE, "src/lib/data/KzK1/ckzk1_glossary_en.pdf")
TXT_PATH = os.path.join(BASE, "scripts/glossary_raw.txt")

# Try pdftotext first
try:
    subprocess.run(["pdftotext", "-layout", PDF_PATH, TXT_PATH], check=True)
    print("Extracted with pdftotext")
except FileNotFoundError:
    # Try PyPDF2
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(PDF_PATH)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        with open(TXT_PATH, "w") as f:
            f.write(text)
        print("Extracted with PyPDF2")
    except ImportError:
        # Try pdfplumber
        try:
            import pdfplumber
            text = ""
            with pdfplumber.open(PDF_PATH) as pdf:
                for page in pdf.pages:
                    text += page.extract_text() + "\n"
            with open(TXT_PATH, "w") as f:
                f.write(text)
            print("Extracted with pdfplumber")
        except ImportError:
            print("ERROR: No PDF extraction tool available.")
            print("Please install one of: poppler (brew install poppler), PyPDF2, or pdfplumber")
            sys.exit(1)

# Read extracted text
with open(TXT_PATH) as f:
    glossary_text = f.read()

print(f"Glossary text length: {len(glossary_text)} chars")
print("First 2000 chars:")
print(glossary_text[:2000])
print("---")

# Load word bank
with open(os.path.join(BASE, "src/lib/data/word_bank.json")) as f:
    word_bank = json.load(f)

wb_lemmas = {w["lemma"] for w in word_bank}
print(f"\nWord bank lemmas: {len(wb_lemmas)}")

# Load kzk_chapters
with open(os.path.join(BASE, "src/lib/data/kzk_chapters.json")) as f:
    chapters = json.load(f)

# Collect all kzk1 coreLemmas
all_kzk1_core = set()
for ch in chapters["kzk1"]["chapters"]:
    for lemma in ch["coreLemmas"]:
        # Handle compound lemmas like "asistent/asistentka"
        for part in lemma.split("/"):
            all_kzk1_core.add(part.strip())

print(f"KzK1 coreLemmas (expanded): {len(all_kzk1_core)}")

# Parse glossary text to extract Czech words (first word of each entry)
glossary_words = set()
for line in glossary_text.split("\n"):
    line = line.strip()
    if not line:
        continue
    # Each glossary entry typically starts with a Czech word followed by English
    # Try to extract the first word(s) from each line
    parts = line.split()
    if parts:
        word = parts[0].strip(",.:;!?()[]")
        if word and len(word) > 1:
            glossary_words.add(word.lower())
            # Also try without diacritics issues - add the raw word
            glossary_words.add(word)

print(f"Raw glossary words extracted: {len(glossary_words)}")

# Cross-reference: glossary words that are in word bank
glossary_in_wb = glossary_words & wb_lemmas
print(f"Glossary words in word bank: {len(glossary_in_wb)}")

# Already in chapters
already_assigned = glossary_in_wb & all_kzk1_core
print(f"Already in chapter coreLemmas: {len(already_assigned)}")

# Unassigned
unassigned = sorted(glossary_in_wb - all_kzk1_core)
print(f"Unassigned (new): {len(unassigned)}")

# Gaps: coreLemmas not in word bank
gaps = sorted(all_kzk1_core - wb_lemmas)
print(f"\nGaps (coreLemmas not in word bank): {len(gaps)}")
for g in gaps:
    print(f"  - {g}")

# Print unassigned for review
print(f"\nUnassigned lemmas ({len(unassigned)}):")
for u in unassigned:
    print(f"  {u}")

# Save analysis results
print("\n=== DONE ===")
