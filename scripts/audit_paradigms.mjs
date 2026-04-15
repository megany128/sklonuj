import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wordBank = JSON.parse(
	readFileSync(join(__dirname, '../src/lib/data/word_bank.json'), 'utf-8')
);

const MASCULINE_ANIMATE_PARADIGMS = ['pán', 'muž', 'předseda', 'soudce'];
const MASCULINE_INANIMATE_PARADIGMS = ['hrad', 'stroj'];

const mismatches = [];

function endsWith(form, suffixes) {
	if (!form) return false;
	return suffixes.some((s) => form.endsWith(s));
}

function isConsonantEnding(form) {
	if (!form) return false;
	const vowels = ['a', 'á', 'e', 'é', 'ě', 'i', 'í', 'o', 'ó', 'u', 'ú', 'ů', 'y', 'ý'];
	return !vowels.includes(form[form.length - 1]);
}

function addMismatch(lemma, paradigm, reason) {
	mismatches.push({ lemma, paradigm, reason });
}

for (const word of wordBank) {
	const { lemma, paradigm, gender, animate } = word;
	const sg = word.forms?.sg || [];
	const pl = word.forms?.pl || [];

	const nomSg = sg[0] || '';
	const genSg = sg[1] || '';
	const locPl = pl[5] || '';
	const instrPl = pl[6] || '';

	const isPluraleTantum = sg.length === 0 || sg.every((f) => !f || f === '');
	const hasSgForms = !isPluraleTantum && nomSg;
	const hasPlForms = pl.length > 0 && pl.some((f) => f && f !== '');

	// Animate/inanimate consistency check
	if (gender === 'm') {
		if (animate === true && MASCULINE_INANIMATE_PARADIGMS.includes(paradigm)) {
			addMismatch(lemma, paradigm, `Animate=true but paradigm "${paradigm}" is inanimate`);
		}
		if (animate === false && MASCULINE_ANIMATE_PARADIGMS.includes(paradigm)) {
			addMismatch(lemma, paradigm, `Animate=false but paradigm "${paradigm}" is animate`);
		}
	}

	// Paradigm-specific form checks
	switch (paradigm) {
		case 'pán': {
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['a', 'á'])) {
					addMismatch(lemma, paradigm, `Gen sg "${genSg}" does not end in -a (expected for pán)`);
				}
			}
			if (hasPlForms && locPl) {
				if (!endsWith(locPl, ['ech', 'ách'])) {
					addMismatch(
						lemma,
						paradigm,
						`Loc pl "${locPl}" does not end in -ech/-ách (expected for pán)`
					);
				}
			}
			if (hasPlForms && instrPl) {
				if (!endsWith(instrPl, ['y', 'mi'])) {
					addMismatch(
						lemma,
						paradigm,
						`Instr pl "${instrPl}" does not end in -y/-mi (expected for pán)`
					);
				}
			}
			break;
		}

		case 'muž': {
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['e', 'ě'])) {
					addMismatch(
						lemma,
						paradigm,
						`Gen sg "${genSg}" does not end in -e/-ě (expected for muž)`
					);
				}
			}
			if (hasPlForms && locPl) {
				if (!endsWith(locPl, ['ích'])) {
					addMismatch(lemma, paradigm, `Loc pl "${locPl}" does not end in -ích (expected for muž)`);
				}
			}
			if (hasPlForms && instrPl) {
				if (!endsWith(instrPl, ['i', 'mi'])) {
					addMismatch(
						lemma,
						paradigm,
						`Instr pl "${instrPl}" does not end in -i/-mi (expected for muž)`
					);
				}
			}
			break;
		}

		case 'hrad': {
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['u', 'a', 'á'])) {
					addMismatch(
						lemma,
						paradigm,
						`Gen sg "${genSg}" does not end in -u/-a (expected for hrad)`
					);
				}
			}
			if (hasPlForms && locPl) {
				if (!endsWith(locPl, ['ech', 'ách'])) {
					addMismatch(
						lemma,
						paradigm,
						`Loc pl "${locPl}" does not end in -ech/-ách (expected for hrad)`
					);
				}
			}
			if (hasPlForms && instrPl) {
				if (!endsWith(instrPl, ['y', 'mi'])) {
					addMismatch(
						lemma,
						paradigm,
						`Instr pl "${instrPl}" does not end in -y/-mi (expected for hrad)`
					);
				}
			}
			break;
		}

		case 'stroj': {
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['e', 'ě'])) {
					addMismatch(
						lemma,
						paradigm,
						`Gen sg "${genSg}" does not end in -e/-ě (expected for stroj)`
					);
				}
			}
			if (hasPlForms && locPl) {
				if (!endsWith(locPl, ['ích'])) {
					addMismatch(
						lemma,
						paradigm,
						`Loc pl "${locPl}" does not end in -ích (expected for stroj)`
					);
				}
			}
			if (hasPlForms && instrPl) {
				if (!endsWith(instrPl, ['i', 'mi'])) {
					addMismatch(
						lemma,
						paradigm,
						`Instr pl "${instrPl}" does not end in -i/-mi (expected for stroj)`
					);
				}
			}
			break;
		}

		case 'předseda': {
			if (hasSgForms && nomSg) {
				if (!endsWith(nomSg, ['a'])) {
					addMismatch(
						lemma,
						paradigm,
						`Nom sg "${nomSg}" does not end in -a (expected for předseda)`
					);
				}
			}
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['y'])) {
					addMismatch(
						lemma,
						paradigm,
						`Gen sg "${genSg}" does not end in -y (expected for předseda)`
					);
				}
			}
			break;
		}

		case 'soudce': {
			if (hasSgForms && nomSg && genSg) {
				if (nomSg !== genSg) {
					addMismatch(
						lemma,
						paradigm,
						`Nom sg "${nomSg}" != gen sg "${genSg}" (expected equal for soudce)`
					);
				}
			}
			break;
		}

		case 'žena': {
			if (hasSgForms && nomSg) {
				if (!endsWith(nomSg, ['a'])) {
					addMismatch(lemma, paradigm, `Nom sg "${nomSg}" does not end in -a (expected for žena)`);
				}
			}
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['y'])) {
					addMismatch(lemma, paradigm, `Gen sg "${genSg}" does not end in -y (expected for žena)`);
				}
			}
			break;
		}

		case 'růže': {
			if (hasSgForms && nomSg) {
				if (!endsWith(nomSg, ['e', 'ě'])) {
					addMismatch(
						lemma,
						paradigm,
						`Nom sg "${nomSg}" does not end in -e/-ě (expected for růže)`
					);
				}
			}
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['e', 'ě'])) {
					addMismatch(
						lemma,
						paradigm,
						`Gen sg "${genSg}" does not end in -e/-ě (expected for růže)`
					);
				}
			}
			break;
		}

		case 'píseň': {
			if (hasSgForms && nomSg) {
				if (!isConsonantEnding(nomSg)) {
					addMismatch(
						lemma,
						paradigm,
						`Nom sg "${nomSg}" does not end in a consonant (expected for píseň)`
					);
				}
			}
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['e', 'ě'])) {
					addMismatch(
						lemma,
						paradigm,
						`Gen sg "${genSg}" does not end in -ě/-e (expected for píseň)`
					);
				}
			}
			break;
		}

		case 'kost': {
			if (hasSgForms && nomSg) {
				if (!isConsonantEnding(nomSg)) {
					addMismatch(
						lemma,
						paradigm,
						`Nom sg "${nomSg}" does not end in a consonant (expected for kost)`
					);
				}
			}
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['i'])) {
					addMismatch(lemma, paradigm, `Gen sg "${genSg}" does not end in -i (expected for kost)`);
				}
			}
			break;
		}

		case 'město': {
			if (hasSgForms && nomSg) {
				if (!endsWith(nomSg, ['o', 'um', 'éma', 'ma'])) {
					addMismatch(
						lemma,
						paradigm,
						`Nom sg "${nomSg}" does not end in -o/-um/-éma/-ma (expected for město)`
					);
				}
			}
			break;
		}

		case 'moře': {
			if (hasSgForms && nomSg) {
				if (!endsWith(nomSg, ['e', 'ě'])) {
					addMismatch(lemma, paradigm, `Nom sg "${nomSg}" does not end in -e (expected for moře)`);
				}
			}
			break;
		}

		case 'kuře': {
			if (hasSgForms && genSg) {
				if (!endsWith(genSg, ['ete', 'ěte'])) {
					addMismatch(
						lemma,
						paradigm,
						`Gen sg "${genSg}" does not end in -ete/-ěte (expected for kuře)`
					);
				}
			}
			break;
		}

		case 'stavení': {
			if (hasSgForms && nomSg) {
				if (!endsWith(nomSg, ['í'])) {
					addMismatch(
						lemma,
						paradigm,
						`Nom sg "${nomSg}" does not end in -í (expected for stavení)`
					);
				}
			}
			break;
		}

		default:
			addMismatch(lemma, paradigm, `Unknown paradigm "${paradigm}"`);
	}
}

// Print results
console.log('=== Paradigm Audit Report ===\n');
console.log(`Total words checked: ${wordBank.length}`);
console.log(`Total mismatches: ${mismatches.length}\n`);

if (mismatches.length > 0) {
	console.log('--- Mismatches ---\n');
	for (const m of mismatches) {
		console.log(`  [${m.paradigm}] ${m.lemma}: ${m.reason}`);
	}
} else {
	console.log('No mismatches found!');
}
