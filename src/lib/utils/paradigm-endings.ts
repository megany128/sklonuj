import type { Case, Number_, Paradigm, WordEntry } from '$lib/types';
import { CASE_INDEX } from '$lib/types';

/**
 * The endings each paradigm's `whyNotes` describe, per case, in the internal
 * 7-tuple order (nom, gen, dat, acc, voc, loc, ins). A `''` entry is the
 * zero ending. Alternatives are listed where the paradigm itself admits more
 * than one (pánovi/pánu, na hradě/ve vlaku …) *and its whyNote says so*;
 * palatalised `-e` (roce, ruce) is listed beside `-ě` because that is how it
 * is spelled after c/z/s. Endings the notes don't mention (voc -u after
 * velars, loc pl -ích/-ách) are left out on purpose, so a lemma-specific note
 * stands alone there instead of beside a rule it contradicts.
 */
const PARADIGM_ENDINGS: Record<Paradigm, { sg: string[][]; pl: string[][] }> = {
	hrad: {
		sg: [[''], ['u'], ['u'], [''], ['e'], ['u', 'ě', 'e'], ['em']],
		pl: [['y'], ['ů'], ['ům'], ['y'], ['y'], ['ech'], ['y']]
	},
	pán: {
		sg: [[''], ['a'], ['ovi', 'u'], ['a'], ['e'], ['ovi', 'u'], ['em']],
		pl: [['i', 'ové'], ['ů'], ['ům'], ['y'], ['i', 'ové'], ['ech'], ['y']]
	},
	muž: {
		sg: [[''], ['e'], ['i', 'ovi'], ['e'], ['i'], ['i', 'ovi'], ['em']],
		pl: [['i', 'ové'], ['ů'], ['ům'], ['e'], ['i', 'ové'], ['ích'], ['i']]
	},
	stroj: {
		sg: [[''], ['e'], ['i'], [''], ['i'], ['i'], ['em']],
		pl: [['e'], ['ů'], ['ům'], ['e'], ['e'], ['ích'], ['i']]
	},
	soudce: {
		sg: [['e'], ['e'], ['i', 'ovi'], ['e'], ['e'], ['i', 'ovi'], ['em']],
		pl: [['i', 'ové'], ['ů'], ['ům'], ['e'], ['i', 'ové'], ['ích'], ['i']]
	},
	předseda: {
		sg: [['a'], ['y'], ['ovi'], ['u'], ['o'], ['ovi'], ['ou']],
		pl: [['ové'], ['ů'], ['ům'], ['y'], ['ové'], ['ech'], ['y']]
	},
	žena: {
		sg: [['a'], ['y'], ['ě', 'e'], ['u'], ['o'], ['ě', 'e'], ['ou']],
		pl: [['y'], [''], ['ám'], ['y'], ['y'], ['ách'], ['ami']]
	},
	růže: {
		sg: [['e', 'ě'], ['e', 'ě'], ['i'], ['i'], ['e', 'ě'], ['i'], ['í']],
		pl: [['e', 'ě'], ['í', ''], ['ím'], ['e', 'ě'], ['e', 'ě'], ['ích'], ['emi', 'ěmi']]
	},
	píseň: {
		sg: [[''], ['ě', 'e'], ['i'], [''], ['i'], ['i'], ['í']],
		pl: [['ě', 'e'], ['í'], ['ím'], ['ě', 'e'], ['ě', 'e'], ['ích'], ['ěmi', 'emi']]
	},
	kost: {
		sg: [[''], ['i'], ['i'], [''], ['i'], ['i'], ['í']],
		pl: [['i'], ['í'], ['em'], ['i'], ['i'], ['ech'], ['mi']]
	},
	město: {
		sg: [['o'], ['a'], ['u'], ['o'], ['o'], ['ě', 'e', 'u'], ['em']],
		pl: [['a'], [''], ['ům'], ['a'], ['a'], ['ech'], ['y']]
	},
	moře: {
		sg: [['e'], ['e'], ['i'], ['e'], ['e'], ['i'], ['em']],
		pl: [['e'], ['í'], ['ím'], ['e'], ['e'], ['ích'], ['i']]
	},
	kuře: {
		sg: [['e'], ['ete'], ['eti'], ['e'], ['e'], ['eti'], ['etem']],
		pl: [['ata'], ['at'], ['atům'], ['ata'], ['ata'], ['atech'], ['aty']]
	},
	stavení: {
		sg: [['í'], ['í'], ['í'], ['í'], ['í'], ['í'], ['ím']],
		pl: [['í'], ['í'], ['ím'], ['í'], ['í'], ['ích'], ['ími']]
	}
};

const VOWEL = /[aeiouyáéěíóúůý]$/i;

/**
 * Whether the paradigm's rule for this case describes the word's stored
 * primary form. A zero-ending rule (žen, měst, hrad) is taken to apply
 * whenever the form ends in a consonant, so fleeting-e stems (koček, oken)
 * still count; anything else must carry one of the listed endings.
 */
export function paradigmRuleApplies(
	paradigm: Paradigm,
	c: Case,
	n: Number_,
	word: WordEntry
): boolean {
	const form = word.forms[n][CASE_INDEX[c]];
	if (!form) return false;
	// Accusative (and vocative plural) rules say "same as nominative", which
	// holds for muzeum/téma/software-type words whatever their ending.
	if ((c === 'acc' || (c === 'voc' && n === 'pl')) && form === word.forms[n][CASE_INDEX.nom]) {
		return true;
	}
	const endings = PARADIGM_ENDINGS[paradigm][n][CASE_INDEX[c]];
	return endings.some((ending) =>
		ending === '' ? !VOWEL.test(form) : form.toLowerCase().endsWith(ending)
	);
}
