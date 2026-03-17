#!/usr/bin/env python3
import json
import sys

# Read the word bank JSON file
with open('/Users/meganyap/Desktop/projects.nosync/sklonuj/src/lib/data/word_bank.json', 'r', encoding='utf-8') as f:
    words = json.load(f)

# Extract all A1 words
a1_words = [w for w in words if w.get('difficulty') == 'A1']

print(f"Total A1 words found: {len(a1_words)}\n")
print("=" * 80)
print("ALL A1 WORDS:\n")

for word in a1_words:
    lemma = word.get('lemma', '')
    translation = word.get('translation', '')
    categories = word.get('categories', [])
    print(f"{lemma:20s} → {translation:25s} [{', '.join(categories)}]")
