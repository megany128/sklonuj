import type { AdjectiveGenderKey, Case, Gender, Number_, WordEntry } from '../types';

/**
 * Keys for adjective forms and adjective progress. Kept apart from
 * `adjective-drill.ts`, which loads the adjective and word banks: the progress
 * store is part of every page and needs only these.
 */

/** Map a noun's gender and animacy to the adjective forms that agree with it. */
export function getAdjectiveGenderKey(word: WordEntry): AdjectiveGenderKey {
	if (word.gender === 'm') {
		return word.animate ? 'm_anim' : 'm_inanim';
	}
	if (word.gender === 'f') return 'f';
	return 'n';
}

export function genderKeyFromGenderAnimate(gender: Gender, animate: boolean): AdjectiveGenderKey {
	if (gender === 'm') return animate ? 'm_anim' : 'm_inanim';
	if (gender === 'f') return 'f';
	return 'n';
}

/** Progress tracking key for one adjective form. */
export function adjectiveParadigmKey(
	adjLemma: string,
	genderKey: AdjectiveGenderKey,
	case_: Case,
	number_: Number_
): string {
	return `adj_${adjLemma}_${genderKey}_${case_}_${number_}`;
}
