#!/usr/bin/env python3
"""
CLI helper to add new words to the curated word bank.

Usage:
    python3 scripts/add-word.py práce kůň
    python3 scripts/add-word.py --dry-run práce
    python3 scripts/add-word.py --help

For each lemma, the script:
  1. Resolves the MorphoDiTa lemma ID
  2. Generates all inflected forms
  3. Fetches an English translation from kaikki.org (Wiktionary)
  4. Auto-detects the paradigm
  5. Displays everything for confirmation
  6. Appends to starter_lemmas.txt and starter_nouns_meta.csv
"""

import argparse
import csv
import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

SCRIPT_DIR = Path(__file__).parent
META_CSV_PATH = SCRIPT_DIR / "starter_nouns_meta.csv"
LEMMAS_PATH = SCRIPT_DIR / "starter_lemmas.txt"

# --- MorphoDiTa API ---
MORPHODITA_API = "https://lindat.mff.cuni.cz/services/morphodita/api"

# --- Kaikki.org (Wiktionary) ---
KAIKKI_GZ_URL = (
    "https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl.gz"
)

# --- Czech morphological tag positions (Prague positional tagset) ---
GENDER_MAP: Dict[str, Tuple[str, bool]] = {
    "M": ("m", True),
    "I": ("m", False),
    "F": ("f", False),
    "N": ("n", False),
}

GENDER_LABEL: Dict[str, str] = {
    "m": "masculine",
    "f": "feminine",
    "n": "neuter",
}

SOFT_CONSONANTS: Set[str] = set("žšščřťďňjc")

PARADIGM_RULES: Dict[Tuple[str, bool, str], str] = {
    ("n", False, "í"): "stavení",
    ("n", False, "o"): "město",
    ("n", False, "e"): "moře",
    ("n", False, "ě"): "moře",
    ("f", False, "a"): "žena",
    ("f", False, "e"): "růže",
    ("f", False, "ě"): "růže",
}

PARADIGM_DESCRIPTIONS: Dict[str, str] = {
    "pán": "Hard masculine animate",
    "muž": "Soft masculine animate",
    "předseda": "Masculine animate -a stem",
    "hrad": "Hard masculine inanimate",
    "stroj": "Soft masculine inanimate",
    "žena": "Hard feminine -a stem",
    "růže": "Soft feminine -e stem",
    "kost": "Consonant-ending feminine",
    "město": "Hard neuter -o stem",
    "moře": "Soft neuter -e stem",
    "kuře": "Neuter -e stem (t-stem)",
    "stavení": "Neuter -í stem",
}

VALID_DIFFICULTIES: Set[str] = {"A1", "A2", "B1", "B2"}

SEMANTIC_TAGS: List[str] = [
    "people",
    "abstract",
    "readable",
    "meal",
    "event",
]

BROAD_CATEGORIES: List[str] = [
    "animals",
    "body",
    "family",
    "food",
    "misc",
    "nature",
    "objects",
    "places",
    "time",
    "transportation",
]


def detect_paradigm(lemma: str, gender: str, animate: bool) -> str:
    """Detect the paradigm from gender, animacy, and word ending."""
    lower = lemma.lower()
    last = lower[-1] if lower else ""

    key = (gender, animate, last)
    if key in PARADIGM_RULES:
        return PARADIGM_RULES[key]

    if gender == "n":
        return "město"

    if gender == "f":
        return "kost"

    if gender == "m":
        if last == "a":
            return "předseda"
        is_soft = last in SOFT_CONSONANTS
        if animate:
            return "muž" if is_soft else "pán"
        else:
            return "stroj" if is_soft else "hrad"

    if last == "a":
        return "žena"
    if last == "o":
        return "město"
    if last in ("e", "ě"):
        return "růže"
    if last == "í":
        return "stavení"
    return "hrad"


def _morphodita_api(endpoint: str, data: str) -> dict:
    """Call MorphoDiTa REST API and return parsed JSON response."""
    url = f"{MORPHODITA_API}/{endpoint}"
    post_data = urllib.parse.urlencode({"data": data, "output": "json"}).encode("utf-8")
    req = urllib.request.Request(url, data=post_data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_single_lemma_id(lemma: str) -> Optional[str]:
    """
    Use MorphoDiTa's analyze endpoint to resolve a plain lemma to its
    dictionary lemma ID. Returns None if not resolvable as a noun.
    """
    try:
        response = _morphodita_api("analyze", lemma)
    except urllib.error.URLError as e:
        print(f"  ERROR: MorphoDiTa analyze failed: {e}", file=sys.stderr)
        return None

    for token_result in response.get("result", []):
        for analysis in token_result:
            token = analysis.get("token", "").lower()
            if token != lemma.lower():
                continue
            analyses = analysis.get("analyses", [])
            noun_analyses = [a for a in analyses if a.get("tag", "").startswith("NN")]
            if not noun_analyses:
                continue
            # Prefer the lemma ID whose base form matches the input token
            best = None
            for a in noun_analyses:
                lid = a["lemma"]
                base = lid.split("-")[0].split("_")[0].lower()
                if base == token:
                    best = lid
                    break
            # Check if the tag indicates nominative singular
            if best is None:
                for a in noun_analyses:
                    tag = a["tag"]
                    if len(tag) >= 5 and tag[3] == "S" and tag[4] == "1":
                        best = a["lemma"]
                        break
            if best is None:
                best = noun_analyses[0]["lemma"]
            return best

    return None


def generate_forms(lemma_id: str) -> Optional[List[dict]]:
    """Call MorphoDiTa generate to get all inflected forms for a lemma ID."""
    try:
        response = _morphodita_api("generate", lemma_id)
    except urllib.error.URLError as e:
        print(f"  ERROR: MorphoDiTa generate failed: {e}", file=sys.stderr)
        return None

    results = response.get("result", [])
    if results and results[0]:
        return results[0]
    return None


def extract_noun_forms(
    forms: List[dict],
) -> Optional[Tuple[str, bool, List[str], List[str]]]:
    """
    Extract the 7 singular and 7 plural case forms from MorphoDiTa output.

    Returns (gender, animate, sg_forms[7], pl_forms[7]) or None if not a noun.
    Only picks standard-variant forms (variant position = '-').
    """
    sg: List[Optional[str]] = [None] * 7
    pl: List[Optional[str]] = [None] * 7
    gender: Optional[str] = None
    animate: Optional[bool] = None

    for entry in forms:
        tag = entry["tag"]

        if len(tag) < 5 or tag[0] != "N":
            continue

        # Skip non-standard variants (position 14)
        if len(tag) > 14 and tag[14] not in ("-",):
            continue

        tag_gender = tag[2]
        tag_number = tag[3]
        tag_case = tag[4]

        if tag_case not in "1234567":
            continue

        case_idx = int(tag_case) - 1

        if gender is None and tag_gender in GENDER_MAP:
            gender, animate = GENDER_MAP[tag_gender]

        if tag_number == "S":
            if sg[case_idx] is None:
                sg[case_idx] = entry["form"]
        elif tag_number == "P":
            if pl[case_idx] is None:
                pl[case_idx] = entry["form"]

    if gender is None or animate is None:
        return None

    sg_final = [f if f is not None else "" for f in sg]
    pl_final = [f if f is not None else "" for f in pl]

    return gender, animate, sg_final, pl_final


def load_existing_lemmas(path: Path) -> Set[str]:
    """Load existing lemmas from starter_lemmas.txt."""
    lemmas: Set[str] = set()
    if not path.exists():
        return lemmas
    with open(path, encoding="utf-8") as f:
        for line in f:
            word = line.strip()
            if not word or word.startswith("#"):
                continue
            lemmas.add(word.lower())
    return lemmas


def fetch_kaikki_translations(lemmas: Set[str]) -> Dict[str, str]:
    """
    Download Czech Wiktionary data from kaikki.org and extract English translations.
    Only downloads once per session; filters for the requested lemmas.
    """
    translations: Dict[str, str] = {}

    print("Downloading kaikki.org Czech dictionary...", file=sys.stderr)
    try:
        with urllib.request.urlopen(KAIKKI_GZ_URL, timeout=120) as resp:
            raw = resp.read()
    except urllib.error.URLError as e:
        print(f"WARNING: Could not download Wiktionary data: {e}", file=sys.stderr)
        return translations

    print("Decompressing and parsing...", file=sys.stderr)
    try:
        data = gzip.decompress(raw)
    except gzip.BadGzipFile:
        data = raw

    for line in data.decode("utf-8").strip().split("\n"):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        word = entry.get("word", "").lower()
        if word not in lemmas:
            continue
        if entry.get("pos") != "noun":
            continue

        for sense in entry.get("senses", []):
            for gloss in sense.get("glosses", []):
                g = gloss.strip()
                if g:
                    if len(g) > 80:
                        g = g[:77] + "..."
                    translations[word] = g
                    break
            if word in translations:
                break

    return translations


def append_to_lemmas_file(path: Path, lemma: str) -> None:
    """Append a lemma to the end of starter_lemmas.txt (before trailing newline)."""
    content = ""
    if path.exists():
        with open(path, encoding="utf-8") as f:
            content = f.read()

    # Ensure we end with a newline, then add the new lemma
    if content and not content.endswith("\n"):
        content += "\n"
    content += lemma + "\n"

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def append_to_meta_csv(
    path: Path,
    lemma: str,
    translation: str,
    paradigm: str,
    difficulty: str,
    categories: str,
) -> None:
    """Append a row to starter_nouns_meta.csv."""
    file_exists = path.exists()

    # Read existing content to check if it ends with newline
    needs_newline = False
    if file_exists:
        with open(path, "rb") as f:
            f.seek(0, 2)  # seek to end
            if f.tell() > 0:
                f.seek(-1, 2)
                needs_newline = f.read(1) != b"\n"

    with open(path, "a", newline="", encoding="utf-8") as f:
        if needs_newline:
            f.write("\n")
        if not file_exists:
            f.write("lemma,translation,paradigm,difficulty,categories\n")
        writer = csv.writer(f)
        writer.writerow([lemma, translation, paradigm, difficulty, categories])


def display_word_info(
    lemma: str,
    gender: str,
    animate: bool,
    translation: str,
    paradigm: str,
    sg: List[str],
    pl: List[str],
) -> None:
    """Display the word information in a clear format."""
    animacy_label = "animate" if animate else "inanimate"
    gender_label = GENDER_LABEL.get(gender, gender)
    paradigm_desc = PARADIGM_DESCRIPTIONS.get(paradigm, "")
    paradigm_display = f"{paradigm} ({paradigm_desc})" if paradigm_desc else paradigm

    print(f"\n  {lemma} ({gender_label}, {animacy_label})")
    print(f"    Translation: {translation if translation else '(none found)'}")
    print(f"    Paradigm:    {paradigm_display}")
    print(f"    Singular:    {', '.join(f or '-' for f in sg)}")
    print(f"    Plural:      {', '.join(f or '-' for f in pl)}")


def prompt_confirmation(
    lemma: str,
    auto_translation: str,
) -> Optional[Tuple[str, str, str]]:
    """
    Prompt user for confirmation and optional overrides.
    Returns (translation, difficulty, categories) or None to skip.
    """
    print()
    response = input(f"  Add '{lemma}'? [Y/n/s(kip)] ").strip().lower()
    if response in ("n", "no", "s", "skip"):
        return None

    # Translation override
    if auto_translation:
        trans_input = input(
            f"  Translation [{auto_translation}]: "
        ).strip()
        translation = trans_input if trans_input else auto_translation
    else:
        translation = ""
        while not translation:
            translation = input(
                "  Translation (required, no auto-translation found): "
            ).strip()
            if not translation:
                print("  Translation cannot be empty.")

    # Difficulty
    diff_input = input("  Difficulty [A1/A2/B1/B2] (default A2): ").strip().upper()
    if diff_input and diff_input in VALID_DIFFICULTIES:
        difficulty = diff_input
    else:
        difficulty = "A2"

    # Broad category
    print(f"  Available categories: {', '.join(BROAD_CATEGORIES)}")
    cat_input = input("  Category (default misc): ").strip().lower()
    category = cat_input if cat_input and cat_input in BROAD_CATEGORIES else "misc"

    # Semantic tags
    print(f"  Available semantic tags: {', '.join(SEMANTIC_TAGS)}")
    print("  (These control which sentence templates the word can appear in.)")
    tags_input = input("  Semantic tags (comma-separated, or press Enter to skip): ").strip()
    if tags_input:
        tags = [t.strip().lower() for t in tags_input.split(",") if t.strip()]
        categories = ",".join([category] + tags)
    else:
        categories = category

    return translation, difficulty, categories


def process_lemma(
    lemma: str,
    existing_lemmas: Set[str],
    translations_cache: Dict[str, str],
    dry_run: bool,
) -> bool:
    """
    Process a single lemma: resolve, generate forms, display, and optionally add.
    Returns True if the word was added (or would be in dry-run mode).
    """
    lower_lemma = lemma.lower()

    # Check if already exists
    if lower_lemma in existing_lemmas:
        print(f"\nWARNING: '{lower_lemma}' already exists in starter_lemmas.txt, skipping.")
        return False

    # Step 1: Resolve lemma ID
    print(f"\nResolving '{lower_lemma}' via MorphoDiTa analyze...", file=sys.stderr)
    lemma_id = resolve_single_lemma_id(lower_lemma)
    if lemma_id is None:
        print(f"\nWARNING: MorphoDiTa could not resolve '{lower_lemma}' as a noun, skipping.")
        return False

    print(f"  Lemma ID: {lemma_id}", file=sys.stderr)

    # Step 2: Generate forms
    print(f"Generating forms for '{lower_lemma}'...", file=sys.stderr)
    time.sleep(0.3)  # Rate limiting
    raw_forms = generate_forms(lemma_id)
    if raw_forms is None:
        print(f"\nWARNING: MorphoDiTa could not generate forms for '{lower_lemma}', skipping.")
        return False

    # Step 3: Extract noun forms
    result = extract_noun_forms(raw_forms)
    if result is None:
        print(f"\nWARNING: Could not extract noun forms for '{lower_lemma}', skipping.")
        return False

    gender, animate, sg, pl = result

    # Step 4: Get translation
    translation = translations_cache.get(lower_lemma, "")

    # Step 5: Detect paradigm
    paradigm = detect_paradigm(lower_lemma, gender, animate)

    # Step 6: Display
    display_word_info(lower_lemma, gender, animate, translation, paradigm, sg, pl)

    if dry_run:
        print("\n  [DRY RUN] Would add this word. No files modified.")
        return True

    # Step 7: Prompt for confirmation
    overrides = prompt_confirmation(lower_lemma, translation)
    if overrides is None:
        print(f"  Skipped '{lower_lemma}'.")
        return False

    final_translation, difficulty, categories = overrides

    # Step 8: Append to files
    append_to_lemmas_file(LEMMAS_PATH, lower_lemma)
    append_to_meta_csv(META_CSV_PATH, lower_lemma, final_translation, paradigm, difficulty, categories)

    # Track so we don't add duplicates in the same session
    existing_lemmas.add(lower_lemma)

    print(f"  Added '{lower_lemma}' to starter_lemmas.txt and starter_nouns_meta.csv.")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Add new Czech nouns to the curated word bank.",
        epilog=(
            "Examples:\n"
            "  python3 scripts/add-word.py práce kůň\n"
            "  python3 scripts/add-word.py --dry-run město\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "lemmas",
        nargs="*",
        help="One or more Czech lemmas (nominative singular) to add.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be added without modifying any files.",
    )

    args = parser.parse_args()

    if not args.lemmas:
        parser.print_help()
        return 0

    lemmas: List[str] = [l.lower() for l in args.lemmas]

    print(f"=== Add words to word bank ===", file=sys.stderr)
    print(f"Lemmas to add: {', '.join(lemmas)}", file=sys.stderr)

    # Load existing data
    existing_lemmas = load_existing_lemmas(LEMMAS_PATH)

    # Check which lemmas we actually need translations for (not already existing)
    lemmas_needing_translation = {
        l for l in lemmas if l not in existing_lemmas
    }

    # Fetch translations from kaikki.org (once for all words)
    translations_cache: Dict[str, str] = {}
    if lemmas_needing_translation:
        print(
            f"\nFetching translations from Wiktionary for {len(lemmas_needing_translation)} lemma(s)...",
            file=sys.stderr,
        )
        translations_cache = fetch_kaikki_translations(lemmas_needing_translation)
        print(
            f"  Got translations for {len(translations_cache)} lemma(s)",
            file=sys.stderr,
        )

    # Process each lemma
    added_count = 0
    for lemma in lemmas:
        success = process_lemma(lemma, existing_lemmas, translations_cache, args.dry_run)
        if success:
            added_count += 1

    # Summary
    print(f"\n{'=' * 50}")
    if args.dry_run:
        print(f"DRY RUN complete. {added_count} word(s) would be added.")
    else:
        print(f"Done. {added_count} word(s) added.")
        if added_count > 0:
            print(
                "\nReminder: Run `python3 scripts/build_word_bank_morphodita.py` "
                "to rebuild the word bank."
            )
    print(f"{'=' * 50}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
