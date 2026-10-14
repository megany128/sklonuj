import type { Case, SentenceTemplate, WordEntry } from '../types';
import { CASE_INDEX } from '../types';

/**
 * Counting sentences: what a number does to the noun after it.
 *
 *   1               → singular, in the case the sentence needs (jeden dům)
 *   2, 3, 4         → plural, in the case the sentence needs (dva domy)
 *   5 and up, kolik,
 *   několik, hodně… → genitive plural (pět domů)
 *
 * A counting template carries `countContext`: the case the counted phrase
 * stands in (nominative as a subject, accusative as an object). For 1 and
 * 2–4 that is also the noun's case; for 5 and up the noun is genitive and the
 * context only says which forms the comparison line shows.
 *
 * `{jeden}` and `{dva}` in a template stand for the numeral, which agrees with
 * the noun: jeden / jedna / jedno / jednoho / jednu, dva / dvě. They are
 * filled in per word when a question is built. Pure module.
 */

export type CountContext = 'nom' | 'acc';

export function isCountContext(value: unknown): value is CountContext {
	return value === 'nom' || value === 'acc';
}

type Countable = Pick<WordEntry, 'gender' | 'animate'>;

/** jeden in the nominative or accusative, agreeing with the noun. */
export function oneForm(word: Countable, context: CountContext): string {
	if (word.gender === 'f') return context === 'acc' ? 'jednu' : 'jedna';
	if (word.gender === 'n') return 'jedno';
	return context === 'acc' && word.animate ? 'jednoho' : 'jeden';
}

/** dva with masculine nouns, dvě with feminine and neuter (same in nom and acc). */
export function twoForm(word: Pick<WordEntry, 'gender'>): string {
	return word.gender === 'm' ? 'dva' : 'dvě';
}

/**
 * Whether a noun can stand after a number. Mass nouns (mléko) are not counted,
 * and pluralia tantum (dveře, kalhoty) take the collective numerals (dvoje
 * dveře), which these sentences don't teach.
 */
export function isCountable(word: Pick<WordEntry, 'categories' | 'pluralOnly'>): boolean {
	return word.pluralOnly !== true && !word.categories.includes('mass');
}

export type CountBucket = 'one' | 'few' | 'many';

/** Which rule a counting template practises; null for any other template. */
export function countBucket(
	template: Pick<SentenceTemplate, 'countContext' | 'number' | 'requiredCase'>
): CountBucket | null {
	if (!template.countContext) return null;
	if (template.number === 'sg') return 'one';
	return template.requiredCase === 'gen' ? 'many' : 'few';
}

const NUMERAL_TOKEN = /\{(jeden|dva)\}/g;

function fillNumerals(text: string, word: Countable, context: CountContext): string {
	return text.replace(NUMERAL_TOKEN, (_, token: string) =>
		token === 'jeden' ? oneForm(word, context) : twoForm(word)
	);
}

/** True when the text still has a numeral waiting to be filled in. */
export function hasNumeralToken(text: string): boolean {
	return text.search(NUMERAL_TOKEN) !== -1;
}

const BUCKET_LABEL: Record<CountBucket, string> = { one: '1', few: '2–4', many: '5+' };

function form(word: WordEntry, number: 'sg' | 'pl', case_: Case): string {
	return word.forms[number][CASE_INDEX[case_]];
}

/**
 * The three-way comparison for one word, in the sentence's own case context,
 * with the asked rule in bold:
 *   "Compare: 1 jednoho bratra · 2–4 dva bratry · **5+ pět bratrů**"
 * Null outside counting templates, for uncountable nouns, or when a form is
 * missing.
 */
export function countContrast(template: SentenceTemplate, word: WordEntry): string | null {
	const asked = countBucket(template);
	const context = template.countContext;
	if (!asked || !context || !isCountable(word)) return null;
	const phrases: Record<CountBucket, [string, string]> = {
		one: [oneForm(word, context), form(word, 'sg', context)],
		few: [twoForm(word), form(word, 'pl', context)],
		many: ['pět', form(word, 'pl', 'gen')]
	};
	const parts: string[] = [];
	for (const bucket of ['one', 'few', 'many'] as const) {
		const [numeral, noun] = phrases[bucket];
		if (!noun) return null;
		const text = `${BUCKET_LABEL[bucket]} ${numeral} ${noun}`;
		parts.push(bucket === asked ? `**${text}**` : text);
	}
	return `Compare: ${parts.join(' · ')}`;
}

/**
 * A counting template made ready for one word: numerals filled in (sentence,
 * trigger and why) and the comparison appended to the `why`. Any other
 * template is returned as it is.
 */
export function withCount(template: SentenceTemplate, word: WordEntry): SentenceTemplate {
	const context = template.countContext;
	if (!context) return template;
	const contrast = countContrast(template, word);
	const why = fillNumerals(template.why, word, context);
	return {
		...template,
		template: fillNumerals(template.template, word, context),
		trigger: fillNumerals(template.trigger, word, context),
		why: contrast ? `${why}\n${contrast}` : why
	};
}
