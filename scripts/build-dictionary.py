#!/usr/bin/env python3
"""
Build a compact Czech noun declension dictionary using MorphoDiTa (ÚFAL,
Charles University) for inflected forms and kaikki.org (Wiktionary) for
English translations and the lemma inventory.

Output format: JSON array of [lemma, translation, sg_forms, pl_forms, paradigm_hint]
where sg_forms/pl_forms are 7-element arrays: [nom, gen, dat, acc, voc, loc, ins]

Usage:
    python3 scripts/build-dictionary.py

Outputs:
    src/lib/data/dictionary.json
"""

import gzip
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_PATH = SCRIPT_DIR.parent / "src" / "lib" / "data" / "dictionary.json"

# --- MorphoDiTa API ---
MORPHODITA_API = "https://lindat.mff.cuni.cz/services/morphodita/api"
BATCH_SIZE = 200  # lemmas per API call

# --- Kaikki.org (Wiktionary) ---
KAIKKI_GZ_URL = (
    "https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl.gz"
)

# Czech morphological tag: position 2=gender, 3=number, 4=case, 14=variant
GENDER_MAP = {
    "M": ("m", True),
    "I": ("m", False),
    "F": ("f", False),
    "N": ("n", False),
}

SOFT_CONSONANTS = set("žšščřťďňjc")

PARADIGM_NAMES = {
    "hrad": "Hard masculine inanimate",
    "stroj": "Soft masculine inanimate",
    "pán": "Hard masculine animate",
    "muž": "Soft masculine animate",
    "předseda": "Masculine animate -a stem",
    "žena": "Hard feminine -a stem",
    "růže": "Soft feminine -e stem",
    "kost": "Feminine -i stem (consonant ending)",
    "město": "Hard neuter -o stem",
    "moře": "Soft neuter -e stem",
    "kuře": "Neuter -e/-ete stem (t-stem)",
    "stavení": "Neuter -í stem",
}


def detect_paradigm(
    word: str,
    gender: str,
    animate: bool,
    sg: list[str] | None = None,
    pl: list[str] | None = None,
) -> str:
    """Detect the paradigm from gender, animacy, word ending, and optional forms."""
    lower = word.lower()
    last = lower[-1] if lower else ""

    # T-stem neuter detection: if neuter ending in -e/-ě, check genitive sg for -ete/-ěte
    if gender == "n" and last in ("e", "ě") and sg is not None and len(sg) > 1:
        gen_sg = sg[1].lower() if sg[1] else ""
        if gen_sg.endswith("ete") or gen_sg.endswith("ěte"):
            return "kuře"

    if gender == "n":
        if last == "í":
            return "stavení"
        if last == "o":
            return "město"
        if last in ("e", "ě"):
            return "moře"
        return "město"
    if gender == "f":
        if last == "a":
            return "žena"
        if last in ("e", "ě"):
            return "růže"
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
    if last == "a":
        return "žena"
    if last == "o":
        return "město"
    if last in ("e", "ě"):
        return "růže"
    if last == "í":
        return "stavení"
    return "hrad"


def morphodita_api(endpoint, data):
    url = f"{MORPHODITA_API}/{endpoint}"
    post_data = urllib.parse.urlencode({"data": data, "output": "json"}).encode("utf-8")
    req = urllib.request.Request(url, data=post_data, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_lemma_ids(lemmas):
    """Analyze words to get MorphoDiTa lemma IDs for nouns."""
    lemma_ids = {}

    for i in range(0, len(lemmas), BATCH_SIZE):
        batch = lemmas[i : i + BATCH_SIZE]
        data = " ".join(batch)

        if i % (BATCH_SIZE * 10) == 0:
            print(
                f"  Resolving lemma IDs: {i}/{len(lemmas)}...",
                file=sys.stderr,
            )

        try:
            response = morphodita_api("analyze", data)
        except urllib.error.URLError as e:
            print(f"  WARNING: analyze batch {i} failed: {e}", file=sys.stderr)
            continue

        batch_set = set(batch)
        for token_result in response.get("result", []):
            for analysis in token_result:
                token = analysis.get("token", "").lower()
                if token not in batch_set or token in lemma_ids:
                    continue
                analyses = analysis.get("analyses", [])
                noun_analyses = [
                    a for a in analyses if a.get("tag", "").startswith("NN")
                ]
                if not noun_analyses:
                    continue
                # Prefer lemma ID whose base matches the token
                best = None
                for a in noun_analyses:
                    lid = a["lemma"]
                    base = lid.split("-")[0].split("_")[0].lower()
                    if base == token:
                        best = lid
                        break
                if best is None:
                    for a in noun_analyses:
                        tag = a["tag"]
                        if len(tag) >= 5 and tag[3] == "S" and tag[4] == "1":
                            best = a["lemma"]
                            break
                if best is None:
                    best = noun_analyses[0]["lemma"]
                lemma_ids[token] = best

        if i + BATCH_SIZE < len(lemmas):
            time.sleep(0.2)

    return lemma_ids


def generate_forms(lemma_id_pairs):
    """Generate inflected forms for resolved lemma IDs."""
    all_forms = {}

    for i in range(0, len(lemma_id_pairs), BATCH_SIZE):
        batch = lemma_id_pairs[i : i + BATCH_SIZE]
        data = "\n".join(lid for _, lid in batch)

        if i % (BATCH_SIZE * 10) == 0:
            print(
                f"  Generating forms: {i}/{len(lemma_id_pairs)}...",
                file=sys.stderr,
            )

        try:
            response = morphodita_api("generate", data)
        except urllib.error.URLError as e:
            print(f"  WARNING: generate batch {i} failed: {e}", file=sys.stderr)
            continue

        for (plain_lemma, _), lemma_result in zip(batch, response.get("result", [])):
            if lemma_result:
                all_forms[plain_lemma] = lemma_result

        if i + BATCH_SIZE < len(lemma_id_pairs):
            time.sleep(0.2)

    return all_forms


def extract_noun_forms(forms):
    """Extract 7 sg + 7 pl case forms from MorphoDiTa output. Standard variants only."""
    sg = [None] * 7
    pl = [None] * 7
    gender = None
    animate = None

    for entry in forms:
        tag = entry["tag"]
        if len(tag) < 5 or tag[0] != "N":
            continue
        # Skip non-standard variants
        if len(tag) > 14 and tag[14] != "-":
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

    if gender is None:
        return None

    sg = [f if f is not None else "" for f in sg]
    pl = [f if f is not None else "" for f in pl]

    # Require all 7 singular forms to be present
    if any(f == "" for f in sg):
        return None

    return gender, animate, sg, pl


def download_kaikki():
    """Download and parse kaikki.org Czech dictionary for noun lemmas + translations."""
    print("Downloading kaikki.org Czech dictionary...", file=sys.stderr)
    with urllib.request.urlopen(KAIKKI_GZ_URL, timeout=120) as resp:
        raw = resp.read()

    print("Decompressing and parsing...", file=sys.stderr)
    try:
        data = gzip.decompress(raw)
    except gzip.BadGzipFile:
        data = raw

    nouns = {}  # lemma -> translation
    for line in data.decode("utf-8").strip().split("\n"):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        if entry.get("pos") != "noun":
            continue
        if "forms" not in entry:
            continue

        word = entry.get("word", "").strip()
        if not word or word in nouns:
            continue

        # Get first English gloss
        translation = ""
        for sense in entry.get("senses", []):
            for gloss in sense.get("glosses", []):
                g = gloss.strip()
                if g:
                    if len(g) > 80:
                        g = g[:77] + "..."
                    translation = g
                    break
            if translation:
                break

        nouns[word] = translation

    return nouns


def main():
    # Step 1: Get noun inventory + translations from Wiktionary
    nouns = download_kaikki()
    print(f"Found {len(nouns)} noun lemmas from Wiktionary", file=sys.stderr)

    lemmas = sorted(nouns.keys(), key=str.lower)

    # Step 2: Resolve MorphoDiTa lemma IDs
    print("\nResolving MorphoDiTa lemma IDs...", file=sys.stderr)
    lemma_ids = resolve_lemma_ids(lemmas)
    print(f"  Resolved {len(lemma_ids)}/{len(lemmas)} lemma IDs", file=sys.stderr)

    # Step 3: Generate forms from MorphoDiTa
    resolved = [(l, lemma_ids[l]) for l in lemmas if l in lemma_ids]
    print(f"\nGenerating forms from MorphoDiTa for {len(resolved)} lemmas...", file=sys.stderr)
    morpho_forms = generate_forms(resolved)
    print(f"  Got forms for {len(morpho_forms)} lemmas", file=sys.stderr)

    # Step 4: Assemble dictionary
    print("\nAssembling dictionary...", file=sys.stderr)
    dictionary = []

    for lemma in lemmas:
        raw_forms = morpho_forms.get(lemma)
        if not raw_forms:
            continue

        result = extract_noun_forms(raw_forms)
        if result is None:
            continue

        gender, animate, sg, pl = result
        translation = nouns.get(lemma, "")
        paradigm = detect_paradigm(lemma, gender, animate, sg, pl)
        hint = PARADIGM_NAMES.get(paradigm, "")

        dictionary.append([lemma, translation, sg, pl, hint])

    # Sort alphabetically
    dictionary.sort(key=lambda x: x[0].lower())

    # Write output
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dictionary, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    print(f"\n{'=' * 60}", file=sys.stderr)
    print("SUMMARY", file=sys.stderr)
    print(f"{'=' * 60}", file=sys.stderr)
    print(f"Wiktionary lemmas:     {len(nouns)}", file=sys.stderr)
    print(f"MorphoDiTa resolved:   {len(lemma_ids)}", file=sys.stderr)
    print(f"MorphoDiTa generated:  {len(morpho_forms)}", file=sys.stderr)
    print(f"Final dictionary size: {len(dictionary)}", file=sys.stderr)
    print(f"Output: {OUTPUT_PATH}", file=sys.stderr)
    print(f"{'=' * 60}", file=sys.stderr)
    print(
        "\nDeclension data: MorphoDiTa, ÚFAL, Charles University",
        file=sys.stderr,
    )
    print("Translations: Wiktionary via kaikki.org", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
