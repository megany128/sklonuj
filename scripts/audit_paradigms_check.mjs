#!/usr/bin/env node
/**
 * Audit every noun paradigm assignment in word_bank.json against stored declension forms.
 * Report-only — does NOT modify any files.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(
	readFileSync(resolve(__dirname, '../src/lib/data/word_bank.json'), 'utf-8')
);

// Czech vowels for consonant-ending detection
const vowels = new Set(['a', 'á', 'e', 'é', 'ě', 'i', 'í', 'o', 'ó', 'u', 'ú', 'ů', 'y', 'ý']);

function endsInConsonant(form) {
	if (!form) return false;
	return !vowels.has(form.at(-1).toLowerCase());
}

function endsWith(form, suffixes) {
	if (!form) return false;
	const f = form.toLowerCase();
	return suffixes.some((s) => f.endsWith(s));
}

// Paradigm → animate expectation
const animateParadigms = new Set(['pán', 'muž', 'předseda', 'soudce']);
const inanimateParadigms = new Set(['hrad', 'stroj']);

const mismatches = [];

for (const word of words) {
	const { lemma, paradigm, gender, animate, forms, variantForms } = word;
	const sg = forms?.sg || [];
	const pl = forms?.pl || [];
	const isPluraleTantum = sg.length === 0 || sg.every((f) => !f);

	// Indices: 0=nom, 1=gen, 2=dat, 3=acc, 4=voc, 5=loc, 6=instr
	const nomSg = sg[0] || '';
	const genSg = sg[1] || '';
	const locPl = pl[5] || '';
	const instrPl = pl[6] || '';

	// Collect all variant forms for a given case
	function allForms(number, idx) {
		const primary = forms?.[number]?.[idx] || '';
		const variants = variantForms?.[number]?.[String(idx)] || [];
		return [primary, ...variants].filter(Boolean);
	}

	const allGenSg = allForms('sg', 1);
	const allLocPl = allForms('pl', 5);
	const allInstrPl = allForms('pl', 6);
	const allNomSg = allForms('sg', 0);

	const issues = [];

	// ── Animate/inanimate consistency ──
	if (gender === 'm') {
		if (animate === true && inanimateParadigms.has(paradigm)) {
			issues.push(
				`animate=true but paradigm="${paradigm}" is inanimate (expected pán/muž/předseda/soudce)`
			);
		}
		if (animate === false && animateParadigms.has(paradigm)) {
			issues.push(`animate=false but paradigm="${paradigm}" is animate (expected hrad/stroj)`);
		}
	}

	// ── Paradigm-specific form checks ──
	if (!isPluraleTantum) {
		switch (paradigm) {
			case 'pán': {
				// gen sg should end in -a
				if (genSg && !allGenSg.some((f) => endsWith(f, ['a', 'á']))) {
					issues.push(`pán: gen sg "${genSg}" does not end in -a`);
				}
				// loc pl -ech (or -ách for some), instr pl -y
				if (locPl && !allLocPl.some((f) => endsWith(f, ['ech', 'ách']))) {
					issues.push(`pán: loc pl "${locPl}" does not end in -ech/-ách`);
				}
				if (instrPl && !allInstrPl.some((f) => endsWith(f, ['y', 'mi']))) {
					issues.push(`pán: instr pl "${instrPl}" does not end in -y/-mi`);
				}
				break;
			}
			case 'muž': {
				// gen sg should end in -e/-ě
				if (genSg && !allGenSg.some((f) => endsWith(f, ['e', 'ě']))) {
					issues.push(`muž: gen sg "${genSg}" does not end in -e/-ě`);
				}
				// loc pl -ích
				if (locPl && !allLocPl.some((f) => endsWith(f, ['ích']))) {
					issues.push(`muž: loc pl "${locPl}" does not end in -ích`);
				}
				// instr pl -i
				if (instrPl && !allInstrPl.some((f) => endsWith(f, ['i', 'mi']))) {
					issues.push(`muž: instr pl "${instrPl}" does not end in -i/-mi`);
				}
				break;
			}
			case 'hrad': {
				// gen sg should end in -u/-a
				if (genSg && !allGenSg.some((f) => endsWith(f, ['u', 'a', 'á']))) {
					issues.push(`hrad: gen sg "${genSg}" does not end in -u/-a`);
				}
				// loc pl -ech/-ách
				if (locPl && !allLocPl.some((f) => endsWith(f, ['ech', 'ách']))) {
					issues.push(`hrad: loc pl "${locPl}" does not end in -ech/-ách`);
				}
				// instr pl -y
				if (instrPl && !allInstrPl.some((f) => endsWith(f, ['y', 'mi']))) {
					issues.push(`hrad: instr pl "${instrPl}" does not end in -y/-mi`);
				}
				break;
			}
			case 'stroj': {
				// gen sg should end in -e/-ě
				if (genSg && !allGenSg.some((f) => endsWith(f, ['e', 'ě']))) {
					issues.push(`stroj: gen sg "${genSg}" does not end in -e/-ě`);
				}
				// loc pl -ích
				if (locPl && !allLocPl.some((f) => endsWith(f, ['ích']))) {
					issues.push(`stroj: loc pl "${locPl}" does not end in -ích`);
				}
				// instr pl -i
				if (instrPl && !allInstrPl.some((f) => endsWith(f, ['i', 'mi']))) {
					issues.push(`stroj: instr pl "${instrPl}" does not end in -i/-mi`);
				}
				break;
			}
			case 'předseda': {
				// nom sg should end in -a
				if (nomSg && !allNomSg.some((f) => endsWith(f, ['a']))) {
					issues.push(`předseda: nom sg "${nomSg}" does not end in -a`);
				}
				// gen sg should end in -y
				if (genSg && !allGenSg.some((f) => endsWith(f, ['y']))) {
					issues.push(`předseda: gen sg "${genSg}" does not end in -y`);
				}
				break;
			}
			case 'soudce': {
				// nom sg should equal gen sg (both end in -ce/-e)
				if (nomSg && genSg && !allNomSg.some((f) => allGenSg.includes(f))) {
					issues.push(`soudce: nom sg "${nomSg}" ≠ gen sg "${genSg}" (should be equal)`);
				}
				break;
			}
			case 'žena': {
				// nom sg -a, gen sg -y
				if (nomSg && !allNomSg.some((f) => endsWith(f, ['a']))) {
					issues.push(`žena: nom sg "${nomSg}" does not end in -a`);
				}
				if (genSg && !allGenSg.some((f) => endsWith(f, ['y']))) {
					issues.push(`žena: gen sg "${genSg}" does not end in -y`);
				}
				break;
			}
			case 'růže': {
				// nom sg should end in -e/-ě
				if (nomSg && !allNomSg.some((f) => endsWith(f, ['e', 'ě']))) {
					issues.push(`růže: nom sg "${nomSg}" does not end in -e/-ě`);
				}
				// gen sg should end in -e/-ě
				if (genSg && !allGenSg.some((f) => endsWith(f, ['e', 'ě']))) {
					issues.push(`růže: gen sg "${genSg}" does not end in -e/-ě`);
				}
				break;
			}
			case 'píseň': {
				// nom sg should end in consonant
				if (nomSg && !endsInConsonant(nomSg)) {
					issues.push(`píseň: nom sg "${nomSg}" does not end in a consonant`);
				}
				// gen sg should end in -ě/-e
				if (genSg && !allGenSg.some((f) => endsWith(f, ['e', 'ě']))) {
					issues.push(`píseň: gen sg "${genSg}" does not end in -ě/-e`);
				}
				break;
			}
			case 'kost': {
				// nom sg should end in consonant
				if (nomSg && !endsInConsonant(nomSg)) {
					issues.push(`kost: nom sg "${nomSg}" does not end in a consonant`);
				}
				// gen sg should end in -i
				if (genSg && !allGenSg.some((f) => endsWith(f, ['i']))) {
					issues.push(`kost: gen sg "${genSg}" does not end in -i`);
				}
				break;
			}
			case 'město': {
				// nom sg should end in -o/-um/-éma/-ma
				if (nomSg && !allNomSg.some((f) => endsWith(f, ['o', 'um', 'éma', 'ma']))) {
					issues.push(`město: nom sg "${nomSg}" does not end in -o/-um/-éma/-ma`);
				}
				break;
			}
			case 'moře': {
				// nom sg should end in -e
				if (nomSg && !allNomSg.some((f) => endsWith(f, ['e', 'ě']))) {
					issues.push(`moře: nom sg "${nomSg}" does not end in -e/-ě`);
				}
				break;
			}
			case 'kuře': {
				// gen sg should end in -ete/-ěte
				if (genSg && !allGenSg.some((f) => endsWith(f, ['ete', 'ěte']))) {
					issues.push(`kuře: gen sg "${genSg}" does not end in -ete/-ěte`);
				}
				break;
			}
			case 'stavení': {
				// nom sg should end in -í
				if (nomSg && !allNomSg.some((f) => endsWith(f, ['í']))) {
					issues.push(`stavení: nom sg "${nomSg}" does not end in -í`);
				}
				break;
			}
			default:
				issues.push(`unknown paradigm "${paradigm}"`);
		}
	} else {
		// Pluralia tantum — check pl forms only where applicable
		switch (paradigm) {
			case 'pán':
			case 'hrad': {
				if (locPl && !allLocPl.some((f) => endsWith(f, ['ech', 'ách']))) {
					issues.push(`${paradigm} (pl. tantum): loc pl "${locPl}" does not end in -ech/-ách`);
				}
				if (instrPl && !allInstrPl.some((f) => endsWith(f, ['y', 'mi']))) {
					issues.push(`${paradigm} (pl. tantum): instr pl "${instrPl}" does not end in -y/-mi`);
				}
				break;
			}
			case 'muž':
			case 'stroj': {
				if (locPl && !allLocPl.some((f) => endsWith(f, ['ích']))) {
					issues.push(`${paradigm} (pl. tantum): loc pl "${locPl}" does not end in -ích`);
				}
				if (instrPl && !allInstrPl.some((f) => endsWith(f, ['i', 'mi']))) {
					issues.push(`${paradigm} (pl. tantum): instr pl "${instrPl}" does not end in -i/-mi`);
				}
				break;
			}
			// For other paradigms with pl tantum, skip sg-only checks
		}
	}

	if (issues.length > 0) {
		mismatches.push({
			lemma,
			paradigm,
			gender,
			animate,
			nomSg,
			genSg,
			locPl,
			instrPl,
			issues
		});
	}
}

// ── Summary ──
console.log('='.repeat(80));
console.log('PARADIGM AUDIT REPORT');
console.log('='.repeat(80));
console.log(`Total words checked: ${words.length}`);
console.log(`Total mismatches: ${mismatches.length}`);
console.log('='.repeat(80));

if (mismatches.length > 0) {
	// Group by paradigm
	const byParadigm = {};
	for (const m of mismatches) {
		const key = m.paradigm;
		if (!byParadigm[key]) byParadigm[key] = [];
		byParadigm[key].push(m);
	}

	for (const [paradigm, items] of Object.entries(byParadigm).sort()) {
		console.log(`\n── Paradigm: ${paradigm} (${items.length} mismatches) ──`);
		for (const item of items) {
			console.log(
				`  ${item.lemma} [${item.gender}, animate=${item.animate}] nom="${item.nomSg}" gen="${item.genSg}" locPl="${item.locPl}" instrPl="${item.instrPl}"`
			);
			for (const issue of item.issues) {
				console.log(`    ⚠ ${issue}`);
			}
		}
	}
} else {
	console.log('\n✅ All paradigm assignments are consistent with stored forms.');
}
