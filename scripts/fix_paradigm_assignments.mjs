#!/usr/bin/env node
/**
 * Fix paradigm assignments for feminine nouns ending in soft consonants.
 *
 * Rule: if genitive singular ends in -i  → kost paradigm
 *       if genitive singular ends in -e/-ě → píseň paradigm
 *
 * forms.sg[1] is the genitive singular (case order: nom, gen, dat, acc, voc, loc, ins).
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORD_BANK_PATH = resolve(__dirname, '../src/lib/data/word_bank.json');

const words = JSON.parse(readFileSync(WORD_BANK_PATH, 'utf-8'));

let changed = 0;
let kept = 0;

for (const word of words) {
	if (word.gender !== 'f') continue;
	if (word.paradigm !== 'kost' && word.paradigm !== 'píseň') continue;

	const genSg = word.forms?.sg?.[1];
	if (!genSg) continue;

	const endsInI = genSg.endsWith('i');
	const endsInEOrE = genSg.endsWith('e') || genSg.endsWith('ě');

	if (word.paradigm === 'píseň' && endsInI) {
		console.log(`CHANGE: "${word.lemma}" (gen sg "${genSg}") píseň → kost`);
		word.paradigm = 'kost';
		changed++;
	} else if (word.paradigm === 'kost' && endsInEOrE) {
		console.log(`CHANGE: "${word.lemma}" (gen sg "${genSg}") kost → píseň`);
		word.paradigm = 'píseň';
		changed++;
	} else {
		kept++;
	}
}

console.log(`\nSummary: ${changed} words changed, ${kept} words kept as-is.`);

writeFileSync(WORD_BANK_PATH, JSON.stringify(words, null, '\t') + '\n', 'utf-8');
console.log('word_bank.json updated.');
