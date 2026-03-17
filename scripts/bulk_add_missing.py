#!/usr/bin/env python3
"""Bulk-generate word bank entries for missing KzK chapter words."""

import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(BASE, "src/lib/data/word_bank.json")) as f:
    wb = json.load(f)
with open(os.path.join(BASE, "src/lib/data/dictionary.json")) as f:
    dictionary = json.load(f)
with open(os.path.join(BASE, "src/lib/data/kzk_chapters.json")) as f:
    chapters = json.load(f)
with open("/tmp/missing_words.json") as f:
    missing = json.load(f)

wb_lemmas = {w["lemma"] for w in wb}
dict_by_lemma = {entry[0]: entry for entry in dictionary}

# Gender/paradigm mapping from dictionary notes
def parse_paradigm_note(note, lemma):
    note_lower = note.lower()
    gender = "m"
    animate = False
    paradigm = "hrad"

    if "feminine" in note_lower:
        gender = "f"
        if "-a stem" in note_lower or "hard feminine" in note_lower:
            paradigm = "žena"
        elif "-e stem" in note_lower or "soft feminine" in note_lower:
            paradigm = "růže"
        elif "-ost" in note_lower or lemma.endswith("ost"):
            paradigm = "kost"
        elif "consonant" in note_lower:
            paradigm = "píseň"
        else:
            # Guess from ending
            if lemma.endswith("a"):
                paradigm = "žena"
            elif lemma.endswith("e") or lemma.endswith("ě"):
                paradigm = "růže"
            elif lemma.endswith("ost"):
                paradigm = "kost"
            else:
                paradigm = "kost"
    elif "neuter" in note_lower:
        gender = "n"
        if "-o stem" in note_lower or "hard neuter" in note_lower:
            paradigm = "město"
        elif "-e stem" in note_lower or "soft neuter" in note_lower:
            paradigm = "moře"
        elif "-í stem" in note_lower or lemma.endswith("í"):
            paradigm = "stavení"
        else:
            if lemma.endswith("o"):
                paradigm = "město"
            elif lemma.endswith("e") or lemma.endswith("ě"):
                paradigm = "moře"
            elif lemma.endswith("í"):
                paradigm = "stavení"
            else:
                paradigm = "město"
    elif "masculine" in note_lower:
        gender = "m"
        if "animate" in note_lower and "inanimate" not in note_lower:
            animate = True
            if "soft" in note_lower:
                paradigm = "muž"
            elif "předseda" in note_lower or lemma.endswith("a"):
                paradigm = "předseda"
            else:
                paradigm = "pán"
        else:
            # Inanimate
            if "soft" in note_lower:
                paradigm = "stroj"
            else:
                paradigm = "hrad"

    return gender, animate, paradigm


# Category assignment based on meaning and chapter context
CATEGORY_KEYWORDS = {
    "food": ["food", "fruit", "vegetable", "meat", "cheese", "bread", "cake", "soup",
             "sauce", "cream", "butter", "sugar", "salt", "pepper", "spice", "drink",
             "beer", "wine", "tea", "coffee", "juice", "water", "milk", "yogurt",
             "ice cream", "chocolate", "banana", "lemon", "cucumber", "onion",
             "mushroom", "rice", "pasta", "spaghetti", "ham", "sausage", "salami",
             "dumpling", "roll", "fries", "steak", "schnitzel", "dessert", "pastry",
             "honey", "jam", "ketchup", "mustard", "mayonnaise", "vinegar", "garlic",
             "horseradish", "spinach", "lentil", "curd", "bacon", "leek", "cherry",
             "strawberry", "peach", "currant", "salmon", "carp", "tuna", "cabbage",
             "celery", "broccoli", "lettuce", "tomato", "potato", "carrot",
             "cola", "lemonade", "cocoa", "mineral water", "fanta"],
    "animals": ["animal", "dog", "cat", "horse", "cow", "bird", "fish", "snake",
                "spider", "whale", "crocodile", "hedgehog", "hamster", "bee",
                "owl", "lark", "dragon", "bat", "wolf", "bear", "poodle",
                "snout", "muzzle", "tail"],
    "body": ["body", "head", "hand", "foot", "leg", "arm", "eye", "ear", "nose",
             "mouth", "tooth", "hair", "skin", "bone", "blood", "heart", "stomach",
             "back", "face", "neck", "finger", "knee", "shoulder", "chest", "belly",
             "lip", "chin", "forehead", "cheek", "elbow", "wrist", "ankle",
             "illness", "disease", "pain", "fever", "flu", "cold", "cough",
             "allergy", "migraine", "bronchitis", "virus", "ambulance", "pharmacy",
             "vitamin", "medicine", "clinic", "surgery", "doctor", "patient",
             "health", "massage"],
    "family": ["mother", "father", "parent", "sister", "brother", "daughter", "son",
               "grandmother", "grandfather", "uncle", "aunt", "cousin", "nephew",
               "niece", "grandchild", "wife", "husband", "partner", "sibling",
               "in-law", "sister-in-law", "brother-in-law", "father-in-law",
               "mother-in-law"],
    "people": ["person", "man", "woman", "child", "boy", "girl", "friend",
               "neighbor", "stranger", "foreigner", "tourist", "guest", "visitor",
               "millionaire", "optimist", "pessimist", "vegetarian", "celebrity",
               "pirate", "prince", "vampire", "maniac", "realist", "cyclist",
               "homeless", "teenager", "non-smoker", "punk", "comedian"],
    "profession": ["doctor", "teacher", "professor", "engineer", "lawyer", "nurse",
                   "chef", "cook", "driver", "pilot", "musician", "singer", "actor",
                   "actress", "writer", "journalist", "designer", "photographer",
                   "manager", "director", "president", "minister", "secretary",
                   "assistant", "student", "worker", "firefighter", "police",
                   "translator", "scriptwriter", "essayist", "publicist",
                   "entrepreneur", "employer", "founder", "ecologist",
                   "moderator", "client", "customer", "hairdresser", "masseur",
                   "cleaner", "skier", "mountaineer", "castellan", "technician",
                   "guitarist", "film"],
    "places": ["house", "room", "kitchen", "bathroom", "office", "school",
               "hospital", "shop", "store", "restaurant", "cafe", "bar", "hotel",
               "church", "castle", "museum", "theatre", "cinema", "library",
               "station", "airport", "park", "garden", "street", "square",
               "bridge", "market", "pharmacy", "bakery", "pastry", "salon",
               "gym", "pool", "embassy", "fountain", "cathedral", "buffet",
               "exchange", "drugstore", "tea house"],
    "objects": ["table", "chair", "door", "window", "bed", "lamp", "mirror",
                "cup", "glass", "plate", "knife", "fork", "spoon", "bag",
                "key", "phone", "computer", "book", "pen", "pencil", "paper",
                "box", "bottle", "watch", "clock", "umbrella", "napkin",
                "washing machine", "perfume", "cosmetics", "soap", "shampoo",
                "ink", "cutlery", "rocket", "electronics", "can", "suitcase",
                "ball", "stone", "pebble", "bead", "ornament", "nut",
                "little tree", "candle", "tie"],
    "nature": ["tree", "flower", "mountain", "river", "lake", "sea", "forest",
               "field", "garden", "sun", "moon", "star", "rain", "snow", "wind",
               "storm", "cloud", "rock", "island", "volcano", "jungle", "swamp",
               "ice", "weather", "frost", "explosion", "full moon"],
    "transportation": ["car", "bus", "train", "plane", "boat", "bicycle", "taxi",
                       "tram", "metro", "ticket", "flight", "departure", "arrival",
                       "stop", "transfer", "gas", "motorway", "traffic light",
                       "luggage", "travel", "journey"],
    "time": ["day", "week", "month", "year", "hour", "minute", "morning",
             "evening", "night", "monday", "today", "tomorrow", "season",
             "spring", "summer", "autumn", "winter", "holiday", "christmas",
             "easter", "nicholas", "valentine"],
    "abstract": ["love", "hate", "fear", "joy", "sadness", "anger", "hope",
                 "freedom", "truth", "lie", "idea", "thought", "opinion",
                 "problem", "solution", "reason", "cause", "result", "effect",
                 "culture", "science", "art", "music", "sport", "game",
                 "competition", "career", "diet", "depression", "intuition",
                 "smoking", "doctorate", "lesson", "course", "meeting",
                 "consultation", "prejudice", "argument", "quarrel"],
    "readable": ["book", "newspaper", "magazine", "letter", "email", "message",
                 "document", "article", "text", "subtitle", "passage", "extract",
                 "verse", "poem"],
    "event": ["party", "wedding", "concert", "festival", "match", "race",
              "exhibition", "conference", "ceremony"],
    "meal": ["breakfast", "lunch", "dinner", "snack", "appetizer", "dessert",
             "main course", "portion"],
}

CHAPTER_CATEGORY_HINTS = {
    "Food and drink": ["food"],
    "People around you": ["people", "family"],
    "Daily routine": ["time", "misc"],
    "Orienting yourself": ["places", "transportation"],
    "In a restaurant": ["food", "meal"],
    "Famous people": ["people", "profession"],
    "Byt a dům": ["objects", "places"],
    "Free time": ["misc", "event"],
    "The human body": ["body"],
    "Traveling": ["transportation", "places"],
    "Cooking": ["food", "objects"],
    "Home chores": ["objects", "misc"],
    "Asking for directions": ["places", "transportation"],
    "Biography": ["people", "profession", "time"],
    "What would happen if...": ["misc"],
    "Weather": ["nature"],
    "Communication": ["misc", "readable"],
    "Clothes": ["objects", "misc"],
    "Relationships": ["people", "family"],
}


def categorize_word(lemma, translation, chapter_subtitle):
    trans_lower = translation.lower()
    cats = set()

    # Keyword matching
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in trans_lower:
                cats.add(cat)
                break

    # Chapter subtitle hints
    if chapter_subtitle in CHAPTER_CATEGORY_HINTS:
        hints = CHAPTER_CATEGORY_HINTS[chapter_subtitle]
        if not cats:
            cats.update(hints)

    # Profession detection: feminine forms ending in -ka/-čka/-kyně
    if any(lemma.endswith(s) for s in ("ka", "čka", "kyně", "ářka")):
        if "female" in trans_lower or "woman" in trans_lower:
            cats.add("profession")
            cats.add("people")

    # Person suffixes
    if any(lemma.endswith(s) for s in ("ista", "istka", "ář", "ér", "ík", "ec", "ač", "ič")):
        cats.add("people")

    if not cats:
        cats.add("misc")

    return sorted(cats)


# Build chapter info for difficulty assignment
chapter_info = {}
for book in ["kzk1", "kzk2"]:
    for ch in chapters[book]["chapters"]:
        for lemma in ch["coreLemmas"]:
            for part in lemma.split("/"):
                part = part.strip()
                if part not in chapter_info:
                    chapter_info[part] = {
                        "book": book,
                        "chapter": ch["id"],
                        "subtitle": ch.get("subtitle", ""),
                    }


# Generate entries
new_entries = []
skipped = []

for item in missing:
    lemma = item["lemma"]
    if lemma in wb_lemmas:
        continue

    ch_info = chapter_info.get(lemma, {"book": "kzk1", "subtitle": ""})
    difficulty = "A1" if ch_info["book"] == "kzk1" else "A2"
    subtitle = ch_info.get("subtitle", "")

    if lemma in dict_by_lemma:
        entry = dict_by_lemma[lemma]
        translation = entry[1]
        # Truncate long translations
        if len(translation) > 60:
            # Take first meaning before comma or parenthetical
            for sep in [",", "(", ";"]:
                if sep in translation:
                    translation = translation[:translation.index(sep)].strip()
                    break
            if len(translation) > 60:
                translation = translation[:57] + "..."

        sg_forms = entry[2]
        pl_forms = entry[3]
        note = entry[4] if len(entry) > 4 else ""

        gender, animate, paradigm = parse_paradigm_note(note, lemma)

        # People/profession words are animate
        if any(lemma.endswith(s) for s in ("ista", "istka", "ář", "ářka", "ér", "érka",
                                            "ík", "ice", "ec", "ač", "ič", "tel", "telka",
                                            "čka", "kyně", "án")):
            trans_lower = translation.lower()
            if any(w in trans_lower for w in ("person", "man", "woman", "female", "male",
                                               "er", "ist", "or", "ant", "ent")):
                animate = True

        categories = categorize_word(lemma, translation, subtitle)

        new_entries.append({
            "lemma": lemma,
            "translation": translation,
            "gender": gender,
            "animate": animate,
            "paradigm": paradigm,
            "difficulty": difficulty,
            "categories": categories,
            "forms": {
                "sg": sg_forms,
                "pl": pl_forms,
            },
        })
    else:
        # Not in dictionary - try to generate
        # Feminine profession forms ending in -ka
        if lemma.endswith("ka") and len(lemma) > 3:
            # Try to find masculine form
            masc = None
            for suffix_f, suffix_m in [("čka", "k"), ("čka", "č"), ("ka", ""), ("ka", "k"),
                                        ("ářka", "ář"), ("érka", "ér")]:
                if lemma.endswith(suffix_f):
                    candidate = lemma[:-len(suffix_f)] + suffix_m
                    if candidate in dict_by_lemma or candidate in wb_lemmas:
                        masc = candidate
                        break

            # Use žena paradigm for -ka endings
            translation = f"female {masc}" if masc else lemma
            # Try to get translation from masculine form
            if masc and masc in dict_by_lemma:
                masc_trans = dict_by_lemma[masc][1]
                if len(masc_trans) > 40:
                    for sep in [",", "(", ";"]:
                        if sep in masc_trans:
                            masc_trans = masc_trans[:masc_trans.index(sep)].strip()
                            break
                translation = f"female {masc_trans}"
            elif masc and masc in wb_lemmas:
                for w in wb:
                    if w["lemma"] == masc:
                        translation = f"female {w['translation']}"
                        break

            # Generate žena paradigm forms
            stem = lemma[:-1]  # Remove 'a'
            sg = [lemma, f"{stem}y", f"{stem}e", f"{stem}u", f"{stem}o", f"{stem}e", f"{stem}ou"]
            # Handle palatal stems
            if stem.endswith(("č", "ž", "š", "ř", "c", "j", "ň", "ď", "ť")):
                sg[2] = f"{stem}e"
                sg[5] = f"{stem}e"
            else:
                sg[2] = f"{stem}e"  # dat - may need ě
                sg[5] = f"{stem}e"  # loc - may need ě
            pl = [f"{stem}y", f"{stem}", f"{stem}ám", f"{stem}y", f"{stem}y", f"{stem}ách", f"{stem}ami"]

            categories = categorize_word(lemma, translation, subtitle)
            if "profession" not in categories:
                categories.append("profession")
            if "people" not in categories:
                categories.append("people")
            categories = sorted(set(categories))

            new_entries.append({
                "lemma": lemma,
                "translation": translation,
                "gender": "f",
                "animate": True,
                "paradigm": "žena",
                "difficulty": difficulty,
                "categories": categories,
                "forms": {"sg": sg, "pl": pl},
            })

        elif lemma.endswith("kyně"):
            stem = lemma[:-1]  # Remove trailing e for růže pattern
            translation = f"female {lemma[:-4]}k" if len(lemma) > 4 else lemma
            # Check masculine
            masc_candidate = lemma[:-4] + "ec"
            if masc_candidate in dict_by_lemma:
                masc_trans = dict_by_lemma[masc_candidate][1]
                if len(masc_trans) > 40:
                    for sep in [",", "("]:
                        if sep in masc_trans:
                            masc_trans = masc_trans[:masc_trans.index(sep)].strip()
                            break
                translation = f"female {masc_trans}"

            sg = [lemma, lemma, f"{stem}i", f"{stem}i", lemma, f"{stem}i", f"{stem}í"]
            pl = [lemma, f"{stem}í", f"{stem}ím", lemma, lemma, f"{stem}ích", f"{stem}ěmi"]

            categories = ["people", "profession"]
            new_entries.append({
                "lemma": lemma,
                "translation": translation,
                "gender": "f",
                "animate": True,
                "paradigm": "růže",
                "difficulty": difficulty,
                "categories": sorted(categories),
                "forms": {"sg": sg, "pl": pl},
            })

        # Words ending in common patterns
        elif lemma.endswith("ář"):
            # Masculine animate, muž paradigm
            stem = lemma
            translation = lemma  # Will be generic
            sg = [lemma, f"{stem}e", f"{stem}i", f"{stem}e", f"{stem}i", f"{stem}i", f"{stem}em"]
            pl = [f"{stem}i", f"{stem}ů", f"{stem}ům", f"{stem}e", f"{stem}i", f"{stem}ích", f"{stem}i"]

            # Check if we have a known translation from kzk extraction files
            categories = ["people", "profession"]
            new_entries.append({
                "lemma": lemma,
                "translation": translation,
                "gender": "m",
                "animate": True,
                "paradigm": "muž",
                "difficulty": difficulty,
                "categories": sorted(categories),
                "forms": {"sg": sg, "pl": pl},
            })

        elif lemma.endswith("ér"):
            stem = lemma
            sg = [lemma, f"{stem}a", f"{stem}ovi", f"{stem}a", f"{stem}e", f"{stem}ovi", f"{stem}em"]
            pl = [f"{stem}i", f"{stem}ů", f"{stem}ům", f"{stem}y", f"{stem}i", f"{stem}ech", f"{stem}y"]

            categories = ["people", "profession"]
            new_entries.append({
                "lemma": lemma,
                "translation": lemma,
                "gender": "m",
                "animate": True,
                "paradigm": "pán",
                "difficulty": difficulty,
                "categories": sorted(categories),
                "forms": {"sg": sg, "pl": pl},
            })

        elif lemma.endswith("ista"):
            # předseda paradigm
            stem = lemma[:-1]
            sg = [lemma, f"{stem}y", f"{stem}ovi", f"{stem}u", f"{stem}o", f"{stem}ovi", f"{stem}ou"]
            pl = [f"{stem}é", f"{stem}ů", f"{stem}ům", f"{stem}y", f"{stem}é", f"{stem}ech", f"{stem}y"]

            categories = ["people", "profession"]
            new_entries.append({
                "lemma": lemma,
                "translation": lemma,
                "gender": "m",
                "animate": True,
                "paradigm": "předseda",
                "difficulty": difficulty,
                "categories": sorted(categories),
                "forms": {"sg": sg, "pl": pl},
            })

        elif lemma.endswith("ání") or lemma.endswith("ení") or lemma.endswith("ování"):
            # Verbal noun, stavení paradigm
            sg = [lemma, lemma, lemma, lemma, lemma, lemma, f"{lemma}m"]
            pl = [lemma, lemma, f"{lemma}m", lemma, lemma, f"{lemma}ch", f"{lemma}mi"]

            categories = categorize_word(lemma, lemma, subtitle)
            new_entries.append({
                "lemma": lemma,
                "translation": lemma,
                "gender": "n",
                "animate": False,
                "paradigm": "stavení",
                "difficulty": difficulty,
                "categories": categories,
                "forms": {"sg": sg, "pl": pl},
            })

        else:
            skipped.append((lemma, "no dictionary entry, no pattern match"))
            continue

# Now improve translations for entries where we used lemma as placeholder
# Check kzk extraction files for translations
kzk1_trans = {}
kzk2_trans = {}
with open(os.path.join(BASE, "scripts/kzk1_nouns.json")) as f:
    kzk1_data = json.load(f)
for n in kzk1_data.get("nouns", []):
    for part in n["lemma"].split("/"):
        part = part.strip()
        trans = n.get("translation", "")
        # Clean corrupted translations
        if len(trans) < 50 and not any(c in trans for c in "áčďéěíňóřšťúůýž"):
            kzk1_trans[part] = trans

with open(os.path.join(BASE, "scripts/kzk2_nouns.json")) as f:
    kzk2_data = json.load(f)
kzk2_list = kzk2_data if isinstance(kzk2_data, list) else kzk2_data.get("nouns", [])
for n in kzk2_list:
    for part in n["lemma"].split("/"):
        part = part.strip()
        trans = n.get("translation", "")
        if len(trans) < 50 and not any(c in trans for c in "áčďéěíňóřšťúůýž"):
            kzk2_trans[part] = trans

# Update placeholder translations
for entry in new_entries:
    if entry["translation"] == entry["lemma"] or entry["translation"].startswith("female "):
        if entry["lemma"] in kzk1_trans:
            if not entry["translation"].startswith("female "):
                entry["translation"] = kzk1_trans[entry["lemma"]]
        elif entry["lemma"] in kzk2_trans:
            if not entry["translation"].startswith("female "):
                entry["translation"] = kzk2_trans[entry["lemma"]]

# Manual translations for common words we know
MANUAL_TRANSLATIONS = {
    "e-mail": "email",
    "fanta": "Fanta (soda)",
    "benzin": "gasoline",
    "konzultace": "consultation",
    "telenovela": "soap opera",
    "vitamin": "vitamin",
    "ústa": "mouth",
    "stravování": "catering",
    "verše": "verses",
    "prince": "prince",
    "přilet": "arrival (by air)",
    "přijezd": "arrival",
    "bufet": "buffet",
    "taxislužba": "taxi service",
    "balon": "balloon",
    "biliár": "billiards",
    "karamel": "caramel",
    "salón": "salon",
    "šampon": "shampoo",
    "letání": "flying",
    "mikuláš": "Saint Nicholas",
    "korálek": "bead",
    "filmář": "filmmaker",
    "filmářka": "female filmmaker",
    "návrhářka": "female designer",
    "esejistka": "female essayist",
    "představitelka": "female representative",
    "scénáristka": "female scriptwriter",
    "textář": "lyricist",
    "puberťačka": "teenage girl",
    "nekuřáčka": "female non-smoker",
    "maniačka": "female maniac",
    "realistka": "female realist",
    "klientka": "female client",
    "technička": "female technician",
    "punker": "punk",
    "punkerka": "female punk",
    "komik": "comedian",
    "komička": "female comedian",
    "pórek": "leek",
    "sáček": "small bag",
}

for entry in new_entries:
    if entry["lemma"] in MANUAL_TRANSLATIONS:
        entry["translation"] = MANUAL_TRANSLATIONS[entry["lemma"]]

# Final cleanup: truncate long translations
for entry in new_entries:
    if len(entry["translation"]) > 60:
        for sep in [",", "(", ";"]:
            if sep in entry["translation"]:
                entry["translation"] = entry["translation"][:entry["translation"].index(sep)].strip()
                break

# Skip indeclinables
SKIP = {"fanta", "e-mail"}
new_entries = [e for e in new_entries if e["lemma"] not in SKIP]
skipped.append(("fanta", "brand name, indeclinable"))
skipped.append(("e-mail", "indeclinable loan word"))

# Append to word bank
wb.extend(new_entries)

with open(os.path.join(BASE, "src/lib/data/word_bank.json"), "w") as f:
    json.dump(wb, f, ensure_ascii=False, indent="\t")
    f.write("\n")

# Validate
json.load(open(os.path.join(BASE, "src/lib/data/word_bank.json")))

print(f"Added {len(new_entries)} entries to word_bank.json")
print(f"Skipped {len(skipped)} entries:")
for lemma, reason in skipped:
    print(f"  {lemma}: {reason}")
print(f"Total word bank size: {len(wb)}")
