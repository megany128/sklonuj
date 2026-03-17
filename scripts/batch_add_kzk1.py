#!/usr/bin/env python3
"""
Extract nouns from the KzK1 Anki deck and add them to the word bank pipeline.

Reads KzK1.apkg, filters for nouns, deduplicates against existing lemmas,
auto-assigns difficulty and categories, then appends to starter_lemmas.txt
and starter_nouns_meta.csv.

Usage:
    python3 scripts/batch_add_kzk1.py
"""

import csv
import os
import re
import sqlite3
import sys
import tempfile
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

APKG_PATH = PROJECT_ROOT / "src" / "lib" / "data" / "KzK1.apkg"
LEMMAS_PATH = SCRIPT_DIR / "starter_lemmas.txt"
META_CSV_PATH = SCRIPT_DIR / "starter_nouns_meta.csv"

# POS tags that represent nouns we want (single gender, not pluralia tantum)
NOUN_POS_TAGS = {"fem", "anim", "inan", "neut"}

# POS tags to skip (ambiguous or pluralia tantum)
SKIP_POS_TAGS = {"pl", "anim/fem", "anim/inan", "fem/anim", "inan/anim"}

# Maximum frequency rank to include
MAX_RANK = 5000


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


def load_existing_meta(path: Path) -> set[str]:
    """Load existing lemmas from starter_nouns_meta.csv."""
    lemmas = set()
    if not path.exists():
        return lemmas
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            lemmas.add(row["lemma"].lower())
    return lemmas


def extract_nouns_from_apkg(apkg_path: Path) -> list[dict]:
    """
    Extract noun entries from the KzK1 Anki deck.

    Field structure: rank | word | pos | translation | example_cz | example_en | freq
    Fields are separated by \\x1f (unit separator).
    """
    nouns = []

    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(apkg_path) as z:
            # Find the SQLite database file
            db_name = None
            for name in z.namelist():
                if name.endswith(".anki2") or name.endswith(".anki21"):
                    db_name = name
                    break

            if db_name is None:
                print("ERROR: No anki2 database found in .apkg file", file=sys.stderr)
                sys.exit(1)

            z.extract(db_name, tmp)
            db_path = os.path.join(tmp, db_name)

        db = sqlite3.connect(db_path)
        rows = db.execute("SELECT flds FROM notes").fetchall()
        db.close()

    print(f"  Total notes in Anki deck: {len(rows)}", file=sys.stderr)

    for row in rows:
        fields = row[0].split("\x1f")
        if len(fields) < 7:
            continue

        rank_str = fields[0].strip()
        word = fields[1].strip()
        pos = fields[2].strip().lower()
        translation = fields[3].strip()
        freq_str = fields[6].strip()

        # Strip any HTML tags from fields
        word = re.sub(r"<[^>]+>", "", word).strip()
        translation = re.sub(r"<[^>]+>", "", translation).strip()

        # Skip non-noun POS tags
        if pos not in NOUN_POS_TAGS:
            continue

        # Skip ambiguous/plural POS tags
        if pos in SKIP_POS_TAGS:
            continue

        # Skip multi-word entries
        if " " in word:
            continue

        # Parse rank
        try:
            rank = int(rank_str)
        except ValueError:
            continue

        nouns.append(
            {
                "rank": rank,
                "word": word.lower(),
                "pos": pos,
                "translation": translation,
                "freq": freq_str,
            }
        )

    return nouns


def truncate_translation(translation: str) -> str:
    """Truncate translation to first meaning (before first comma or semicolon)."""
    # Split on comma or semicolon, take first part
    for sep in [",", ";"]:
        if sep in translation:
            translation = translation.split(sep)[0].strip()
    # Remove parenthetical notes at the end
    translation = re.sub(r"\s*\([^)]*\)\s*$", "", translation).strip()
    return translation


def categorize_word(translation: str) -> str:
    """
    Auto-assign categories and semantic tags based on English translation keywords.

    Returns a comma-separated string of categories.
    """
    t = translation.lower()

    # Family-related words
    family_keywords = [
        "mother",
        "father",
        "son",
        "daughter",
        "brother",
        "sister",
        "uncle",
        "aunt",
        "parent",
        "husband",
        "wife",
        "grandma",
        "grandpa",
        "grandmother",
        "grandfather",
        "child",
        "baby",
        "family",
        "nephew",
        "niece",
        "cousin",
        "sibling",
        "spouse",
    ]
    if any(kw in t for kw in family_keywords):
        return "family,people"

    # Person/profession words
    person_keywords = [
        "teacher",
        "doctor",
        "student",
        "director",
        "author",
        "judge",
        "worker",
        "driver",
        "officer",
        "soldier",
        "president",
        "minister",
        "king",
        "queen",
        "prince",
        "princess",
        "neighbor",
        "neighbour",
        "friend",
        "person",
        "man",
        "woman",
        "boy",
        "girl",
        "artist",
        "writer",
        "singer",
        "player",
        "actor",
        "actress",
        "nurse",
        "professor",
        "boss",
        "chief",
        "leader",
        "manager",
        "owner",
        "expert",
        "scientist",
        "engineer",
        "lawyer",
        "journalist",
        "citizen",
        "member",
        "guest",
        "visitor",
        "patient",
        "victim",
        "witness",
        "thief",
        "enemy",
        "hero",
    ]
    if any(kw in t for kw in person_keywords):
        return "misc,people"

    # Animal words
    animal_keywords = [
        "dog",
        "cat",
        "horse",
        "bird",
        "fish",
        "cow",
        "pig",
        "chicken",
        "mouse",
        "rat",
        "bear",
        "wolf",
        "fox",
        "rabbit",
        "deer",
        "lion",
        "tiger",
        "snake",
        "insect",
        "animal",
        "pet",
        "duck",
        "goat",
        "sheep",
        "frog",
        "butterfly",
        "bee",
        "ant",
    ]
    if any(kw in t for kw in animal_keywords):
        return "animals"

    # Body parts
    body_keywords = [
        "head",
        "hand",
        "arm",
        "leg",
        "foot",
        "eye",
        "ear",
        "nose",
        "mouth",
        "tooth",
        "teeth",
        "hair",
        "face",
        "neck",
        "back",
        "chest",
        "finger",
        "knee",
        "shoulder",
        "heart",
        "brain",
        "blood",
        "bone",
        "skin",
        "stomach",
        "throat",
        "lip",
        "tongue",
    ]
    if any(kw in t for kw in body_keywords):
        return "body"

    # Food/drink words
    food_keywords = [
        "food",
        "bread",
        "meat",
        "milk",
        "cheese",
        "butter",
        "egg",
        "rice",
        "soup",
        "salad",
        "cake",
        "sugar",
        "salt",
        "pepper",
        "fruit",
        "vegetable",
        "potato",
        "tomato",
        "apple",
        "beer",
        "wine",
        "coffee",
        "tea",
        "water",
        "juice",
        "drink",
        "meal",
        "dinner",
        "lunch",
        "breakfast",
        "supper",
        "snack",
        "chocolate",
        "ice cream",
    ]
    meal_keywords = ["meal", "dinner", "lunch", "breakfast", "supper"]
    if any(kw in t for kw in food_keywords):
        if any(kw in t for kw in meal_keywords):
            return "food,meal"
        return "food"

    # Nature words
    nature_keywords = [
        "tree",
        "river",
        "mountain",
        "sea",
        "sun",
        "moon",
        "star",
        "sky",
        "cloud",
        "rain",
        "snow",
        "wind",
        "flower",
        "garden",
        "forest",
        "field",
        "lake",
        "ocean",
        "island",
        "stone",
        "rock",
        "earth",
        "grass",
        "leaf",
        "plant",
        "weather",
        "spring",
        "summer",
        "autumn",
        "winter",
        "hill",
        "valley",
        "wood",
        "beach",
    ]
    if any(kw in t for kw in nature_keywords):
        return "nature"

    # Place words
    place_keywords = [
        "city",
        "town",
        "room",
        "house",
        "home",
        "school",
        "station",
        "street",
        "road",
        "building",
        "office",
        "hospital",
        "church",
        "shop",
        "store",
        "market",
        "restaurant",
        "hotel",
        "castle",
        "palace",
        "museum",
        "theater",
        "theatre",
        "cinema",
        "library",
        "park",
        "square",
        "bridge",
        "airport",
        "village",
        "country",
        "land",
        "state",
        "place",
        "area",
        "region",
        "center",
        "centre",
        "floor",
        "door",
        "window",
        "wall",
        "kitchen",
        "bathroom",
        "bedroom",
        "apartment",
        "flat",
        "factory",
        "prison",
        "border",
        "corner",
        "hall",
        "garden",
        "space",
        "bank",
        "cafe",
    ]
    if any(kw in t for kw in place_keywords):
        return "places"

    # Time words
    time_keywords = [
        "day",
        "week",
        "month",
        "year",
        "hour",
        "minute",
        "second",
        "time",
        "morning",
        "evening",
        "night",
        "afternoon",
        "moment",
        "period",
        "century",
        "age",
        "date",
        "season",
        "holiday",
        "weekend",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "today",
        "tomorrow",
        "yesterday",
    ]
    if any(kw in t for kw in time_keywords):
        return "time"

    # Transport words
    transport_keywords = [
        "car",
        "bus",
        "train",
        "plane",
        "airplane",
        "ship",
        "boat",
        "bicycle",
        "bike",
        "taxi",
        "tram",
        "metro",
        "subway",
        "vehicle",
        "flight",
        "ticket",
        "road",
    ]
    if any(kw in t for kw in transport_keywords):
        return "transportation"

    # Object words
    object_keywords = [
        "book",
        "table",
        "chair",
        "phone",
        "computer",
        "television",
        "tv",
        "radio",
        "newspaper",
        "letter",
        "pen",
        "pencil",
        "paper",
        "bag",
        "box",
        "bottle",
        "cup",
        "glass",
        "plate",
        "knife",
        "key",
        "clock",
        "watch",
        "picture",
        "photo",
        "camera",
        "lamp",
        "bed",
        "mirror",
        "shirt",
        "dress",
        "coat",
        "hat",
        "shoe",
        "clothes",
        "money",
        "card",
        "thing",
        "tool",
        "machine",
        "device",
        "instrument",
        "weapon",
        "gun",
        "sword",
        "bell",
        "ring",
        "gift",
        "present",
        "toy",
        "ball",
        "game",
    ]
    if any(kw in t for kw in object_keywords):
        return "objects"

    # Abstract/event words with semantic tags
    event_keywords = [
        "war",
        "battle",
        "fight",
        "meeting",
        "wedding",
        "party",
        "celebration",
        "ceremony",
        "election",
        "competition",
        "concert",
        "performance",
        "match",
        "race",
    ]
    if any(kw in t for kw in event_keywords):
        return "misc,event"

    abstract_keywords = [
        "idea",
        "thought",
        "opinion",
        "reason",
        "cause",
        "effect",
        "result",
        "success",
        "failure",
        "hope",
        "fear",
        "joy",
        "pain",
        "love",
        "hate",
        "truth",
        "lie",
        "freedom",
        "justice",
        "peace",
        "power",
        "strength",
        "knowledge",
        "experience",
        "memory",
        "dream",
        "wish",
        "desire",
        "feeling",
        "emotion",
        "spirit",
        "soul",
        "mind",
        "sense",
        "meaning",
        "value",
        "quality",
        "ability",
        "skill",
        "effort",
        "attention",
        "interest",
        "influence",
        "tradition",
        "culture",
        "education",
        "science",
        "art",
        "music",
        "history",
        "nature",
        "law",
        "rule",
        "right",
        "duty",
        "responsibility",
    ]
    if any(kw in t for kw in abstract_keywords):
        return "misc,abstract"

    return "misc"


def assign_difficulty(rank: int) -> str:
    """Assign difficulty based on frequency rank."""
    if rank <= 500:
        return "A1"
    if rank <= 1500:
        return "A2"
    return "B1"


def main() -> int:
    print("=== Batch-adding nouns from KzK1 Anki deck ===", file=sys.stderr)

    # Verify .apkg exists
    if not APKG_PATH.exists():
        print(f"ERROR: {APKG_PATH} not found", file=sys.stderr)
        return 1

    # 1. Load existing data
    existing_lemmas = load_existing_lemmas(LEMMAS_PATH)
    existing_meta = load_existing_meta(META_CSV_PATH)
    all_existing = existing_lemmas | existing_meta
    print(
        f"  Existing lemmas: {len(existing_lemmas)} in txt, {len(existing_meta)} in csv",
        file=sys.stderr,
    )

    # 2. Extract nouns from Anki deck
    print("\nExtracting nouns from KzK1.apkg...", file=sys.stderr)
    nouns = extract_nouns_from_apkg(APKG_PATH)
    print(f"  Found {len(nouns)} noun entries", file=sys.stderr)

    # 3. Sort by rank (lower = more common)
    nouns.sort(key=lambda x: x["rank"])

    # 4. Filter: skip duplicates, limit to top MAX_RANK by rank
    new_nouns = []
    seen = set()
    for noun in nouns:
        word = noun["word"]
        if word in all_existing:
            continue
        if word in seen:
            continue
        if noun["rank"] > MAX_RANK:
            continue
        seen.add(word)
        new_nouns.append(noun)

    print(
        f"  After filtering: {len(new_nouns)} new nouns (rank <= {MAX_RANK}, no duplicates)",
        file=sys.stderr,
    )

    if not new_nouns:
        print("  No new nouns to add!", file=sys.stderr)
        return 0

    # 5. Assign difficulty and categories
    for noun in new_nouns:
        noun["difficulty"] = assign_difficulty(noun["rank"])
        noun["short_translation"] = truncate_translation(noun["translation"])
        noun["categories"] = categorize_word(noun["short_translation"])

    # Show distribution
    diff_counts = {}
    cat_counts = {}
    for noun in new_nouns:
        d = noun["difficulty"]
        diff_counts[d] = diff_counts.get(d, 0) + 1
        for c in noun["categories"].split(","):
            cat_counts[c] = cat_counts.get(c, 0) + 1

    print("\n  Difficulty distribution:", file=sys.stderr)
    for d in sorted(diff_counts):
        print(f"    {d}: {diff_counts[d]}", file=sys.stderr)

    print("\n  Category distribution:", file=sys.stderr)
    for c in sorted(cat_counts, key=lambda x: -cat_counts[x]):
        print(f"    {c}: {cat_counts[c]}", file=sys.stderr)

    # 6. Append to starter_lemmas.txt
    print(f"\nAppending {len(new_nouns)} lemmas to {LEMMAS_PATH.name}...", file=sys.stderr)
    with open(LEMMAS_PATH, "a", encoding="utf-8") as f:
        f.write("\n# KzK1 Anki deck additions\n")
        for noun in new_nouns:
            f.write(f"{noun['word']}\n")

    # 7. Append to starter_nouns_meta.csv
    print(
        f"Appending {len(new_nouns)} rows to {META_CSV_PATH.name}...",
        file=sys.stderr,
    )
    with open(META_CSV_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for noun in new_nouns:
            writer.writerow(
                [
                    noun["word"],
                    noun["short_translation"],
                    "",  # paradigm: auto-detected by build script
                    noun["difficulty"],
                    noun["categories"],
                ]
            )

    # 8. Print sample of added words
    print("\n  Sample of added nouns:", file=sys.stderr)
    for noun in new_nouns[:20]:
        print(
            f"    {noun['word']:20s} {noun['short_translation']:25s} "
            f"rank={noun['rank']:4d} {noun['difficulty']} {noun['categories']}",
            file=sys.stderr,
        )
    if len(new_nouns) > 20:
        print(f"    ... and {len(new_nouns) - 20} more", file=sys.stderr)

    print(
        f"\nDone! Added {len(new_nouns)} new nouns. "
        f"Now run: python3 scripts/build_word_bank_morphodita.py",
        file=sys.stderr,
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
