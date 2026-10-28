import type {
	AdjectiveEntry,
	AdjectiveGenderKey,
	Case,
	Number_,
	Paradigm,
	WordEntry
} from '$lib/types';
import { CASE_INDEX } from '$lib/types';
import { matchedEndings, paradigmEndings } from './paradigm-endings';

/**
 * Spot answers that would be right if the masculine noun had the other
 * animacy, and say so. Animacy is the one masculine distinction learners
 * cannot see in the nominative singular (hrad, pán), so a "wrong case" or
 * "wrong ending" verdict hides what actually went wrong:
 *
 *   vidím pán   → accusative of an animate noun is the genitive form (pána)
 *   vidím hradu → accusative of an inanimate noun is the nominative form (hrad)
 *   páni ↔ pány → animate nominative and accusative plural differ
 *   pánu (gen)  → -u is the inanimate (hrad-type) genitive ending
 *   nový pána   → the adjective follows the noun's animacy too (nového pána)
 */

const ANIMATE_PARADIGMS: ReadonlySet<Paradigm> = new Set(['pán', 'muž', 'soudce', 'předseda']);
const INANIMATE_PARADIGMS: ReadonlySet<Paradigm> = new Set(['hrad', 'stroj']);

/** Paradigm with the same stem type but the other animacy. */
const COUNTERPART: Partial<Record<Paradigm, Paradigm>> = {
	hrad: 'pán',
	pán: 'hrad',
	stroj: 'muž',
	muž: 'stroj'
};

function norm(s: string): string {
	return s.trim().toLowerCase().normalize('NFC');
}

function kind(animate: boolean): string {
	return animate ? 'animate' : 'inanimate';
}

function nounForm(word: WordEntry, c: Case, n: Number_): string {
	return norm(word.forms[n][CASE_INDEX[c]] ?? '');
}

function acceptedNounForms(word: WordEntry, c: Case, n: Number_): string[] {
	const variants = word.variantForms?.[n]?.[CASE_INDEX[c]] ?? [];
	return [word.forms[n][CASE_INDEX[c]] ?? '', ...variants].map(norm).filter((f) => f !== '');
}

/**
 * Note for a noun answer built on the wrong animacy, or null when the answer
 * is right, the noun is not masculine, or the mistake is something else.
 */
export function nounAnimacyMixup(
	word: WordEntry,
	slot: { case: Case; number: Number_ },
	typed: string
): string | null {
	if (word.gender !== 'm') return null;
	const answer = norm(typed);
	const accepted = acceptedNounForms(word, slot.case, slot.number);
	if (!answer || accepted.length === 0 || accepted.includes(answer)) return null;
	const correct = accepted[0];
	const lemma = word.lemma;

	const accSg = slot.case === 'acc' && slot.number === 'sg';
	const accSgNote = word.animate
		? `${lemma} is animate, so accusative = genitive: ${correct}.`
		: `${lemma} is inanimate, so accusative = nominative: ${correct}.`;
	if (accSg && answer === nounForm(word, word.animate ? 'nom' : 'gen', 'sg')) return accSgNote;
	if (word.animate && slot.number === 'pl') {
		if (slot.case === 'nom' && answer === nounForm(word, 'acc', 'pl')) {
			return `${lemma} is animate: nominative plural is ${correct}, not ${answer}.`;
		}
		if (slot.case === 'acc' && answer === nounForm(word, 'nom', 'pl')) {
			return `${lemma} is animate: accusative plural is ${correct}, not ${answer}.`;
		}
	}

	// An ending from the other-animacy paradigm on this word's own stem. Every
	// accepted form is tried, since the primary may soften the stem (papíře)
	// where a variant keeps it plain (papíru).
	const counterpart = COUNTERPART[word.paradigm];
	if (counterpart === undefined) return null;
	const own = paradigmEndings(word.paradigm, slot.case, slot.number);
	const theirs = paradigmEndings(counterpart, slot.case, slot.number);
	for (const form of accepted) {
		const [ending] = matchedEndings(word.paradigm, slot.case, slot.number, [form]);
		if (ending === undefined) continue;
		const stem = form.slice(0, form.length - ending.length);
		if (!stem || !answer.startsWith(stem)) continue;
		const used = answer.slice(stem.length);
		if (own.includes(used) || !theirs.includes(used)) continue;
		if (accSg) return accSgNote;
		return `${lemma} is ${kind(word.animate)}: ${used === '' ? 'no ending' : `-${used}`} is for ${kind(!word.animate)} nouns like ${counterpart}. Use ${accepted.join(' or ')}.`;
	}
	return null;
}

/**
 * Note for an adjective answer that agrees with the wrong masculine animacy
 * (nový pána, nového hrad), or null. `nounLemma` names the noun the sentence
 * shows when it differs from `word` (adjective templates bake their noun in
 * and pass a stand-in of the same gender and animacy).
 */
export function adjectiveAnimacyMixup(
	adjective: AdjectiveEntry,
	word: WordEntry,
	slot: { case: Case; number: Number_ },
	typed: string,
	nounLemma: string = word.lemma
): string | null {
	if (word.gender !== 'm') return null;
	const own: AdjectiveGenderKey = word.animate ? 'm_anim' : 'm_inanim';
	const other: AdjectiveGenderKey = word.animate ? 'm_inanim' : 'm_anim';
	const formsFor = (key: AdjectiveGenderKey): string[] => {
		const primary = adjective.forms[key][slot.number][CASE_INDEX[slot.case]] ?? '';
		const variants = adjective.variantForms?.[key]?.[slot.number]?.[CASE_INDEX[slot.case]] ?? [];
		return [primary, ...variants].map(norm).filter((f) => f !== '');
	};
	const answer = norm(typed);
	const accepted = formsFor(own);
	if (!answer || accepted.length === 0 || accepted.includes(answer)) return null;
	if (!formsFor(other).includes(answer)) return null;
	return `${nounLemma} is ${kind(word.animate)}: use ${accepted[0]}, not ${answer}.`;
}

/**
 * Note when a learner files a masculine noun under a paradigm of the other
 * animacy (pán for a hrad-type noun), or null.
 */
export function paradigmAnimacyMixup(word: WordEntry, picked: Paradigm): string | null {
	if (word.gender !== 'm' || picked === word.paradigm) return null;
	const pickedAnimate = ANIMATE_PARADIGMS.has(picked);
	if (!pickedAnimate && !INANIMATE_PARADIGMS.has(picked)) return null;
	if (pickedAnimate === word.animate) return null;
	return word.animate
		? `${word.lemma} is animate (a person or animal): ${word.paradigm}, not ${picked}.`
		: `${word.lemma} is inanimate (a thing): ${word.paradigm}, not ${picked}.`;
}
