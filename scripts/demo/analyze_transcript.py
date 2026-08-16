#!/usr/bin/env python3
"""
Tag a story transcript with MorphoDiTa and emit a review sheet of drillable
noun / adjective tokens (case, number, gender, animacy), flagging anything the
tagger might be unsure about. Nothing here writes into the app — the output is
a proofreading aid for hand-curating a demo package's content.ts.

Usage:
    python3 scripts/demo/analyze_transcript.py [transcript.txt] [--slug NAME]

Outputs (next to the transcript):
    <slug>.candidates.json   machine-readable tokens + candidate WordEntry
                             objects for lemmas missing from word_bank.json
    <slug>.review.md         human review table

Requirements: internet (LINDAT MorphoDiTa REST API), Python 3.9+, stdlib only.
If urllib fails with CERTIFICATE_VERIFY_FAILED behind a TLS-inspecting proxy,
point Python at the system trust store, e.g. on macOS:
    security find-certificate -a -p /Library/Keychains/System.keychain > /tmp/ca.pem
    SSL_CERT_FILE=/tmp/ca.pem python3 scripts/demo/analyze_transcript.py
Reuses helpers from scripts/build_word_bank_morphodita.py so tag parsing and
paradigm detection stay lock-step with the real bank builder.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
from collections import OrderedDict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR.parent))

from build_word_bank_morphodita import (  # noqa: E402
    GENDER_MAP,
    _morphodita_api,
    detect_paradigm,
    extract_noun_forms,
    fetch_morphodita_forms,
)

WORD_BANK_PATH = SCRIPT_DIR.parent.parent / "src" / "lib" / "data" / "word_bank.json"
ADJ_BANK_PATH = SCRIPT_DIR.parent.parent / "src" / "lib" / "data" / "adjective_bank.json"

CASE_NAMES = {"1": "nom", "2": "gen", "3": "dat", "4": "acc", "5": "voc", "6": "loc", "7": "ins"}
NUMBER_NAMES = {"S": "sg", "P": "pl"}

# Which demo section a (case, preposition) combination most naturally feeds.
SECTION_HINT = {
    "acc": "a. accusative",
    "ins": "b. instrumental",
    "loc": "c. direction vs location",
    "gen": "c. direction vs location (do/z + gen)",
    "nom": "— (subject; contrast only)",
    "dat": "d. mixed",
    "voc": "d. mixed",
}


def strip_lemma_id(lemma_id: str) -> str:
    """'medvěd_^(zvíře)' -> 'medvěd', 'dítě-1' -> 'dítě', 'turista' -> 'turista'."""
    base = lemma_id
    for sep in ("_", "`"):
        base = base.split(sep)[0]
    if "-" in base and base.rsplit("-", 1)[1].isdigit():
        base = base.rsplit("-", 1)[0]
    return base


def tag_text(text: str) -> list[list[dict]]:
    """Run the MorphoDiTa tagger; return sentences of {form, lemma, tag, space} tokens."""
    response = _morphodita_api("tag", text)
    sentences: list[list[dict]] = []
    for sent in response.get("result", []):
        tokens = [
            {
                "form": t.get("token", ""),
                "lemma": t.get("lemma", ""),
                "tag": t.get("tag", ""),
                "space": t.get("space", ""),
            }
            for t in sent
        ]
        if tokens:
            sentences.append(tokens)
    return sentences


def analyze_readings(forms: list[str]) -> dict[str, list[dict]]:
    """analyze endpoint: surface form -> all {lemma, tag} readings."""
    out: dict[str, list[dict]] = {}
    batch_size = 50
    for i in range(0, len(forms), batch_size):
        batch = forms[i : i + batch_size]
        response = _morphodita_api("analyze", "\n".join(batch))
        for token_result in response.get("result", []):
            for analysis in token_result:
                token = analysis.get("token", "")
                if token in out:
                    continue
                out[token] = analysis.get("analyses", [])
        if i + batch_size < len(forms):
            time.sleep(0.3)
    return out


def sentence_text(tokens: list[dict]) -> str:
    return "".join(t["form"] + t["space"] for t in tokens).strip()


def preceding_prep(tokens: list[dict], idx: int) -> str | None:
    """Nearest preposition (tag R...) within 3 tokens to the left, if any."""
    for j in range(idx - 1, max(-1, idx - 4), -1):
        tag = tokens[j]["tag"]
        if tag.startswith("R"):
            return tokens[j]["form"].lower()
        if tag[0] in "NVJ" and tag[0] != "N":  # stop at verbs / conjunctions
            break
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("transcript", nargs="?", default=str(SCRIPT_DIR / "slowczech_317_transcript.txt"))
    ap.add_argument("--slug", default=None)
    args = ap.parse_args()

    transcript_path = Path(args.transcript)
    slug = args.slug or transcript_path.stem.replace("_transcript", "")
    text = transcript_path.read_text(encoding="utf-8")

    print(f"Tagging {transcript_path.name} via MorphoDiTa...", file=sys.stderr)
    try:
        sentences = tag_text(text)
    except urllib.error.URLError as e:
        print(f"ERROR: MorphoDiTa tag failed: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"  {len(sentences)} sentences", file=sys.stderr)

    word_bank = json.loads(WORD_BANK_PATH.read_text(encoding="utf-8"))
    bank_by_lemma = {w["lemma"]: w for w in word_bank}
    adj_bank = json.loads(ADJ_BANK_PATH.read_text(encoding="utf-8"))
    adj_lemmas = {a["lemma"] for a in adj_bank}

    tokens_out: list[dict] = []
    for s_idx, sent in enumerate(sentences):
        s_text = sentence_text(sent)
        for t_idx, tok in enumerate(sent):
            tag = tok["tag"]
            if len(tag) < 15 or tag[0] not in ("N", "A"):
                continue
            if tag[0] == "N" and tag[1] != "N":
                continue  # skip abbreviations etc.
            if tag[0] == "A" and tag[1] not in ("A", "U", "G", "M", "C", "O"):
                continue
            case = CASE_NAMES.get(tag[4])
            number = NUMBER_NAMES.get(tag[3])
            if case is None or number is None:
                continue
            gender_info = GENDER_MAP.get(tag[2])
            lemma = strip_lemma_id(tok["lemma"])
            tokens_out.append(
                {
                    "sentence_index": s_idx,
                    "sentence": s_text,
                    "form": tok["form"],
                    "lemma": lemma,
                    "lemma_id": tok["lemma"],
                    "pos": "noun" if tag[0] == "N" else "adjective",
                    "tag": tag,
                    "gender": gender_info[0] if gender_info else None,
                    "animate": gender_info[1] if gender_info else None,
                    "number": number,
                    "case": case,
                    "prep": preceding_prep(sent, t_idx),
                    "variant_pos14": tag[14],
                    "in_bank": (lemma in bank_by_lemma) if tag[0] == "N" else (lemma in adj_lemmas),
                }
            )

    # Ambiguity: how many distinct (case, number, gender) readings does the bare
    # surface form have for the same POS? The tagger picked one; >1 = human check.
    unique_forms = list(OrderedDict.fromkeys(t["form"] for t in tokens_out))
    print(f"  Analyzing {len(unique_forms)} unique forms for ambiguity...", file=sys.stderr)
    readings = analyze_readings(unique_forms)
    for t in tokens_out:
        pos_char = "N" if t["pos"] == "noun" else "A"
        alts = set()
        for r in readings.get(t["form"], []):
            rt = r.get("tag", "")
            if len(rt) < 15 or rt[0] != pos_char:
                continue
            if strip_lemma_id(r.get("lemma", "")) != t["lemma"]:
                continue
            alts.add((CASE_NAMES.get(rt[4]), NUMBER_NAMES.get(rt[3]), rt[2]))
        t["alternative_readings"] = sorted(
            f"{c}.{n}.{g}" for (c, n, g) in alts if c and n
        )
        t["ambiguous"] = len(alts) > 1
        t["colloquial"] = t["variant_pos14"] != "-"
        t["section_hint"] = SECTION_HINT.get(t["case"], "")

    # Candidate WordEntry objects for nouns missing from the bank.
    missing = list(
        OrderedDict.fromkeys(t["lemma"] for t in tokens_out if t["pos"] == "noun" and not t["in_bank"])
    )
    candidates: dict[str, dict] = {}
    if missing:
        print(f"  Generating candidate entries for {len(missing)} missing nouns: {', '.join(missing)}", file=sys.stderr)
        forms_by_lemma = fetch_morphodita_forms(missing)
        # The builder's resolver lowercases tokens, so capitalised proper nouns
        # (Slovensko, Tatry) fall through. Retry those with the tagger's own
        # lemma ID, which the generate endpoint accepts directly.
        tagger_ids = {t["lemma"]: t["lemma_id"] for t in tokens_out if t["pos"] == "noun"}
        for lemma in missing:
            if lemma in forms_by_lemma:
                continue
            lemma_id = tagger_ids.get(lemma)
            if not lemma_id:
                continue
            try:
                response = _morphodita_api("generate", lemma_id)
            except urllib.error.URLError:
                continue
            result = response.get("result", [])
            if result and result[0]:
                forms_by_lemma[lemma] = result[0]
        for lemma in missing:
            forms = forms_by_lemma.get(lemma)
            if not forms:
                candidates[lemma] = {"lemma": lemma, "error": "MorphoDiTa could not generate forms"}
                continue
            extracted = extract_noun_forms(forms, lemma)
            if extracted is None:
                candidates[lemma] = {"lemma": lemma, "error": "no noun readings"}
                continue
            gender, animate, sg, pl, var_sg, var_pl = extracted
            plural_only = all(not f for f in sg) and any(pl)
            entry: dict = {
                "lemma": lemma,
                "translation": "TODO",
                "gender": gender,
                "animate": animate,
                "paradigm": detect_paradigm(lemma, gender, animate, sg, pl),
                "difficulty": "B1",
                "categories": ["demo"],
                "forms": {"sg": sg, "pl": pl},
            }
            if plural_only:
                entry["pluralOnly"] = True
            variant_forms: dict = {}
            if var_sg:
                variant_forms["sg"] = {str(k): v for k, v in var_sg.items()}
            if var_pl:
                variant_forms["pl"] = {str(k): v for k, v in var_pl.items()}
            if variant_forms:
                entry["variantForms"] = variant_forms
            candidates[lemma] = entry

    out_json = transcript_path.with_name(f"{slug}.candidates.json")
    out_json.write_text(
        json.dumps({"tokens": tokens_out, "missing_noun_candidates": candidates}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    # Review sheet
    lines = [
        f"# Review sheet: {slug}",
        "",
        "Generated by `scripts/demo/analyze_transcript.py` from the MorphoDiTa tagger.",
        "Proofread every row before it becomes a drill item. Flags: **AMB** = the surface form has",
        "more than one reading (tagger picked one), **COLL** = non-standard variant per MorphoDiTa,",
        "**NEW** = lemma not in word_bank.json (candidate entry emitted in candidates.json).",
        "",
        "| # | sentence | form | lemma | POS | gender | num | case | prep | flags | alt readings | section hint |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for i, t in enumerate(tokens_out, 1):
        flags = []
        if t["ambiguous"]:
            flags.append("AMB")
        if t["colloquial"]:
            flags.append("COLL")
        if not t["in_bank"]:
            flags.append("NEW")
        g = t["gender"] or "?"
        if t["animate"]:
            g += "-anim"
        lines.append(
            f"| {i} | {t['sentence']} | **{t['form']}** | {t['lemma']} | {t['pos']} | {g} | {t['number']} | {t['case']} | "
            f"{t['prep'] or ''} | {' '.join(flags)} | {', '.join(t['alternative_readings'])} | {t['section_hint']} |"
        )
    if candidates:
        lines += ["", "## Candidate entries for lemmas missing from word_bank.json", ""]
        for lemma, entry in candidates.items():
            lines.append(f"### {lemma}")
            lines.append("```json")
            lines.append(json.dumps(entry, ensure_ascii=False, indent=2))
            lines.append("```")
    out_md = transcript_path.with_name(f"{slug}.review.md")
    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {out_json.name} and {out_md.name} ({len(tokens_out)} tokens, {len(candidates)} new lemmas)", file=sys.stderr)


if __name__ == "__main__":
    main()
