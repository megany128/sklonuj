#!/usr/bin/env python3
"""
Download and process Czech dictionary data from kaikki.org.

This script downloads Czech noun data from kaikki.org, extracts lemmas, gender,
animacy, inflected forms, and English translations, then outputs to CSV format
for manual curation.
"""

import argparse
import csv
import gzip
import json
import sys
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# URL for Czech dictionary data
KAIKKI_URL = "https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl"
KAIKKI_GZ_URL = "https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl.gz"

# Case and number combinations for Czech noun inflection
CASES = ["nom", "gen", "dat", "acc", "voc", "loc", "ins"]
NUMBERS = ["sg", "pl"]

# Map kaikki.org form tags to our column names
FORM_TAG_MAP = {
    ("nominative", "singular"): "sg_nom",
    ("genitive", "singular"): "sg_gen",
    ("dative", "singular"): "sg_dat",
    ("accusative", "singular"): "sg_acc",
    ("vocative", "singular"): "sg_voc",
    ("locative", "singular"): "sg_loc",
    ("instrumental", "singular"): "sg_ins",
    ("nominative", "plural"): "pl_nom",
    ("genitive", "plural"): "pl_gen",
    ("dative", "plural"): "pl_dat",
    ("accusative", "plural"): "pl_acc",
    ("vocative", "plural"): "pl_voc",
    ("locative", "plural"): "pl_loc",
    ("instrumental", "plural"): "pl_ins",
}


def download_data(use_gzip: bool = True) -> bytes:
    """
    Download Czech dictionary data from kaikki.org.

    Args:
        use_gzip: Whether to try downloading the gzipped version first

    Returns:
        Raw bytes of the downloaded file

    Raises:
        urllib.error.URLError: If download fails
    """
    url = KAIKKI_GZ_URL if use_gzip else KAIKKI_URL
    print(f"Downloading from {url}...", file=sys.stderr)

    try:
        with urllib.request.urlopen(url) as response:
            data = response.read()
            print(f"Downloaded {len(data):,} bytes", file=sys.stderr)
            return data
    except urllib.error.URLError as e:
        if use_gzip:
            print(f"Gzipped version not available, trying uncompressed...", file=sys.stderr)
            return download_data(use_gzip=False)
        raise


def parse_jsonl(data: bytes, is_gzipped: bool = True) -> List[Dict]:
    """
    Parse JSONL data (optionally gzipped) into list of dictionaries.

    Args:
        data: Raw bytes of JSONL data
        is_gzipped: Whether the data is gzip-compressed

    Returns:
        List of parsed JSON objects
    """
    if is_gzipped:
        try:
            data = gzip.decompress(data)
        except gzip.BadGzipFile:
            # Data might not be gzipped
            pass

    lines = data.decode('utf-8').strip().split('\n')
    entries = []

    for i, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError as e:
            print(f"Warning: Failed to parse line {i}: {e}", file=sys.stderr)

    return entries


def extract_gender_and_animate(entry: Dict) -> Tuple[str, str]:
    """
    Extract gender and animacy from head_templates.

    Args:
        entry: Dictionary entry from kaikki.org

    Returns:
        Tuple of (gender, animate) where:
        - gender: "m" for masculine, "f" for feminine, "n" for neuter, or empty string
        - animate: "true" if animate, "false" if inanimate, or empty string
    """
    head_templates = entry.get("head_templates", [])
    if not head_templates:
        return "", ""

    args = head_templates[0].get("args", {})
    gender_code = args.get("1", "")

    # Parse gender code
    # f = feminine, n = neuter
    # m-an = masculine animate, m-in = masculine inanimate
    # m = masculine (animacy unspecified)

    if gender_code == "f":
        return "f", "false"
    elif gender_code == "n":
        return "n", "false"
    elif gender_code == "m-an":
        return "m", "true"
    elif gender_code == "m-in":
        return "m", "false"
    elif gender_code == "m":
        return "m", ""

    return "", ""


def extract_translation(entry: Dict) -> str:
    """
    Extract first English gloss from senses.

    Args:
        entry: Dictionary entry

    Returns:
        First English translation or empty string
    """
    senses = entry.get("senses", [])
    if not senses:
        return ""

    glosses = senses[0].get("glosses", [])
    if glosses:
        return glosses[0]

    return ""


def extract_forms(entry: Dict) -> Dict[str, str]:
    """
    Extract all 14 inflected forms from the forms array.

    Args:
        entry: Dictionary entry

    Returns:
        Dictionary mapping form names (e.g., "sg_nom") to their values
    """
    forms_data = {}
    forms_array = entry.get("forms", [])

    for form in forms_array:
        tags = form.get("tags", [])
        form_text = form.get("form", "")

        # Look for matching case and number combination
        for (case_tag, number_tag), form_name in FORM_TAG_MAP.items():
            if case_tag in tags and number_tag in tags:
                # If we haven't seen this form yet, or if this is a simpler form
                # (some entries have multiple forms with additional tags)
                if form_name not in forms_data or len(tags) <= 2:
                    forms_data[form_name] = form_text

    return forms_data


def process_entry(entry: Dict) -> Optional[Dict[str, str]]:
    """
    Process a single dictionary entry into a noun record.

    Args:
        entry: Dictionary entry from kaikki.org

    Returns:
        Dictionary with all fields for CSV output, or None if not a valid noun
    """
    # Filter to nouns only
    if entry.get("pos") != "noun":
        return None

    lemma = entry.get("word", "")
    if not lemma:
        return None

    # Extract basic attributes
    gender, animate = extract_gender_and_animate(entry)
    translation = extract_translation(entry)

    # Extract all inflected forms
    forms = extract_forms(entry)

    # Build the output record
    record = {
        "lemma": lemma,
        "translation": translation,
        "gender": gender,
        "animate": animate,
        "paradigm": "",  # For manual curation
        "difficulty": "",  # For manual curation
        "categories": "",  # For manual curation
    }

    # Add all 14 forms (leave blank if not found)
    for number in NUMBERS:
        for case in CASES:
            form_key = f"{number}_{case}"
            record[form_key] = forms.get(form_key, "")

    return record


def count_complete_forms(record: Dict[str, str]) -> Tuple[bool, bool]:
    """
    Check if a record has complete singular and plural forms.

    Args:
        record: Noun record dictionary

    Returns:
        Tuple of (has_complete_sg, has_complete_pl)
    """
    sg_complete = all(record.get(f"sg_{case}", "") for case in CASES)
    pl_complete = all(record.get(f"pl_{case}", "") for case in CASES)
    return sg_complete, pl_complete


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Download and process Czech dictionary data from kaikki.org"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of nouns to output (for testing)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="scripts/candidate_nouns.csv",
        help="Output CSV file path (default: scripts/candidate_nouns.csv)"
    )
    parser.add_argument(
        "--no-gzip",
        action="store_true",
        help="Download uncompressed version instead of gzipped"
    )
    parser.add_argument(
        "--filter-lemmas",
        type=str,
        help="Path to text file with lemmas to filter (one per line)"
    )

    args = parser.parse_args()

    # Ensure output directory exists
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Load filter lemmas if provided
    filter_lemmas = None
    if args.filter_lemmas:
        print(f"Loading filter lemmas from {args.filter_lemmas}...", file=sys.stderr)
        with open(args.filter_lemmas, 'r', encoding='utf-8') as f:
            filter_lemmas = set(line.strip().lower() for line in f if line.strip())
        print(f"Loaded {len(filter_lemmas)} lemmas to filter", file=sys.stderr)
        if not filter_lemmas:
            print("Warning: Filter file is empty, no filtering will be applied", file=sys.stderr)
            filter_lemmas = None

    # Download data
    try:
        data = download_data(use_gzip=not args.no_gzip)
    except urllib.error.URLError as e:
        print(f"Error: Failed to download data: {e}", file=sys.stderr)
        return 1

    # Parse JSONL
    print("Parsing JSONL data...", file=sys.stderr)
    entries = parse_jsonl(data, is_gzipped=not args.no_gzip)
    print(f"Parsed {len(entries):,} entries", file=sys.stderr)

    # Process entries
    print("Processing nouns...", file=sys.stderr)
    noun_records = []
    sg_complete_count = 0
    pl_complete_count = 0

    for entry in entries:
        record = process_entry(entry)
        if record:
            # Apply lemma filter if provided
            if filter_lemmas and record["lemma"].lower() not in filter_lemmas:
                continue

            noun_records.append(record)

            # Count complete forms
            sg_complete, pl_complete = count_complete_forms(record)
            if sg_complete:
                sg_complete_count += 1
            if pl_complete:
                pl_complete_count += 1

            # Check limit
            if args.limit and len(noun_records) >= args.limit:
                break

    # Write to CSV
    print(f"Writing {len(noun_records):,} nouns to {args.output}...", file=sys.stderr)

    fieldnames = [
        "lemma", "translation", "gender", "animate", "paradigm",
        "difficulty", "categories",
        "sg_nom", "sg_gen", "sg_dat", "sg_acc", "sg_voc", "sg_loc", "sg_ins",
        "pl_nom", "pl_gen", "pl_dat", "pl_acc", "pl_voc", "pl_loc", "pl_ins"
    ]

    with open(args.output, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(noun_records)

    # Print summary
    print("\n" + "=" * 60, file=sys.stderr)
    print("SUMMARY", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"Total nouns found: {len(noun_records):,}", file=sys.stderr)
    print(f"Nouns with complete singular forms: {sg_complete_count:,} ({100*sg_complete_count/len(noun_records) if noun_records else 0:.1f}%)", file=sys.stderr)
    print(f"Nouns with complete plural forms: {pl_complete_count:,} ({100*pl_complete_count/len(noun_records) if noun_records else 0:.1f}%)", file=sys.stderr)
    print(f"\nOutput written to: {args.output}", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
