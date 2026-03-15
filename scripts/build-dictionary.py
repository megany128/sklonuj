#!/usr/bin/env python3
"""
Download Czech noun declension data from kaikki.org and produce a compact JSON dictionary.

Output format: array of [lemma, translation, sg_forms, pl_forms, paradigm_hint]
where sg_forms/pl_forms are 7-element arrays: [nom, gen, dat, acc, voc, loc, ins]
and paradigm_hint is a human-readable string like "Hard feminine -a stem"

Usage:
    curl -sL "https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl" | python3 scripts/build-dictionary.py
"""

import sys
import json

CASE_TAGS = {
    "nominative": 0,
    "genitive": 1,
    "dative": 2,
    "accusative": 3,
    "vocative": 4,
    "locative": 5,
    "instrumental": 6,
}

SOFT_CONSONANTS = set("žšščřťďňjc")

# Paradigm names matching paradigms.json
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


def extract_gender_animacy(entry):
    """Extract gender and animacy from senses tags and head_templates."""
    gender = None  # 'm', 'f', 'n'
    animate = None  # True, False

    # Check senses tags
    for sense in entry.get("senses", []):
        for t in sense.get("tags", []):
            if t == "masculine":
                gender = "m"
            elif t == "feminine":
                gender = "f"
            elif t == "neuter":
                gender = "n"
            elif t == "animate":
                animate = True
            elif t == "inanimate":
                animate = False

    # Check head_templates expansion as fallback
    if gender is None or animate is None:
        for ht in entry.get("head_templates", []):
            exp = ht.get("expansion", "").lower()
            args = ht.get("args", {})
            arg1 = args.get("1", "").lower()

            if gender is None:
                if " f " in f" {exp} " or arg1.startswith("f"):
                    gender = "f"
                elif " n " in f" {exp} " or arg1.startswith("n"):
                    gender = "n"
                elif " m " in f" {exp} " or arg1.startswith("m"):
                    gender = "m"

            if animate is None:
                if "inan" in exp or "inan" in arg1:
                    animate = False
                elif "anim" in exp or "anim" in arg1:
                    animate = True

    return gender, animate


def detect_paradigm(word, gender, animate):
    """Detect the paradigm from gender, animacy, and word ending."""
    lower = word.lower()

    if gender == "n":
        if lower.endswith("í"):
            return "stavení"
        if lower.endswith("o"):
            return "město"
        if lower.endswith("e") or lower.endswith("ě"):
            # Could be moře or kuře (t-stem); t-stems have -ete in gen sg
            # but we can't easily check that here, default to moře
            return "moře"
        return "město"

    if gender == "f":
        if lower.endswith("a"):
            return "žena"
        if lower.endswith("e") or lower.endswith("ě"):
            return "růže"
        # Consonant-ending feminine → kost
        return "kost"

    if gender == "m":
        if lower.endswith("a"):
            return "předseda"
        # Consonant-ending: check soft vs hard, animate vs inanimate
        last_char = lower[-1] if lower else ""
        is_soft = last_char in SOFT_CONSONANTS
        if animate:
            return "muž" if is_soft else "pán"
        else:
            return "stroj" if is_soft else "hrad"

    # Unknown gender - guess from ending
    if lower.endswith("a"):
        return "žena"
    if lower.endswith("o"):
        return "město"
    if lower.endswith("e") or lower.endswith("ě"):
        return "růže"
    if lower.endswith("í"):
        return "stavení"
    return "hrad"


def extract_translation(entry):
    """Get the first English gloss from senses."""
    for sense in entry.get("senses", []):
        for gloss in sense.get("glosses", []):
            g = gloss.strip()
            if g:
                if len(g) > 80:
                    g = g[:77] + "..."
                return g
    return ""


def extract_forms(entry):
    """Extract the 7 case forms for sg and pl from the forms array."""
    sg = [None] * 7
    pl = [None] * 7

    for form_entry in entry.get("forms", []):
        tags = set(form_entry.get("tags", []))
        form_text = form_entry.get("form", "")

        if not form_text or "table-tags" in tags or "inflection-template" in tags:
            continue

        case_idx = None
        for case_name, idx in CASE_TAGS.items():
            if case_name in tags:
                case_idx = idx
                break

        if case_idx is None:
            continue

        if "singular" in tags:
            if sg[case_idx] is None:
                sg[case_idx] = form_text
        elif "plural" in tags:
            if pl[case_idx] is None:
                pl[case_idx] = form_text

    return sg, pl


def main():
    dictionary = []
    seen = set()

    for line in sys.stdin:
        entry = json.loads(line)

        if entry.get("pos") != "noun":
            continue

        if "forms" not in entry:
            continue

        word = entry.get("word", "").strip()
        if not word or word in seen:
            continue

        sg, pl = extract_forms(entry)

        # Only include if we have all 7 singular forms
        if any(f is None for f in sg):
            continue

        # Fill missing plural forms with empty string
        pl = [f if f is not None else "" for f in pl]

        translation = extract_translation(entry)
        gender, animate = extract_gender_animacy(entry)
        paradigm = detect_paradigm(word, gender, animate)
        hint = PARADIGM_NAMES.get(paradigm, "")

        dictionary.append([word, translation, sg, pl, hint])
        seen.add(word)

    # Sort alphabetically
    dictionary.sort(key=lambda x: x[0].lower())

    print(json.dumps(dictionary, ensure_ascii=False, separators=(",", ":")))
    print(f"Extracted {len(dictionary)} nouns", file=sys.stderr)


if __name__ == "__main__":
    main()
