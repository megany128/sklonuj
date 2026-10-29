import type { AdjectiveEntry, AdjectiveGenderKey, Case, Number_, WordEntry } from '$lib/types';
import { CASE_INDEX } from '$lib/types';
import { getAdjectiveGenderKey } from '$lib/engine/adjective-keys';
import { stripDiacritics } from './diacritics';

/**
 * Name the gender a wrong adjective or determiner form belongs to, when the
 * learner wrote the right case for the wrong noun gender:
 *
 *   té is the feminine form — jezero is neuter, so it takes tom
 *
 * Accents are ignored when matching ("te" is read as té), since the gender is
 * the mistake worth naming there. Null when the answer is no other gender's
 * form of this case and number, or is also this gender's.
 */

export const GENDER_NAMES: Record<AdjectiveGenderKey, string> = {
	m_anim: 'masculine animate',
	m_inanim: 'masculine inanimate',
	f: 'feminine',
	n: 'neuter'
};

const GENDER_KEYS: AdjectiveGenderKey[] = ['m_anim', 'm_inanim', 'f', 'n'];

function formsFor(
	adj: AdjectiveEntry,
	gender: AdjectiveGenderKey,
	slot: { case: Case; number: Number_ }
): string[] {
	const index = CASE_INDEX[slot.case];
	const primary = adj.forms[gender][slot.number][index];
	const variants = adj.variantForms?.[gender]?.[slot.number]?.[index] ?? [];
	return [primary, ...variants].filter((f) => f.trim().length > 0);
}

const loose = (s: string) => stripDiacritics(s.trim().toLowerCase().normalize('NFC'));

export interface GenderMatch {
	/** The typed answer as that gender writes it (accents restored). */
	form: string;
	/** The genders it belongs to, named as finely as the forms differ ("masculine"). */
	theirs: string;
	/** The noun's own gender, named to contrast with `theirs`. */
	own: string;
}

/**
 * Which other gender a typed form belongs to in this case and number. Null
 * when it is this gender's form too, or no gender's.
 */
export function wrongGenderMatch(
	adj: AdjectiveEntry,
	noun: WordEntry,
	slot: { case: Case; number: Number_ },
	typed: string
): GenderMatch | null {
	const answer = loose(typed);
	if (!answer) return null;
	const own = getAdjectiveGenderKey(noun);
	if (formsFor(adj, own, slot).some((f) => loose(f) === answer)) return null;

	// Masculine animate and inanimate share most forms; name the gender only
	// as finely as the forms differ.
	const matches = GENDER_KEYS.filter(
		(g) => g !== own && formsFor(adj, g, slot).some((f) => loose(f) === answer)
	);
	if (matches.length === 0) return null;
	const form = formsFor(adj, matches[0], slot).find((f) => loose(f) === answer) ?? typed;
	const bothMasculine = matches.includes('m_anim') && matches.includes('m_inanim');
	const names = bothMasculine
		? ['masculine', ...matches.filter((g) => !g.startsWith('m')).map((g) => GENDER_NAMES[g])]
		: matches.map((g) => GENDER_NAMES[g]);
	const ownName =
		own.startsWith('m') && !matches.some((g) => g.startsWith('m'))
			? 'masculine'
			: GENDER_NAMES[own];
	return { form, theirs: names.join(' and '), own: ownName };
}

export function explainWrongGender(
	adj: AdjectiveEntry,
	noun: WordEntry,
	slot: { case: Case; number: Number_ },
	typed: string,
	correct: string
): string | null {
	const match = wrongGenderMatch(adj, noun, slot, typed);
	if (!match) return null;
	return `${match.form} is the ${match.theirs} form — ${noun.lemma} is ${match.own}, so it takes ${correct}`;
}
