#!/usr/bin/env python3
"""
Extract Czech nouns from KzK2 lesson PDFs.

Reads all lekce_*.pdf files, parses the structured vocabulary sections,
and outputs a JSON file with extracted nouns.

Usage:
    python3 scripts/extract_kzk2_vocab.py
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PDF_DIR = PROJECT_ROOT / "src" / "lib" / "data" / "KzK2"
OUTPUT_PATH = SCRIPT_DIR / "kzk2_nouns.json"
LEMMAS_PATH = SCRIPT_DIR / "starter_lemmas.txt"


def load_existing_lemmas(path: Path) -> set[str]:
    """Load existing lemmas from starter_lemmas.txt."""
    lemmas = set()
    if not path.exists():
        return lemmas
    with open(path, encoding="utf-8") as f:
        for line in f:
            word = line.strip()
            if word and not word.startswith("#"):
                lemmas.add(word.lower())
    return lemmas


def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extract all text from a PDF file."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text


def parse_substantiva_section(text: str) -> list[str]:
    """
    Extract lines from Substantiva sections (and Profese sections which also
    contain nouns). Stops at the next section header (Adjektiva, Slovesa, etc.).
    """
    lines = []

    # Find Substantiva and Profese sections
    section_pattern = re.compile(
        r"^(Substantiva|Profese)\b.*$", re.MULTILINE
    )
    # Section headers that end a noun section
    end_pattern = re.compile(
        r"^(Adjektiva|Slovesa|Adverbia|Prepozice|Výrazy|Další věci|Číslovky|Spojky)\b",
        re.MULTILINE,
    )

    for match in section_pattern.finditer(text):
        start = match.end()
        # Find the next section header
        end_match = end_pattern.search(text, start)
        end = end_match.start() if end_match else len(text)
        section_text = text[start:end]
        for line in section_text.split("\n"):
            line = line.strip()
            if line and not line.startswith("[") and not line.startswith("•"):
                lines.append(line)

    return lines


def parse_noun_line(line: str) -> dict | None:
    """
    Parse a single noun vocabulary line.

    Formats seen in KzK2:
    - "bydliště: place of residence"
    - "*bydliště: place of residence"  (recognition only)
    - "kuchyň (f): kitchen"
    - "časopis (časopisem): magazine"
    - "koníček (masc animate; koníčkem): hobby"
    - "bankéř / bankéřka (bankéřem / bankéřkou): banker"
    - "• křeček (křekem): hamster"
    """
    # Strip bullet points
    line = re.sub(r"^[•\-–]\s*", "", line).strip()

    # Skip empty or non-vocab lines
    if not line or ":" not in line:
        return None

    # Check if recognition-only (starred)
    recognition_only = line.startswith("*")
    line = line.lstrip("*").strip()

    # Split on the LAST colon that separates Czech from English
    # But be careful: some translations contain colons
    # The pattern is: czech_part: english_translation
    colon_idx = line.find(":")
    if colon_idx == -1:
        return None

    czech_part = line[:colon_idx].strip()
    translation = line[colon_idx + 1 :].strip()

    if not czech_part or not translation:
        return None

    # Skip lines that look like grammar notes rather than vocab
    if translation.startswith("to ") and "/" in czech_part and "(" not in czech_part:
        return None  # Likely a verb pair

    # Extract gender hint from parenthetical
    gender_hint = ""
    gender_match = re.search(r"\(([fnm])\)", czech_part)
    if gender_match:
        gender_hint = gender_match.group(1)

    if "(masc animate" in czech_part:
        gender_hint = "ma"
    elif "(masc" in czech_part:
        gender_hint = "m"
    elif "(n;" in czech_part or "(n)" in czech_part:
        gender_hint = "n"
    elif "(f;" in czech_part or "(f)" in czech_part:
        gender_hint = "f"

    # Handle paired masc/fem forms: "bankéř / bankéřka"
    # Take just the masculine form (or the first form)
    czech_clean = re.sub(r"\s*\([^)]*\)", "", czech_part).strip()

    # Handle "word / word" pairs — split and take both as separate entries
    lemmas = []
    if " / " in czech_clean:
        parts = czech_clean.split(" / ")
        for p in parts:
            p = p.strip()
            if p:
                lemmas.append(p)
    else:
        lemmas.append(czech_clean)

    results = []
    for lemma in lemmas:
        # Clean up: remove any remaining special chars
        lemma = lemma.strip("* •–-").strip()

        # Skip if contains spaces (multi-word), digits, or is too short
        if " " in lemma or any(c.isdigit() for c in lemma) or len(lemma) < 2:
            continue

        # Skip plural-only indicators
        if lemma.endswith("(pl)"):
            continue

        results.append(
            {
                "lemma": lemma.lower(),
                "translation": translation.strip(),
                "gender_hint": gender_hint,
                "recognition_only": recognition_only,
            }
        )

    return results if results else None


def main() -> int:
    print("=== Extracting KzK2 vocabulary from PDFs ===", file=sys.stderr)

    if not PDF_DIR.exists():
        print(f"ERROR: {PDF_DIR} not found", file=sys.stderr)
        return 1

    # Find all lesson PDFs
    pdf_files = sorted(PDF_DIR.glob("lekce_*.pdf"), key=lambda p: int(re.search(r"\d+", p.stem).group()))
    print(f"  Found {len(pdf_files)} lesson PDFs", file=sys.stderr)

    all_nouns = []
    seen_lemmas = set()

    for pdf_path in pdf_files:
        lesson_num = int(re.search(r"\d+", pdf_path.stem).group())
        print(f"\n  Processing lekce {lesson_num}...", file=sys.stderr)

        text = extract_text_from_pdf(pdf_path)
        noun_lines = parse_substantiva_section(text)
        print(f"    Found {len(noun_lines)} noun lines", file=sys.stderr)

        lesson_count = 0
        for line in noun_lines:
            results = parse_noun_line(line)
            if results:
                for noun in results:
                    lemma = noun["lemma"]
                    if lemma not in seen_lemmas:
                        seen_lemmas.add(lemma)
                        noun["lesson"] = lesson_num
                        all_nouns.append(noun)
                        lesson_count += 1

        print(f"    Extracted {lesson_count} unique nouns", file=sys.stderr)

    # Cross-reference with existing lemmas
    existing = load_existing_lemmas(LEMMAS_PATH)
    already_have = [n for n in all_nouns if n["lemma"] in existing]
    new_nouns = [n for n in all_nouns if n["lemma"] not in existing]

    print(f"\n{'=' * 50}", file=sys.stderr)
    print(f"Total unique nouns extracted: {len(all_nouns)}", file=sys.stderr)
    print(f"Already in word bank: {len(already_have)}", file=sys.stderr)
    print(f"New (not in word bank): {len(new_nouns)}", file=sys.stderr)

    # Save to JSON
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(all_nouns, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"\nSaved to {OUTPUT_PATH}", file=sys.stderr)

    # Print new nouns summary
    if new_nouns:
        print(f"\n  New nouns by lesson:", file=sys.stderr)
        by_lesson: dict[int, list] = {}
        for n in new_nouns:
            by_lesson.setdefault(n["lesson"], []).append(n)
        for lesson in sorted(by_lesson):
            nouns_in_lesson = by_lesson[lesson]
            lemma_list = ", ".join(n["lemma"] for n in nouns_in_lesson[:10])
            more = f" ... +{len(nouns_in_lesson) - 10}" if len(nouns_in_lesson) > 10 else ""
            print(f"    Lekce {lesson:2d}: {len(nouns_in_lesson):3d} nouns — {lemma_list}{more}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
