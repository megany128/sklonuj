#!/usr/bin/env python3
"""
Extract Czech nouns from KzK1 lesson PDFs.

Reads all 1lekce_*.pdf files, parses the structured vocabulary sections,
and outputs a JSON file with extracted nouns.

Usage:
    python3 scripts/extract_kzk1_vocab.py
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PDF_DIR = PROJECT_ROOT / "src" / "lib" / "data" / "KzK1"
OUTPUT_PATH = SCRIPT_DIR / "kzk1_nouns.json"
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


def extract_lesson_title(text: str) -> str:
    """Extract the lesson title from the PDF header line."""
    # Pattern: "1. lekce: Food and drink / Jídlo a pití"
    # or "10. lekce: Traveling / Cestujeme"
    match = re.search(r"\d+\.\s*lekce:\s*(.+?)(?:\n|$)", text)
    if match:
        title = match.group(1).strip()
        # Take the English part (before the /)
        if " / " in title:
            title = title.split(" / ")[0].strip()
        return title
    return ""


def parse_noun_sections(text: str) -> list[str]:
    """
    Extract lines from Substantiva and Countries sections.
    KzK1 format has "Nouns / Substantiva" as the header.
    Also captures "Countries / Země" section entries.
    """
    lines = []

    # Find noun sections: "Nouns / Substantiva" or just "Substantiva"
    section_pattern = re.compile(
        r"^(Nouns / Substantiva|Substantiva|Countries / Země|Země)\b.*$",
        re.MULTILINE,
    )
    # Section headers that end a noun section
    end_pattern = re.compile(
        r"^(Adjectives / Adjektiva|Adjektiva|Verbs / Slovesa|Slovesa|"
        r"Adverbs / Adverbia|Adverbia|Prepositions / Prepozice|Prepozice|"
        r"Expressions / Výrazy|Výrazy|Questions / Otázky|Otázky|"
        r"Nationalities / Národnosti|Národnosti|"
        r"Countries / Země|Země|"
        r"Nouns / Substantiva|Substantiva|"
        r"Další věci|Číslovky|Spojky|"
        r"Irregular past|For review|For intrepid)\b",
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


def parse_nationality_section(text: str) -> list[str]:
    """
    Extract lines from Nationalities sections.
    These contain noun entries like "Čech / Češka / Češi".
    """
    lines = []
    section_pattern = re.compile(
        r"^(Nationalities / Národnosti|Národnosti)\b.*$", re.MULTILINE
    )
    end_pattern = re.compile(
        r"^(Adjectives|Adjektiva|Verbs|Slovesa|Adverbs|Adverbia|"
        r"Prepositions|Prepozice|Expressions|Výrazy|Questions|Otázky|"
        r"Countries|Země|Nouns|Substantiva|For review|For intrepid)\b",
        re.MULTILINE,
    )

    for match in section_pattern.finditer(text):
        start = match.end()
        end_match = end_pattern.search(text, start)
        end = end_match.start() if end_match else len(text)
        section_text = text[start:end]
        for line in section_text.split("\n"):
            line = line.strip()
            if line:
                lines.append(line)

    return lines


def parse_noun_line(line: str) -> list[dict] | None:
    """
    Parse a single noun vocabulary line.

    KzK1 formats:
    - "auto: car"
    - "*nesmysl: nonsense"
    - "chléb (SpCz: chleba): bread"
    - "manažer (m) / manažerka (f): manager"
    - "bazén (bazénu): pool"
    - "knedlík(y): dumpling(s)"
    - "boty (pl): shoes; boots"
    - "člověk (pl: lidé): person (people)"
    - "*Německo: Germany"
    """
    # Strip bullet points
    line = re.sub(r"^[•\-–]\s*", "", line).strip()

    # Skip empty or non-vocab lines
    if not line or ":" not in line:
        return None

    # Check if recognition-only (starred)
    recognition_only = line.startswith("*")
    line = line.lstrip("*").strip()

    # Split on the first colon that separates Czech from English
    colon_idx = line.find(":")
    if colon_idx == -1:
        return None

    czech_part = line[:colon_idx].strip()
    translation = line[colon_idx + 1:].strip()

    if not czech_part or not translation:
        return None

    # Skip lines that are clearly not nouns (page numbers, grammar notes)
    if len(czech_part) > 60:
        return None
    if translation.startswith("to ") and "/" in czech_part and "(" not in czech_part:
        return None  # Likely a verb pair

    # Extract gender hint
    gender_hint = ""
    if "(m)" in czech_part:
        gender_hint = "m"
    elif "(f)" in czech_part:
        gender_hint = "f"
    elif "(n)" in czech_part or "(n;" in czech_part:
        gender_hint = "n"
    elif "(f;" in czech_part:
        gender_hint = "f"
    elif "(masc animate" in czech_part:
        gender_hint = "ma"
    elif "(masc" in czech_part:
        gender_hint = "m"

    # Remove all parenthetical content: (SpCz: ...), (bazénu), (pl), (f), (m), etc.
    czech_clean = re.sub(r"\s*\([^)]*\)", "", czech_part).strip()

    # Handle "word / word" pairs — split and take both
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
        # Clean up
        lemma = lemma.strip("* •–-").strip()

        # Skip multi-word entries, digits, too short
        if " " in lemma or any(c.isdigit() for c in lemma) or len(lemma) < 2:
            continue

        # Skip if ends with (pl) indicator (already stripped but check)
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


def parse_nationality_line(line: str) -> list[dict] | None:
    """
    Parse a nationality line like "Čech / Češka / Češi" or
    "Amerika Američan / Američanka / Američané (SpCz: Američani)".
    Extract the masculine singular form as a noun.
    """
    # Skip lines that are just country names without nationality
    line = line.strip()
    if not line:
        return None

    # Check for recognition-only
    recognition_only = line.startswith("*")
    line = line.lstrip("*").strip()

    # These lines may have country + nationality on same line, separated by space
    # Or just nationality forms separated by /
    # Try to find slash-separated nationality forms
    if "/" not in line:
        return None

    parts = line.split("/")
    if len(parts) < 2:
        return None

    # Take the first part (masculine singular)
    first = parts[0].strip()
    # If it starts with a country name, extract just the nationality
    # Country names are typically followed by the nationality on the same line
    # e.g., "Amerika Američan" or "Česká republika Čech"
    words = first.split()
    if len(words) > 1:
        # The nationality is typically the last word
        first = words[-1]

    first = re.sub(r"\s*\([^)]*\)", "", first).strip()
    first = first.strip("* •–-").strip()

    if not first or " " in first or len(first) < 2:
        return None

    return [
        {
            "lemma": first.lower(),
            "translation": f"(nationality)",
            "gender_hint": "ma",
            "recognition_only": recognition_only,
        }
    ]


def main() -> int:
    print("=== Extracting KzK1 vocabulary from PDFs ===", file=sys.stderr)

    if not PDF_DIR.exists():
        print(f"ERROR: {PDF_DIR} not found", file=sys.stderr)
        return 1

    # Find all lesson PDFs (named 1lekce_*.pdf)
    pdf_files = sorted(
        PDF_DIR.glob("1lekce_*.pdf"),
        key=lambda p: int(re.search(r"1lekce_(\d+)", p.stem).group(1)),
    )
    print(f"  Found {len(pdf_files)} lesson PDFs", file=sys.stderr)

    all_nouns = []
    seen_lemmas: set[str] = set()
    lesson_titles: dict[int, str] = {}

    for pdf_path in pdf_files:
        lesson_num = int(re.search(r"1lekce_(\d+)", pdf_path.stem).group(1))
        print(f"\n  Processing lekce {lesson_num}...", file=sys.stderr)

        text = extract_text_from_pdf(pdf_path)

        # Extract lesson title
        title = extract_lesson_title(text)
        if title:
            lesson_titles[lesson_num] = title
            print(f"    Title: {title}", file=sys.stderr)

        # Parse noun sections
        noun_lines = parse_noun_sections(text)
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

        # Parse nationality sections
        nat_lines = parse_nationality_section(text)
        for line in nat_lines:
            results = parse_nationality_line(line)
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

    # Save lesson titles too
    output_data = {
        "lesson_titles": {str(k): v for k, v in sorted(lesson_titles.items())},
        "nouns": all_nouns,
    }

    # Save to JSON
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"\nSaved to {OUTPUT_PATH}", file=sys.stderr)

    # Print summary
    if all_nouns:
        print(f"\n  Nouns by lesson:", file=sys.stderr)
        by_lesson: dict[int, list] = {}
        for n in all_nouns:
            by_lesson.setdefault(n["lesson"], []).append(n)
        for lesson in sorted(by_lesson):
            nouns_in_lesson = by_lesson[lesson]
            lemma_list = ", ".join(n["lemma"] for n in nouns_in_lesson[:8])
            more = (
                f" ... +{len(nouns_in_lesson) - 8}"
                if len(nouns_in_lesson) > 8
                else ""
            )
            print(
                f"    Lekce {lesson:2d}: {len(nouns_in_lesson):3d} nouns — {lemma_list}{more}",
                file=sys.stderr,
            )

    return 0


if __name__ == "__main__":
    sys.exit(main())
