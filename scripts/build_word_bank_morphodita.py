#!/usr/bin/env python3
"""
Build word_bank.json using MorphoDiTa (Charles University, ÚFAL) for declension
forms and kaikki.org (Wiktionary) for English translations.

MorphoDiTa provides academically rigorous Czech morphological data from the
Prague Dependency Treebank project. Translations are sourced from Wiktionary
via kaikki.org and can be manually overridden in starter_nouns_meta.csv.

Usage:
    python3 scripts/build_word_bank_morphodita.py

Outputs:
    - scripts/starter_nouns.csv         (updated CSV with MorphoDiTa forms)
    - src/lib/data/word_bank.json       (final JSON for the app)

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
META_CSV_PATH = SCRIPT_DIR / "starter_nouns_meta.csv"
FORM_OVERRIDES_PATH = SCRIPT_DIR / "form_overrides.json"
LEMMAS_PATH = SCRIPT_DIR / "starter_lemmas.txt"
OUTPUT_CSV_PATH = SCRIPT_DIR / "starter_nouns.csv"
OUTPUT_JSON_PATH = SCRIPT_DIR.parent / "src" / "lib" / "data" / "word_bank.json"

# --- MorphoDiTa API ---
MORPHODITA_API = "https://lindat.mff.cuni.cz/services/morphodita/api"
MORPHODITA_BATCH_SIZE = 50  # lemmas per API call

# --- Kaikki.org (Wiktionary) ---
KAIKKI_GZ_URL = (
    "https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl.gz"
)

# --- Czech morphological tag positions (Prague positional tagset) ---
# Position 0: POS (N = noun)
# Position 2: Gender (M = masc animate, I = masc inanimate, F = feminine, N = neuter)
# Position 3: Number (S = singular, P = plural)
# Position 4: Case (1-7)
# Position 14: Variant (- = standard, digits = colloquial/archaic)

GENDER_MAP = {"M": ("m", True), "I": ("m", False), "F": ("f", False), "N": ("n", False)}

SOFT_CONSONANTS = set("žšščřťďňjc")

PARADIGM_RULES = {
    ("n", False, "í"): "stavení",
    ("n", False, "o"): "město",
    ("n", False, "e"): "moře",
    ("n", False, "ě"): "moře",
    ("f", False, "a"): "žena",
    ("f", False, "e"): "růže",
    ("f", False, "ě"): "růže",
}


def detect_paradigm(
    lemma: str,
    gender: str,
    animate: bool,
    sg: list[str] | None = None,
    pl: list[str] | None = None,
) -> str:
    """Detect the paradigm from gender, animacy, word ending, and optional forms."""
    lower = lemma.lower()
    last = lower[-1] if lower else ""

    # T-stem neuter detection: if neuter ending in -e/-ě, check genitive sg for -ete/-ěte
    if gender == "n" and last in ("e", "ě") and sg is not None and len(sg) > 1:
        gen_sg = sg[1].lower() if sg[1] else ""
        if gen_sg.endswith("ete") or gen_sg.endswith("ěte"):
            return "kuře"

    # Check explicit rules first
    key = (gender, animate, last)
    if key in PARADIGM_RULES:
        return PARADIGM_RULES[key]

    if gender == "n":
        return "město"

    if gender == "f":
        # Consonant-ending feminine
        return "kost"

    if gender == "m":
        if last == "a":
            return "předseda"
        is_soft = last in SOFT_CONSONANTS
        # Soft vs hard detection using instrumental sg when available
        if sg is not None and len(sg) > 6:
            ins_sg = sg[6].lower() if sg[6] else ""
            if ins_sg.endswith("ěm"):
                is_soft = True
        if animate:
            return "muž" if is_soft else "pán"
        else:
            return "stroj" if is_soft else "hrad"

    # Fallback: guess from ending
    if last == "a":
        return "žena"
    if last == "o":
        return "město"
    if last in ("e", "ě"):
        return "růže"
    if last == "í":
        return "stavení"
    return "hrad"


def load_lemmas(path: Path) -> list[str]:
    """Load lemmas from starter_lemmas.txt, ignoring comments and blanks."""
    lemmas = []
    seen = set()
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
    meta = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            meta[row["lemma"].lower()] = row
    return meta


def load_form_overrides(path: Path) -> dict[str, dict[str, object]]:
    """
    Load manual form overrides for irregular nouns.

    File format: JSON object mapping lemma -> override spec. Supported keys:

      - "sg" / "pl": full 7-element primary array (replaces MorphoDiTa output
        for that number; also clears MorphoDiTa-generated variant forms for
        that number).
      - "remove_variants_sg" / "remove_variants_pl": list of case indices
        (0=nom..6=ins) whose MorphoDiTa-generated variants should be dropped.
        Use this to prune wrong variant entries (e.g. spurious masc-animate
        plural endings on inanimate nouns) without overriding the primary
        array.

    Either key can be omitted to use MorphoDiTa forms for that number.
    """
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


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
    dictionary lemma IDs (e.g. 'pes' -> 'pes_^(zvíře)', 'dítě' -> 'dítě-1').

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
                noun_analyses = [a for a in analyses if a.get("tag", "").startswith("NN")]
                if not noun_analyses:
                    continue
                # Prefer the lemma ID whose base form matches the input token
                # (e.g. for "růže", prefer lemma "růže" over "růž")
                best = None
                for a in noun_analyses:
                    lid = a["lemma"]
                    # Strip lemma ID suffixes like "-1" or "_^(note)"
                    base = lid.split("-")[0].split("_")[0].lower()
                    if base == token:
                        best = lid
                        break
                # Also check if the tag indicates nominative singular (case=1, number=S)
                # which means this analysis treats the token as the base form
                if best is None:
                    for a in noun_analyses:
                        tag = a["tag"]
                        if len(tag) >= 5 and tag[3] == "S" and tag[4] == "1":
                            best = a["lemma"]
                            break
                if best is None:
                    best = noun_analyses[0]["lemma"]
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


def extract_noun_forms(
    forms: list[dict],
    lemma: str = "",
) -> Optional[tuple[str, bool, list[str], list[str], dict[int, list[str]], dict[int, list[str]]]]:
    """
    Extract the 7 singular and 7 plural case forms from MorphoDiTa output,
    plus any variant forms for each case-number slot.

    Returns (gender, animate, sg_forms[7], pl_forms[7], variant_sg, variant_pl)
    or None if not a noun.
    Only picks standard-variant forms (variant position = '-').
    Skips negated forms (tag position 10 = 'N') for lemmas that do not
    themselves start with 'ne', preventing MorphoDiTa's generated negations
    (e.g. 'nestůl', 'nesrdce') from being used as the primary forms.

    variant_sg/variant_pl map case_idx -> list of additional accepted forms
    (beyond the primary form stored in sg/pl).
    """
    lemma_starts_ne = lemma.lower().startswith("ne")

    sg: list[Optional[str]] = [None] * 7  # cases 1-7
    pl: list[Optional[str]] = [None] * 7
    # Track whether primary form is standard variant
    sg_is_standard: list[bool] = [False] * 7
    pl_is_standard: list[bool] = [False] * 7
    # Collect ALL forms per slot for variant extraction
    sg_all: list[list[str]] = [[] for _ in range(7)]
    pl_all: list[list[str]] = [[] for _ in range(7)]
    gender = None
    animate = None

    for entry in forms:
        tag = entry["tag"]

        # Skip non-noun tags (MorphoDiTa may return abbreviation tags etc.)
        if len(tag) < 5 or tag[0] != "N":
            continue

        # Skip non-standard variants (position 14)
        # '-' = standard, '1' = common variant (e.g. dat -u vs -ovi)
        # '2' and higher are archaic/colloquial and skipped
        if len(tag) > 14 and tag[14] not in ("-", "1"):
            continue

        # Skip negated forms for non-negated lemmas
        # Position 10 in Prague tagset: A = affirmative, N = negated
        if not lemma_starts_ne and len(tag) > 10 and tag[10] == "N":
            continue

        tag_gender = tag[2]  # M, I, F, N
        tag_number = tag[3]  # S, P
        tag_case = tag[4]  # 1-7

        if tag_case not in "1234567":
            continue

        case_idx = int(tag_case) - 1
        form_text = entry["form"]

        # Extract gender/animacy from the first noun tag we see
        if gender is None and tag_gender in GENDER_MAP:
            gender, animate = GENDER_MAP[tag_gender]

        # Determine if this is the standard variant (position 14 = '-')
        is_standard = len(tag) <= 14 or tag[14] == "-"

        if tag_number == "S":
            # Primary form: prefer standard variant ('-') over variant '1'
            if sg[case_idx] is None:
                sg[case_idx] = form_text
                sg_is_standard[case_idx] = is_standard
            elif is_standard and not sg_is_standard[case_idx]:
                # Replace non-standard primary with standard form
                sg[case_idx] = form_text
                sg_is_standard[case_idx] = True
            # Collect all unique forms for this slot
            if form_text not in sg_all[case_idx]:
                sg_all[case_idx].append(form_text)
        elif tag_number == "P":
            if pl[case_idx] is None:
                pl[case_idx] = form_text
                pl_is_standard[case_idx] = is_standard
            elif is_standard and not pl_is_standard[case_idx]:
                pl[case_idx] = form_text
                pl_is_standard[case_idx] = True
            if form_text not in pl_all[case_idx]:
                pl_all[case_idx].append(form_text)

    if gender is None:
        return None

    # Fill missing forms with empty string
    sg_final = [f if f is not None else "" for f in sg]
    pl_final = [f if f is not None else "" for f in pl]

    # Build variant maps: forms beyond the primary one
    variant_sg: dict[int, list[str]] = {}
    variant_pl: dict[int, list[str]] = {}

    for i in range(7):
        extras = [f for f in sg_all[i] if f != sg_final[i]]
        if extras:
            variant_sg[i] = extras
        extras = [f for f in pl_all[i] if f != pl_final[i]]
        if extras:
            variant_pl[i] = extras

    return gender, animate, sg_final, pl_final, variant_sg, variant_pl


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
        if entry.get("pos") != "noun":
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


SG_COLS = ["sg_nom", "sg_gen", "sg_dat", "sg_acc", "sg_voc", "sg_loc", "sg_ins"]
PL_COLS = ["pl_nom", "pl_gen", "pl_dat", "pl_acc", "pl_voc", "pl_loc", "pl_ins"]
CSV_FIELDS = [
    "lemma",
    "translation",
    "gender",
    "animate",
    "paradigm",
    "difficulty",
    "categories",
    *SG_COLS,
    *PL_COLS,
]


CROSS_REF_PATTERN = re.compile(
    r"^(genitive|dative|plural|diminutive|augmentative|vocative|"
    r"instrumental|locative|accusative|prepositional)\s+of\b",
    re.IGNORECASE,
)


def _load_previous_json(path: Path) -> list[dict]:
    """Load the previous word_bank.json for diffing, or return empty list."""
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return []


def _diff_word_banks(old_words: list[dict], new_words: list[dict]) -> None:
    """Print a concise summary of changes between old and new word bank."""
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
        print("\nDiff: no changes from previous word_bank.json", file=sys.stderr)
        return

    print(f"\n{'─' * 60}", file=sys.stderr)
    print("DIFF vs previous word_bank.json", file=sys.stderr)
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
    print("=== Building word bank (MorphoDiTa + Wiktionary) ===", file=sys.stderr)

    # 1. Load lemma list
    if not LEMMAS_PATH.exists():
        print(f"ERROR: {LEMMAS_PATH} not found", file=sys.stderr)
        return 1

    lemmas = load_lemmas(LEMMAS_PATH)
    print(f"Loaded {len(lemmas)} lemmas from {LEMMAS_PATH.name}", file=sys.stderr)

    # 2. Load manual metadata and form overrides
    meta = load_meta_csv(META_CSV_PATH)
    if meta:
        print(
            f"Loaded {len(meta)} metadata overrides from {META_CSV_PATH.name}",
            file=sys.stderr,
        )

    form_overrides = load_form_overrides(FORM_OVERRIDES_PATH)
    if form_overrides:
        print(
            f"Loaded {len(form_overrides)} form overrides from {FORM_OVERRIDES_PATH.name}",
            file=sys.stderr,
        )

    # 2b. Warn about lemmas missing from meta CSV
    lemmas_without_meta = [l for l in lemmas if l not in meta]
    if lemmas_without_meta:
        print(
            f"\nWARNING: {len(lemmas_without_meta)} lemma(s) have no metadata override "
            f"— will use Wiktionary translation and auto-detected paradigm:",
            file=sys.stderr,
        )
        for l in lemmas_without_meta:
            print(
                f"  WARNING: lemma '{l}' has no metadata override "
                f"— will use Wiktionary translation and auto-detected paradigm",
                file=sys.stderr,
            )

    # 3. Fetch declension forms from MorphoDiTa
    print("\nFetching forms from MorphoDiTa (ÚFAL, Charles University)...", file=sys.stderr)
    morpho_forms = fetch_morphodita_forms(lemmas)
    print(f"  Got forms for {len(morpho_forms)} lemmas", file=sys.stderr)

    # 4. Fetch translations from Wiktionary (for lemmas without manual translations)
    lemmas_needing_translation = {
        l for l in lemmas if l not in meta or not meta[l].get("translation")
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

    # 5. Assemble word records
    print("\nAssembling word records...", file=sys.stderr)
    words = []
    missing_forms = []
    missing_translations = []

    for lemma in lemmas:
        # Get MorphoDiTa forms
        raw_forms = morpho_forms.get(lemma)
        if not raw_forms:
            missing_forms.append(lemma)
            print(f"  WARNING: No MorphoDiTa forms for '{lemma}'", file=sys.stderr)
            continue

        result = extract_noun_forms(raw_forms, lemma=lemma)
        if result is None:
            missing_forms.append(lemma)
            print(f"  WARNING: Could not extract noun forms for '{lemma}'", file=sys.stderr)
            continue

        gender, animate, sg, pl, variant_sg, variant_pl = result

        # Apply form overrides for irregular nouns
        overrides = form_overrides.get(lemma, {})
        if "sg" in overrides:
            sg = overrides["sg"]
        if "pl" in overrides:
            pl = overrides["pl"]

        # Prune specific variant-form entries that MorphoDiTa generates
        # incorrectly for this lemma (e.g. animate-style plural on an inanimate
        # noun). Indices reference the case order [nom, gen, dat, acc, voc,
        # loc, ins].
        for idx in overrides.get("remove_variants_sg", []) or []:
            variant_sg.pop(int(idx), None)
        for idx in overrides.get("remove_variants_pl", []) or []:
            variant_pl.pop(int(idx), None)

        # Get metadata (manual override > wiktionary > defaults)
        m = meta.get(lemma, {})
        translation = m.get("translation") or wiktionary_translations.get(lemma, "")
        difficulty = m.get("difficulty", "")
        categories = m.get("categories", "")
        paradigm_override = m.get("paradigm", "")

        if not translation:
            missing_translations.append(lemma)

        paradigm = paradigm_override or detect_paradigm(lemma, gender, animate, sg, pl)

        # Infer animacy from paradigm override for masculine nouns
        if gender == "m" and paradigm_override:
            if paradigm_override in ("pán", "muž", "předseda"):
                animate = True
            elif paradigm_override in ("hrad", "stroj"):
                animate = False

        # Merge variant forms: override clears MorphoDiTa variants for overridden numbers
        final_variant_sg = variant_sg if "sg" not in overrides else {}
        final_variant_pl = variant_pl if "pl" not in overrides else {}

        words.append(
            {
                "lemma": lemma,
                "translation": translation,
                "gender": gender,
                "animate": str(animate).lower(),
                "paradigm": paradigm,
                "difficulty": difficulty or "A2",
                "categories": categories or "misc",
                "_variant_sg": final_variant_sg,
                "_variant_pl": final_variant_pl,
                **dict(zip(SG_COLS, sg)),
                **dict(zip(PL_COLS, pl)),
            }
        )

        # Validation checks
        if sg[0] and sg[0].lower() != lemma.lower():
            print(
                f"  WARNING: nominative singular '{sg[0]}' doesn't match "
                f"lemma '{lemma}' — possible wrong homonym",
                file=sys.stderr,
            )

        empty_sg = [SG_COLS[i] for i in range(7) if not sg[i]]
        if empty_sg:
            print(
                f"  WARNING: lemma '{lemma}' has empty singular form(s): "
                f"{', '.join(empty_sg)}",
                file=sys.stderr,
            )

        if translation and CROSS_REF_PATTERN.match(translation):
            print(
                f"  WARNING: lemma '{lemma}' translation looks like a "
                f"cross-reference: '{translation}'",
                file=sys.stderr,
            )

    # 6. Load previous JSON for diff (before overwriting)
    previous_json_words = _load_previous_json(OUTPUT_JSON_PATH)

    # 7. Write CSV
    OUTPUT_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(words)

    # 8. Write JSON (same format as csv_to_json.py output)
    json_words = []
    for w in words:
        entry: dict = {
            "lemma": w["lemma"],
            "translation": w["translation"],
            "gender": w["gender"],
            "animate": w["animate"] == "true",
            "paradigm": w["paradigm"],
            "difficulty": w["difficulty"],
            "categories": [c.strip() for c in w["categories"].split(",")],
            "forms": {
                "sg": [w[c] for c in SG_COLS],
                "pl": [w[c] for c in PL_COLS],
            },
        }

        # Include variant forms if any exist
        v_sg: dict[int, list[str]] = w.get("_variant_sg", {})
        v_pl: dict[int, list[str]] = w.get("_variant_pl", {})
        if v_sg or v_pl:
            variant_forms: dict[str, dict[str, list[str]]] = {}
            if v_sg:
                variant_forms["sg"] = {str(k): v for k, v in sorted(v_sg.items())}
            if v_pl:
                variant_forms["pl"] = {str(k): v for k, v in sorted(v_pl.items())}
            entry["variantForms"] = variant_forms

        json_words.append(entry)

    OUTPUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(json_words, f, ensure_ascii=False, indent="\t")
        f.write("\n")

    # 9. Diff with previous version
    _diff_word_banks(previous_json_words, json_words)

    # 10. Summary
    print(f"\n{'=' * 60}", file=sys.stderr)
    print("SUMMARY", file=sys.stderr)
    print(f"{'=' * 60}", file=sys.stderr)
    print(f"Total words:         {len(words)}", file=sys.stderr)
    print(f"Missing forms:       {len(missing_forms)}", file=sys.stderr)
    print(f"Missing translations: {len(missing_translations)}", file=sys.stderr)
    print(f"CSV output:          {OUTPUT_CSV_PATH}", file=sys.stderr)
    print(f"JSON output:         {OUTPUT_JSON_PATH}", file=sys.stderr)
    print(f"{'=' * 60}", file=sys.stderr)

    if missing_forms:
        print(f"\nLemmas with no forms: {', '.join(missing_forms)}", file=sys.stderr)
    if missing_translations:
        print(
            f"Lemmas with no translation: {', '.join(missing_translations)}",
            file=sys.stderr,
        )

    print(
        "\nDeclension data: MorphoDiTa, ÚFAL, Charles University",
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
