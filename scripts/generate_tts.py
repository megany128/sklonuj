#!/usr/bin/env python3
"""Pre-generate Czech TTS audio via Microsoft Edge TTS (edge-tts).

Reads the word, adjective, and pronoun banks, collects every unique form,
and synthesizes one MP3 per unique string under ``static/audio/cs/<shard>/``.
Emits ``static/audio/index.json`` mapping text -> relative path so the
frontend can look up pre-generated audio by exact text equality.

Sentences are intentionally NOT pre-generated: the combinatorial explosion
would be huge, and the frontend falls back to the Web Speech API for them.

Usage:
    python3 scripts/generate_tts.py [--voice cs-CZ-AntoninNeural] [--limit N]
                                    [--dry-run] [--force]

If ``scripts/.venv-tts/`` does not exist, the script bootstraps it
automatically (preferring ``uv`` when available) and re-execs inside that
venv. This keeps ``pnpm tts:generate`` a one-step command.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "src" / "lib" / "data"
OUT_DIR = REPO_ROOT / "static" / "audio"
VENV_DIR = REPO_ROOT / "scripts" / ".venv-tts"
REQ_FILE = REPO_ROOT / "scripts" / "requirements-tts.txt"

DEFAULT_VOICE = "cs-CZ-AntoninNeural"
HASH_LEN = 16
CONCURRENCY = 8
MAX_RETRIES = 3


def bootstrap_venv() -> None:
    """Create the venv and re-exec this script inside it when missing.

    We do this in the CLI entry path rather than at import time so
    ``--help`` etc. still work without a venv.
    """
    python_bin = VENV_DIR / "bin" / "python3"
    if python_bin.exists():
        return

    print(f"[bootstrap] creating venv at {VENV_DIR}", flush=True)
    uv = shutil.which("uv")
    if uv:
        subprocess.check_call([uv, "venv", str(VENV_DIR)])
        subprocess.check_call(
            [uv, "pip", "install", "--python", str(python_bin), "-r", str(REQ_FILE)]
        )
    else:
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV_DIR)])
        subprocess.check_call(
            [str(python_bin), "-m", "pip", "install", "--upgrade", "pip"]
        )
        subprocess.check_call(
            [str(python_bin), "-m", "pip", "install", "-r", str(REQ_FILE)]
        )

    print("[bootstrap] venv ready; re-executing script", flush=True)
    os.execv(str(python_bin), [str(python_bin), str(Path(__file__).resolve()), *sys.argv[1:]])


def load_json(path: Path) -> object:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _collect_strings(value: object, sink: set[str]) -> None:
    """Walk arbitrary JSON and collect every non-empty string."""
    if isinstance(value, str):
        s = value.strip()
        if s:
            sink.add(s)
    elif isinstance(value, list):
        for item in value:
            _collect_strings(item, sink)
    elif isinstance(value, dict):
        for v in value.values():
            _collect_strings(v, sink)


def collect_texts() -> list[str]:
    """Collect every unique noun/adjective/pronoun form to synthesize."""
    texts: set[str] = set()

    word_bank = load_json(DATA_DIR / "word_bank.json")
    if isinstance(word_bank, list):
        for entry in word_bank:
            if not isinstance(entry, dict):
                continue
            lemma = entry.get("lemma")
            if isinstance(lemma, str) and lemma.strip():
                texts.add(lemma.strip())
            _collect_strings(entry.get("forms"), texts)
            _collect_strings(entry.get("variantForms"), texts)

    adj_bank = load_json(DATA_DIR / "adjective_bank.json")
    if isinstance(adj_bank, list):
        for entry in adj_bank:
            if not isinstance(entry, dict):
                continue
            lemma = entry.get("lemma")
            if isinstance(lemma, str) and lemma.strip():
                texts.add(lemma.strip())
            _collect_strings(entry.get("forms"), texts)
            _collect_strings(entry.get("variantForms"), texts)

    pron_bank = load_json(DATA_DIR / "pronoun_bank.json")
    if isinstance(pron_bank, list):
        for entry in pron_bank:
            if not isinstance(entry, dict):
                continue
            lemma = entry.get("lemma")
            if isinstance(lemma, str) and lemma.strip():
                texts.add(lemma.strip())
            _collect_strings(entry.get("forms"), texts)
            _collect_strings(entry.get("variantForms"), texts)

    # Skip tokens like "mě/mne" (slash-separated alternatives) verbatim — the
    # TTS would read the slash. Split them into alternatives instead so each
    # variant gets its own file. The ``prep`` pronoun fields sometimes hold
    # "mne/mě"; keep both sides available.
    expanded: set[str] = set()
    for t in texts:
        if "/" in t:
            for piece in t.split("/"):
                p = piece.strip()
                if p:
                    expanded.add(p)
        else:
            expanded.add(t)

    return sorted(expanded)


def path_for(voice: str, text: str) -> tuple[str, Path]:
    """Return (relative path under static/audio, absolute path)."""
    h = hashlib.sha1(f"{voice}|{text}".encode("utf-8")).hexdigest()[:HASH_LEN]
    shard = h[:2]
    rel = f"cs/{shard}/{h}.mp3"
    abs_path = OUT_DIR / rel
    return rel, abs_path


async def synth_one(text: str, voice: str, abs_path: Path) -> None:
    import edge_tts  # lazily imported so --help works pre-bootstrap

    abs_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = abs_path.with_suffix(abs_path.suffix + ".part")
    communicate = edge_tts.Communicate(text=text, voice=voice)
    await communicate.save(str(tmp))
    if tmp.stat().st_size == 0:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"empty audio for {text!r}")
    tmp.replace(abs_path)


async def synth_with_retry(text: str, voice: str, abs_path: Path) -> None:
    delay = 1.0
    last_err: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            await synth_one(text, voice, abs_path)
            return
        except Exception as e:  # noqa: BLE001 — we want to retry any transient error
            last_err = e
            if attempt == MAX_RETRIES:
                break
            await asyncio.sleep(delay)
            delay *= 2
    assert last_err is not None
    raise last_err


async def run(
    texts: list[str], voice: str, force: bool
) -> tuple[dict[str, str], int, int, list[tuple[str, str]]]:
    """Return (manifest_entries, generated, skipped, failures)."""
    sem = asyncio.Semaphore(CONCURRENCY)
    entries: dict[str, str] = {}
    generated = 0
    skipped = 0
    failures: list[tuple[str, str]] = []
    done = 0
    total = len(texts)

    async def worker(text: str) -> None:
        nonlocal generated, skipped, done
        rel, abs_path = path_for(voice, text)
        entries[text] = rel
        if not force and abs_path.exists() and abs_path.stat().st_size > 0:
            skipped += 1
        else:
            async with sem:
                try:
                    await synth_with_retry(text, voice, abs_path)
                    generated += 1
                except Exception as e:  # noqa: BLE001
                    failures.append((text, repr(e)))
        done += 1
        if done % 100 == 0 or done == total:
            print(f"[{done}/{total}] generated={generated} skipped={skipped} failed={len(failures)}", flush=True)

    await asyncio.gather(*(worker(t) for t in texts))
    return entries, generated, skipped, failures


def write_manifest(entries: dict[str, str], voice: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "index.json"
    payload = {
        "voice": voice,
        "entries": {k: entries[k] for k in sorted(entries.keys())},
    }
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Pre-generate Czech TTS audio via edge-tts")
    p.add_argument("--voice", default=DEFAULT_VOICE, help=f"Edge TTS voice name (default: {DEFAULT_VOICE})")
    p.add_argument("--limit", type=int, default=None, help="Only generate the first N items")
    p.add_argument("--dry-run", action="store_true", help="Count items and total chars without generating")
    p.add_argument("--force", action="store_true", help="Regenerate even if MP3 already exists")
    return p.parse_args(list(argv))


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    texts = collect_texts()
    if args.limit is not None:
        texts = texts[: args.limit]

    total_chars = sum(len(t) for t in texts)
    print(f"collected {len(texts)} unique strings ({total_chars} chars) for voice {args.voice}", flush=True)

    if args.dry_run:
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries, generated, skipped, failures = asyncio.run(run(texts, args.voice, args.force))

    write_manifest(entries, args.voice)
    print(
        f"done: generated={generated} skipped={skipped} failed={len(failures)} "
        f"manifest={OUT_DIR / 'index.json'}",
        flush=True,
    )
    if failures:
        print("failures:", file=sys.stderr)
        for text, err in failures[:50]:
            print(f"  {text!r}: {err}", file=sys.stderr)
        if len(failures) > 50:
            print(f"  ... and {len(failures) - 50} more", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    # Only bootstrap/re-exec when running the actual generation; skip during
    # --help/--dry-run so those stay instant in clean checkouts.
    if "--help" not in sys.argv and "-h" not in sys.argv:
        bootstrap_venv()
    raise SystemExit(main(sys.argv[1:]))
