import type { Case, Gender, Number_, Paradigm, WordEntry } from '$lib/types';
import { CASE_INDEX } from '$lib/types';
import { matchedEndings, paradigmEndings } from './paradigm-endings';

/**
 * Name the rule a wrong noun ending came from, so the learner sees why their
 * answer looked right to them:
 *
 *   You used -u: also a hrad-type locative ending, but hrad takes -ě
 *   You used -ě: the hrad-type locative ending, but pokoj is stroj-type (-i)
 *
 * Only explains answers built on the correct form's own stem. A wrong stem
 * (knihě for knize) is an alternation problem the paradigm notes already
 * cover, and naming an ending there would point at the wrong mistake.
 */

const PARADIGMS_BY_GENDER: Record<Gender, Paradigm[]> = {
	m: ['hrad', 'pán', 'muž', 'stroj', 'soudce', 'předseda'],
	f: ['žena', 'růže', 'píseň', 'kost'],
	n: ['město', 'moře', 'kuře', 'stavení']
};

const CASE_NAMES: Record<Case, string> = {
	nom: 'nominative',
	gen: 'genitive',
	dat: 'dative',
	acc: 'accusative',
	voc: 'vocative',
	loc: 'locative',
	ins: 'instrumental'
};

/** Longest ending a typed answer may add to the stem and still count as an ending. */
const MAX_ENDING = 4;

function describe(ending: string): string {
	return ending === '' ? 'no ending' : `-${ending}`;
}

export interface WrongEndingOptions {
	/** The answer is another case's form of this word. Its verdict already
	 * names that case, so only an alternative ending of the right case is
	 * worth explaining, not a look-alike from another paradigm. */
	accidentalCase?: boolean;
}

export function explainWrongEnding(
	word: WordEntry,
	slot: { case: Case; number: Number_ },
	typed: string,
	options: WrongEndingOptions = {}
): string | null {
	const answer = typed.trim().toLowerCase().normalize('NFC');
	const primary = (word.forms[slot.number][CASE_INDEX[slot.case]] ?? '').toLowerCase();
	if (!answer || !primary || answer === primary) return null;
	const variants = word.variantForms?.[slot.number]?.[CASE_INDEX[slot.case]] ?? [];
	if (variants.some((v) => v.toLowerCase() === answer)) return null;

	const [correct] = matchedEndings(word.paradigm, slot.case, slot.number, [primary]);
	if (correct === undefined) return null;
	const stem = primary.slice(0, primary.length - correct.length);
	if (!stem || !answer.startsWith(stem)) return null;
	const used = answer.slice(stem.length);
	if (used === correct || used.length > MAX_ENDING) return null;

	const slotName = `${CASE_NAMES[slot.case]}${slot.number === 'pl' ? ' plural' : ''}`;
	const label = `You used ${describe(used)}`;

	if (paradigmEndings(word.paradigm, slot.case, slot.number).includes(used)) {
		return `${label}: also a ${word.paradigm}-type ${slotName} ending, but ${word.lemma} takes ${describe(correct)}`;
	}
	if (options.accidentalCase) return null;

	const others = PARADIGMS_BY_GENDER[word.gender].filter(
		(p) => p !== word.paradigm && paradigmEndings(p, slot.case, slot.number).includes(used)
	);
	if (others.length === 0) return null;
	const source = others.slice(0, 2).join('/');
	const own =
		word.lemma === word.paradigm
			? `${word.lemma} takes ${describe(correct)}`
			: `${word.lemma} is ${word.paradigm}-type (${describe(correct)})`;
	return `${label}: the ${source}-type ${slotName} ending, but ${own}`;
}
