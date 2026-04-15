#!/usr/bin/env python3
"""
Build adjective_bank.json using MorphoDiTa (Charles University, UFAL) for declension
forms and kaikki.org (Wiktionary) for English translations.

MorphoDiTa provides academically rigorous Czech morphological data from the
Prague Dependency Treebank project. Translations are sourced from Wiktionary
via kaikki.org and can be manually overridden in starter_adjectives_meta.csv.

Usage:
    python3 scripts/build_adjective_bank_morphodita.py

Outputs:
    - src/lib/data/adjective_bank.json   (final JSON for the app)

Requirements:
    - Internet connection (calls MorphoDiTa REST API + kaikki.org)
    - Python 3.8+
"""

import csv
import gzip
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

SCRIPT_DIR = Path(__file__).parent
META_CSV_PATH = SCRIPT_DIR / "starter_adjectives_meta.csv"
LEMMAS_PATH = SCRIPT_DIR / "starter_adjective_lemmas.txt"
OUTPUT_JSON_PATH = SCRIPT_DIR.parent / "src" / "lib" / "data" / "adjective_bank.json"

# --- MorphoDiTa API ---
MORPHODITA_API = "https://lindat.mff.cuni.cz/services/morphodita/api"
MORPHODITA_BATCH_SIZE = 50  # lemmas per API call

# --- Kaikki.org (Wiktionary) ---
KAIKKI_GZ_URL = (
    "https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl.gz"
)

# --- Czech morphological tag positions (Prague positional tagset) ---
# Position 0: POS (A = adjective)
# Position 2: Gender (M = masc animate, I = masc inanimate, F = feminine, N = neuter)
# Position 3: Number (S = singular, P = plural)
# Position 4: Case (1-7)
# Position 9: Degree (1 = positive, 2 = comparative, 3 = superlative)
# Position 14: Variant (- = standard, digits = colloquial/archaic)

GENDER_MAP = {"M": "m_anim", "I": "m_inanim", "F": "f", "N": "n"}

CROSS_REF_PATTERN = re.compile(
    r"^(genitive|dative|plural|diminutive|augmentative|vocative|"
    r"instrumental|locative|accusative|prepositional|comparative|superlative)\s+of\b",
    re.IGNORECASE,
)


def load_lemmas(path: Path) -> list[str]:
    """Load lemmas from starter_adjective_lemmas.txt, ignoring comments and blanks."""
    lemmas = []
    seen: set[str] = set()
    with open(path, encoding="utf-8") as f:
        for line in f:
            word = line.strip()
            if not word or word.startswith("#"):
                continue
            lower = word.lower()
            if lower not in seen:
                lemmas.append(lower)
                seen.add(lower)
    return lemmas


def load_meta_csv(path: Path) -> dict[str, dict]:
    """Load manual metadata overrides (translations, difficulty, categories)."""
    if not path.exists():
        return {}
    meta: dict[str, dict] = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            meta[row["lemma"].lower()] = row
    return meta


def _morphodita_api(endpoint: str, data: str) -> dict:
    """Call MorphoDiTa REST API and return parsed JSON response."""
    url = f"{MORPHODITA_API}/{endpoint}"
    post_data = urllib.parse.urlencode({"data": data, "output": "json"}).encode("utf-8")
    req = urllib.request.Request(url, data=post_data, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_lemma_ids(lemmas: list[str]) -> dict[str, str]:
    """
    Use MorphoDiTa's analyze endpoint to resolve plain lemmas to their
    dictionary lemma IDs (e.g. 'nový' -> 'nový').

    The generate endpoint requires these exact IDs to produce forms.
    """
    lemma_ids: dict[str, str] = {}

    for i in range(0, len(lemmas), MORPHODITA_BATCH_SIZE):
        batch = lemmas[i : i + MORPHODITA_BATCH_SIZE]
        data = " ".join(batch)

        print(
            f"  Resolving lemma IDs: batch {i // MORPHODITA_BATCH_SIZE + 1} "
            f"({len(batch)} lemmas)...",
            file=sys.stderr,
        )

        try:
            response = _morphodita_api("analyze", data)
        except urllib.error.URLError as e:
            print(f"  ERROR: MorphoDiTa analyze failed: {e}", file=sys.stderr)
            sys.exit(1)

        batch_set = set(batch)
        for token_result in response.get("result", []):
            for analysis in token_result:
                token = analysis.get("token", "").lower()
                if token not in batch_set:
                    continue
                if token in lemma_ids:
                    continue
                analyses = analysis.get("analyses", [])
                # Filter for adjective analyses (tag starts with 'A')
                # Also accept ordinal numerals ('Cr') which decline like adjectives
                adj_analyses = [
                    a
                    for a in analyses
                    if a.get("tag", "").startswith("A")
                    or a.get("tag", "").startswith("Cr")
                ]
                if not adj_analyses:
                    continue
                # Prefer the lemma ID whose base form matches the input token
                best = None
                for a in adj_analyses:
                    lid = a["lemma"]
                    # Strip lemma ID suffixes like "-1" or "_^(note)"
                    base = lid.split("-")[0].split("_")[0].lower()
                    if base == token:
                        best = lid
                        break
                # Also check if the tag indicates nominative singular masculine
                # (positive degree) which means this analysis treats the token as base form
                if best is None:
                    for a in adj_analyses:
                        tag = a["tag"]
                        if (
                            len(tag) >= 10
                            and tag[3] == "S"
                            and tag[4] == "1"
                            and tag[9] == "1"
                        ):
                            best = a["lemma"]
                            break
                if best is None:
                    best = adj_analyses[0]["lemma"]
                lemma_ids[token] = best

        if i + MORPHODITA_BATCH_SIZE < len(lemmas):
            time.sleep(0.3)

    return lemma_ids


def fetch_morphodita_forms(lemmas: list[str]) -> dict[str, list[dict]]:
    """
    Two-step MorphoDiTa lookup:
    1. Analyze each lemma to get its full dictionary ID
    2. Generate all inflected forms using that ID

    Returns dict mapping plain lemma -> list of {form, tag} dicts.
    """
    # Step 1: Resolve lemma IDs
    print("  Step 1: Resolving lemma IDs via analyze...", file=sys.stderr)
    lemma_ids = resolve_lemma_ids(lemmas)
    print(f"  Resolved {len(lemma_ids)}/{len(lemmas)} lemma IDs", file=sys.stderr)

    unresolved = [l for l in lemmas if l not in lemma_ids]
    if unresolved:
        print(
            f"  Could not resolve: {', '.join(unresolved)}",
            file=sys.stderr,
        )

    # Step 2: Generate forms using resolved IDs
    print("  Step 2: Generating forms...", file=sys.stderr)
    all_forms: dict[str, list[dict]] = {}

    resolved_lemmas = [(l, lemma_ids[l]) for l in lemmas if l in lemma_ids]

    for i in range(0, len(resolved_lemmas), MORPHODITA_BATCH_SIZE):
        batch = resolved_lemmas[i : i + MORPHODITA_BATCH_SIZE]
        data = "\n".join(lid for _, lid in batch)

        print(
            f"  Generating batch {i // MORPHODITA_BATCH_SIZE + 1} "
            f"({len(batch)} lemmas)...",
            file=sys.stderr,
        )

        try:
            response = _morphodita_api("generate", data)
        except urllib.error.URLError as e:
            print(f"  ERROR: MorphoDiTa generate failed: {e}", file=sys.stderr)
            sys.exit(1)

        for (plain_lemma, _), lemma_result in zip(batch, response.get("result", [])):
            if lemma_result:
                all_forms[plain_lemma] = lemma_result

        if i + MORPHODITA_BATCH_SIZE < len(resolved_lemmas):
            time.sleep(0.3)

    return all_forms


def extract_adjective_forms(
    forms: list[dict],
    lemma: str = "",
) -> Optional[
    tuple[
        dict[str, dict[str, list[str]]],
        dict[str, dict[str, dict[int, list[str]]]],
    ]
]:
    """
    Extract declension forms for all 4 genders x 2 numbers x 7 cases
    from MorphoDiTa output. Only includes positive degree (position 9 = '1').

    Returns (primary_forms, variant_forms) or None if no adjective forms found.

    primary_forms structure:
        { "m_anim": { "sg": [7 forms], "pl": [7 forms] }, ... }

    variant_forms structure:
        { "m_anim": { "sg": { case_idx: [extra forms] }, "pl": { ... } }, ... }
    """
    # Determine whether we need the negated or affirmative forms.
    # MorphoDiTa stores "nebezpečný" under lemma "bezpečný" with tag[10]=N.
    # If our input lemma starts with "ne" and the MorphoDiTa lemma doesn't,
    # we want the negated forms (N). Otherwise we want affirmative (A).
    # We detect this by finding an affirmative masc inanimate nominative singular
    # (the citation form for Czech adjectives ends in -ý/-í).
    want_negated = False
    for entry in forms:
        tag = entry["tag"]
        # Look for affirmative, positive degree, masc inanimate nom sg, standard variant
        if (
            len(tag) > 14
            and tag[0] == "A"
            and tag[2] == "I"  # masc inanimate (same form as citation)
            and tag[3] == "S"
            and tag[4] == "1"
            and tag[9] == "1"
            and tag[10] == "A"
            and tag[14] == "-"
        ):
            if entry["form"].lower() != lemma.lower():
                want_negated = True
            break

    # Initialize storage for all gender/number/case slots
    genders = ["m_anim", "m_inanim", "f", "n"]
    primary: dict[str, dict[str, list[Optional[str]]]] = {}
    is_standard: dict[str, dict[str, list[bool]]] = {}
    all_forms_collected: dict[str, dict[str, list[list[str]]]] = {}

    for g in genders:
        primary[g] = {"sg": [None] * 7, "pl": [None] * 7}
        is_standard[g] = {"sg": [False] * 7, "pl": [False] * 7}
        all_forms_collected[g] = {"sg": [[] for _ in range(7)], "pl": [[] for _ in range(7)]}

    found_any = False

    for entry in forms:
        tag = entry["tag"]

        # Accept adjective tags ('A') and ordinal numeral tags ('Cr')
        is_adjective = len(tag) >= 5 and tag[0] == "A"
        is_ordinal = len(tag) >= 5 and tag[0:2] == "Cr"

        if not is_adjective and not is_ordinal:
            continue

        # Only include positive degree (position 9 = '1') for adjectives
        # Ordinal numerals don't have a degree position
        if is_adjective and len(tag) > 9 and tag[9] != "1":
            continue

        # Skip non-standard variants beyond variant '1'
        # '-' = standard, '1' = common variant, '2'+ = archaic/colloquial
        if len(tag) > 14 and tag[14] not in ("-", "1"):
            continue

        # Filter by negation (position 10: A = affirmative, N = negated)
        # For lemmas like "nebezpečný" whose MorphoDiTa base is "bezpečný",
        # we want negated forms (N). For all others, we want affirmative (A).
        if len(tag) > 10:
            if want_negated and tag[10] == "A":
                continue
            if not want_negated and tag[10] == "N":
                continue

        tag_gender = tag[2]  # M, I, F, N
        tag_number = tag[3]  # S, P (skip D = dual, which gives colloquial -ma forms)
        tag_case = tag[4]  # 1-7

        if tag_case not in "1234567":
            continue
        if tag_gender not in GENDER_MAP:
            continue
        if tag_number not in ("S", "P"):
            continue

        gender_key = GENDER_MAP[tag_gender]
        number_key = "sg" if tag_number == "S" else "pl"
        case_idx = int(tag_case) - 1
        form_text = entry["form"]

        found_any = True

        # Determine if this is the standard variant (position 14 = '-')
        std = len(tag) <= 14 or tag[14] == "-"

        # Primary form: prefer standard variant ('-') over variant '1'
        if primary[gender_key][number_key][case_idx] is None:
            primary[gender_key][number_key][case_idx] = form_text
            is_standard[gender_key][number_key][case_idx] = std
        elif std and not is_standard[gender_key][number_key][case_idx]:
            primary[gender_key][number_key][case_idx] = form_text
            is_standard[gender_key][number_key][case_idx] = True

        # Collect all unique forms for variant extraction
        if form_text not in all_forms_collected[gender_key][number_key][case_idx]:
            all_forms_collected[gender_key][number_key][case_idx].append(form_text)

    if not found_any:
        return None

    # Fill missing forms with empty string and build variant maps
    final_primary: dict[str, dict[str, list[str]]] = {}
    final_variants: dict[str, dict[str, dict[int, list[str]]]] = {}

    for g in genders:
        final_primary[g] = {
            "sg": [f if f is not None else "" for f in primary[g]["sg"]],
            "pl": [f if f is not None else "" for f in primary[g]["pl"]],
        }
        variant_sg: dict[int, list[str]] = {}
        variant_pl: dict[int, list[str]] = {}

        for i in range(7):
            extras = [
                f
                for f in all_forms_collected[g]["sg"][i]
                if f != final_primary[g]["sg"][i]
            ]
            if extras:
                variant_sg[i] = extras
            extras = [
                f
                for f in all_forms_collected[g]["pl"][i]
                if f != final_primary[g]["pl"][i]
            ]
            if extras:
                variant_pl[i] = extras

        if variant_sg or variant_pl:
            final_variants[g] = {}
            if variant_sg:
                final_variants[g]["sg"] = variant_sg
            if variant_pl:
                final_variants[g]["pl"] = variant_pl

    return final_primary, final_variants


def fetch_wiktionary_translations(lemmas: set[str]) -> dict[str, str]:
    """
    Download Czech Wiktionary data from kaikki.org and extract English translations.

    Only downloads entries matching our lemma set.
    """
    translations: dict[str, str] = {}

    print("  Downloading kaikki.org Czech dictionary...", file=sys.stderr)
    try:
        with urllib.request.urlopen(KAIKKI_GZ_URL, timeout=120) as resp:
            raw = resp.read()
    except urllib.error.URLError as e:
        print(f"  WARNING: Could not download Wiktionary data: {e}", file=sys.stderr)
        return translations

    print("  Decompressing and parsing...", file=sys.stderr)
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
        if entry.get("pos") != "adj":
            continue

        # Get first English gloss
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


def detect_paradigm_type(lemma: str) -> str:
    """Detect whether the adjective follows the hard or soft paradigm."""
    lower = lemma.lower()
    if lower.endswith("í"):
        return "soft"
    return "hard"


def _load_previous_json(path: Path) -> list[dict]:
    """Load the previous adjective_bank.json for diffing, or return empty list."""
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _diff_adjective_banks(old_words: list[dict], new_words: list[dict]) -> None:
    """Print a concise summary of changes between old and new adjective bank."""
    old_by_lemma: dict[str, dict] = {w["lemma"]: w for w in old_words}
    new_by_lemma: dict[str, dict] = {w["lemma"]: w for w in new_words}

    old_lemmas = set(old_by_lemma)
    new_lemmas = set(new_by_lemma)

    added = sorted(new_lemmas - old_lemmas)
    removed = sorted(old_lemmas - new_lemmas)

    changed_forms: list[str] = []
    changed_translations: list[str] = []

    for lemma in sorted(old_lemmas & new_lemmas):
        old_w = old_by_lemma[lemma]
        new_w = new_by_lemma[lemma]

        if old_w.get("forms") != new_w.get("forms"):
            changed_forms.append(lemma)
        if old_w.get("translation") != new_w.get("translation"):
            changed_translations.append(lemma)

    if not added and not removed and not changed_forms and not changed_translations:
        print("\nDiff: no changes from previous adjective_bank.json", file=sys.stderr)
        return

    print(f"\n{'─' * 60}", file=sys.stderr)
    print("DIFF vs previous adjective_bank.json", file=sys.stderr)
    print(f"{'─' * 60}", file=sys.stderr)

    if added:
        print(f"  Added ({len(added)}): {', '.join(added)}", file=sys.stderr)
    if removed:
        print(f"  Removed ({len(removed)}): {', '.join(removed)}", file=sys.stderr)
    if changed_forms:
        print(
            f"  Changed forms ({len(changed_forms)}): {', '.join(changed_forms)}",
            file=sys.stderr,
        )
    if changed_translations:
        print(
            f"  Changed translations ({len(changed_translations)}): "
            f"{', '.join(changed_translations)}",
            file=sys.stderr,
        )

    print(f"{'─' * 60}", file=sys.stderr)


def main() -> int:
    print("=== Building adjective bank (MorphoDiTa + Wiktionary) ===", file=sys.stderr)

    # 1. Load lemma list
    if not LEMMAS_PATH.exists():
        print(f"ERROR: {LEMMAS_PATH} not found", file=sys.stderr)
        return 1

    lemmas = load_lemmas(LEMMAS_PATH)
    print(f"Loaded {len(lemmas)} lemmas from {LEMMAS_PATH.name}", file=sys.stderr)

    # 2. Load manual metadata
    meta = load_meta_csv(META_CSV_PATH)
    if meta:
        print(
            f"Loaded {len(meta)} metadata overrides from {META_CSV_PATH.name}",
            file=sys.stderr,
        )

    # 2b. Warn about lemmas missing from meta CSV
    lemmas_without_meta = [l for l in lemmas if l not in meta]
    if lemmas_without_meta:
        print(
            f"\nWARNING: {len(lemmas_without_meta)} lemma(s) have no metadata override "
            f"— will use Wiktionary translation and auto-detected paradigm type:",
            file=sys.stderr,
        )
        for l in lemmas_without_meta:
            print(
                f"  WARNING: lemma '{l}' has no metadata override",
                file=sys.stderr,
            )

    # 3. Fetch declension forms from MorphoDiTa
    print("\nFetching forms from MorphoDiTa (UFAL, Charles University)...", file=sys.stderr)
    morpho_forms = fetch_morphodita_forms(lemmas)
    print(f"  Got forms for {len(morpho_forms)} lemmas", file=sys.stderr)

    # 4. Fetch translations from Wiktionary (for lemmas without manual translations)
    lemmas_needing_translation = {
        l for l in lemmas if l not in meta or not meta[l].get("translation_override")
    }
    if lemmas_needing_translation:
        print(
            f"\nFetching translations from Wiktionary for {len(lemmas_needing_translation)} lemmas...",
            file=sys.stderr,
        )
        wiktionary_translations = fetch_wiktionary_translations(lemmas_needing_translation)
        print(
            f"  Got translations for {len(wiktionary_translations)} lemmas",
            file=sys.stderr,
        )
    else:
        wiktionary_translations = {}

    # 5. Assemble adjective records
    print("\nAssembling adjective records...", file=sys.stderr)
    adjectives: list[dict] = []
    missing_forms: list[str] = []
    missing_translations: list[str] = []

    for lemma in lemmas:
        # Get MorphoDiTa forms
        raw_forms = morpho_forms.get(lemma)
        if not raw_forms:
            missing_forms.append(lemma)
            print(f"  WARNING: No MorphoDiTa forms for '{lemma}'", file=sys.stderr)
            continue

        result = extract_adjective_forms(raw_forms, lemma=lemma)
        if result is None:
            missing_forms.append(lemma)
            print(f"  WARNING: Could not extract adjective forms for '{lemma}'", file=sys.stderr)
            continue

        primary_forms, variant_forms = result

        # Get metadata (manual override > wiktionary > defaults)
        m = meta.get(lemma, {})
        translation = m.get("translation_override") or wiktionary_translations.get(lemma, "")
        difficulty = m.get("difficulty", "")
        categories = m.get("categories", "")

        if not translation:
            missing_translations.append(lemma)

        paradigm_type = detect_paradigm_type(lemma)

        entry: dict = {
            "lemma": lemma,
            "translation": translation,
            "difficulty": difficulty or "A2",
            "paradigmType": paradigm_type,
            "categories": [c.strip() for c in categories.split(",") if c.strip()]
            if categories
            else ["misc"],
            "forms": primary_forms,
            "variantForms": {},
        }

        # Include variant forms if any exist
        if variant_forms:
            serialized_variants: dict = {}
            for gender_key, number_data in variant_forms.items():
                serialized_variants[gender_key] = {}
                for number_key, case_map in number_data.items():
                    serialized_variants[gender_key][number_key] = {
                        str(k): v for k, v in sorted(case_map.items())
                    }
            entry["variantForms"] = serialized_variants

        adjectives.append(entry)

        # Validation checks
        empty_slots: list[str] = []
        for g in ["m_anim", "m_inanim", "f", "n"]:
            for n in ["sg", "pl"]:
                for ci in range(7):
                    if not primary_forms[g][n][ci]:
                        empty_slots.append(f"{g}.{n}.case{ci + 1}")

        if empty_slots:
            print(
                f"  WARNING: lemma '{lemma}' has {len(empty_slots)} empty form slot(s): "
                f"{', '.join(empty_slots[:5])}{'...' if len(empty_slots) > 5 else ''}",
                file=sys.stderr,
            )

        if translation and CROSS_REF_PATTERN.match(translation):
            print(
                f"  WARNING: lemma '{lemma}' translation looks like a "
                f"cross-reference: '{translation}'",
                file=sys.stderr,
            )

    # 6. Load previous JSON for diff (before overwriting)
    previous_json = _load_previous_json(OUTPUT_JSON_PATH)

    # 7. Write JSON
    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(adjectives, f, ensure_ascii=False, indent="\t")
        f.write("\n")

    # 8. Diff with previous version
    _diff_adjective_banks(previous_json, adjectives)

    # 9. Summary
    print(f"\n{'=' * 60}", file=sys.stderr)
    print("SUMMARY", file=sys.stderr)
    print(f"{'=' * 60}", file=sys.stderr)
    print(f"Total adjectives:     {len(adjectives)}", file=sys.stderr)
    print(f"Missing forms:        {len(missing_forms)}", file=sys.stderr)
    print(f"Missing translations: {len(missing_translations)}", file=sys.stderr)
    print(f"JSON output:          {OUTPUT_JSON_PATH}", file=sys.stderr)

    # Count form slots
    total_slots = 0
    filled_slots = 0
    for adj in adjectives:
        for g_forms in adj["forms"].values():
            for n_forms in g_forms.values():
                for form in n_forms:
                    total_slots += 1
                    if form:
                        filled_slots += 1

    print(f"Form slots filled:    {filled_slots}/{total_slots}", file=sys.stderr)
    print(f"{'=' * 60}", file=sys.stderr)

    if missing_forms:
        print(f"\nLemmas with no forms: {', '.join(missing_forms)}", file=sys.stderr)
    if missing_translations:
        print(
            f"Lemmas with no translation: {', '.join(missing_translations)}",
            file=sys.stderr,
        )

    print(
        "\nDeclension data: MorphoDiTa, UFAL, Charles University",
        file=sys.stderr,
    )
    print(
        "  https://ufal.mff.cuni.cz/morphodita",
        file=sys.stderr,
    )
    print(
        "Translations: Wiktionary via kaikki.org",
        file=sys.stderr,
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
