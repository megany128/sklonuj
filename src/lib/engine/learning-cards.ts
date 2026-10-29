import type { AdjectiveGenderKey, Case, DrillQuestion, FocusTopic } from '../types';
import { CASE_INDEX, CASE_LABELS } from '../types';
import { getAdjectiveGenderKey } from './adjective-keys';
import { agreeingNoun } from './agreeing-noun';
import { applyPrepositionVoicing } from './preposition-voicing';
import { matchedEndings } from '../utils/paradigm-endings';
import { GENDER_NAMES, wrongGenderMatch } from '../utils/wrong-gender';

/**
 * Short cards shown in place of the next question: an intro the first time
 * a learner opens a deck or meets a case, and a rundown when they keep
 * missing the same kind of question. Kept brief on purpose: one line, a few
 * examples with the form to learn picked out.
 */

/** A phrase with the form to learn picked out: "v **tom** jezeře". */
export interface CardPhrase {
	before: string;
	bold: string;
	after: string;
}

export interface LearningCardModel {
	kind: 'deck' | 'case' | 'struggle';
	/** What the card is about, for "seen" and once-per-session bookkeeping. */
	key: string;
	/** Small label above the title ("New deck"). */
	eyebrow?: string;
	title: string;
	/** Gives the card its case number badge and colours. */
	case?: Case;
	/** The case's question words ("komu? čemu?"). */
	question?: string;
	line: string;
	/** Labelled rows (a deck's genders, directions or numbers). */
	rows?: { label: string; phrases: CardPhrase[] }[];
	/** Examples in a box tinted with the case colour. */
	examples?: CardPhrase[];
	/** How examples pick out the form: coloured bold text, or a solid chip. */
	highlight: 'text' | 'chip';
	note?: CardPhrase;
	primary: string;
	secondary?: string;
}

const p = (before: string, bold: string, after = ''): CardPhrase => ({ before, bold, after });

interface CaseIntro {
	question: string;
	line: string;
	examples: CardPhrase[];
}

/** The nominative is the dictionary form, so it gets no intro. */
const CASE_INTROS: Record<Exclude<Case, 'nom'>, CaseIntro> = {
	gen: {
		question: 'koho? čeho?',
		line: 'Of, from, without: after z, do, bez, u.',
		examples: [
			p('Jdu do ', 'školy', '.'),
			p('Kávu bez ', 'cukru', '.'),
			p('Jsem u ', 'babičky', '.')
		]
	},
	dat: {
		question: 'komu? čemu?',
		line: 'Who you give to, help, or go towards.',
		examples: [
			p('Dám to ', 'bratrovi', '.'),
			p('Pomáhám ', 'mámě', '.'),
			p('Jdu k ', 'doktorovi', '.')
		]
	},
	acc: {
		question: 'koho? co?',
		line: 'Whoever or whatever the action is done to.',
		examples: [p('Vidím ', 'Petra', '.'), p('Mám ', 'kávu', '.'), p('Čekám na ', 'autobus', '.')]
	},
	voc: {
		question: 'Calling someone',
		line: 'The form for talking to someone.',
		examples: [
			p('', 'Petře', ', pojď sem!'),
			p('Ahoj, ', 'Jano', '!'),
			p('Dobrý den, ', 'pane', '!')
		]
	},
	loc: {
		question: 'o kom? o čem?',
		line: 'Where something is, or what it is about. Always after a preposition.',
		examples: [
			p('Jsem v ', 'Praze', '.'),
			p('Mluvíme o ', 'filmu', '.'),
			p('Kniha je na ', 'stole', '.')
		]
	},
	ins: {
		question: 'kým? čím?',
		line: 'With whom, or by what means.',
		examples: [p('Jdu s ', 'kamarádem', '.'), p('Jedu ', 'vlakem', '.'), p('Píšu ', 'tužkou', '.')]
	}
};

export function caseIntroCard(c: Case): LearningCardModel | null {
	if (c === 'nom') return null;
	const intro = CASE_INTROS[c];
	return {
		kind: 'case',
		key: `case:${c}`,
		title: CASE_LABELS[c],
		case: c,
		question: intro.question,
		line: intro.line,
		examples: intro.examples,
		highlight: 'text',
		primary: 'Got it'
	};
}

interface DeckIntro {
	line: string;
	rows: { label: string; phrases: CardPhrase[] }[];
	note?: CardPhrase;
}

const DECK_INTROS: Record<FocusTopic, DeckIntro> = {
	direction: {
		line: 'Where to, where, and where from each take their own case.',
		rows: [
			{ label: 'kam?', phrases: [p('do ', 'školy')] },
			{ label: 'kde?', phrases: [p('ve ', 'škole')] },
			{ label: 'odkud?', phrases: [p('ze ', 'školy')] }
		]
	},
	verbs: {
		line: 'Some verbs choose the case themselves.',
		rows: [
			{ label: 'dat.', phrases: [p('pomáhat ', 'mámě')] },
			{ label: 'gen.', phrases: [p('bát se ', 'psa')] },
			{ label: 'acc.', phrases: [p('čekat na ', 'autobus')] }
		]
	},
	demonstratives: {
		line: 'Changes with the noun, like an adjective.',
		rows: [
			{ label: 'masc.', phrases: [p('', 'ten', ' pes'), p('', 'toho', ' psa')] },
			{ label: 'fem.', phrases: [p('', 'ta', ' žena'), p('s ', 'tou', ' ženou')] },
			{ label: 'neut.', phrases: [p('', 'to', ' jezero'), p('v ', 'tom', ' jezeře')] }
		],
		note: p('+hle (spoken), +to (written): ', 'tenhle, tento')
	},
	numbers: {
		line: 'The number decides the form of the noun.',
		rows: [
			{ label: '1', phrases: [p('jeden ', 'dům')] },
			{ label: '2–4', phrases: [p('dva ', 'domy')] },
			{ label: '5+', phrases: [p('pět ', 'domů')] }
		]
	},
	determiners: {
		line: 'My, your, our and that change with the noun, like adjectives.',
		rows: [
			{ label: 'masc.', phrases: [p('', 'můj', ' bratr'), p('s ', 'mým', ' bratrem')] },
			{ label: 'fem.', phrases: [p('', 'moje', ' sestra'), p('s ', 'mou', ' sestrou')] },
			{ label: 'neut.', phrases: [p('', 'naše', ' auto'), p('v ', 'našem', ' autě')] }
		]
	}
};

export function deckIntroCard(deck: FocusTopic, label: string): LearningCardModel {
	const intro = DECK_INTROS[deck];
	return {
		kind: 'deck',
		key: `deck:${deck}`,
		eyebrow: 'New deck',
		title: label,
		line: intro.line,
		rows: intro.rows,
		note: intro.note,
		highlight: 'text',
		primary: 'Start',
		secondary: 'Skip'
	};
}

// --- Seen intros (this device only: a convenience, not progress) ---

const SEEN_KEY = 'sklonuj_seen_cards';

// Seen this page load, kept apart from storage so a card still closes for
// good when storage is blocked or full.
const seenThisLoad = new Set<string>();

export function loadSeenCards(): Set<string> {
	try {
		const raw = localStorage.getItem(SEEN_KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		const stored = Array.isArray(parsed)
			? parsed.filter((k): k is string => typeof k === 'string')
			: [];
		return new Set([...stored, ...seenThisLoad]);
	} catch {
		return new Set(seenThisLoad);
	}
}

export function markCardSeen(key: string): void {
	seenThisLoad.add(key);
	try {
		localStorage.setItem(SEEN_KEY, JSON.stringify([...loadSeenCards()]));
	} catch {
		// Private mode or a full quota: remembered for this page load only.
	}
}

// --- Struggles ---

/** Answers kept per kind of question, newest last. */
export const STRUGGLE_WINDOW = 5;
/** Misses within the window that bring up a rundown. */
export const STRUGGLE_MISSES = 3;

/**
 * The kind of question a miss counts against: case and number, plus the
 * gender for adjectives and determiners (the usual mistake there) or the
 * paradigm for nouns. Null for questions a rundown can't help with: case
 * identification and multi-step.
 */
export function struggleKey(q: DrillQuestion): string | null {
	if (q.drillType !== 'form_production' && q.drillType !== 'sentence_fill_in') return null;
	const base = `${q.case}:${q.number}`;
	if (q.wordCategory === 'adjective') {
		const noun = agreeingNoun(q);
		return noun ? `adj:${base}:${getAdjectiveGenderKey(noun)}` : null;
	}
	if (q.wordCategory === 'pronoun') return `pron:${base}`;
	return `noun:${base}:${q.word.paradigm}`;
}

/** The outcomes after one more answer: true for right. Does not mutate `log`. */
export function withStruggleAnswer(
	log: Record<string, boolean[]>,
	key: string,
	right: boolean
): Record<string, boolean[]> {
	return { ...log, [key]: [...(log[key] ?? []), right].slice(-STRUGGLE_WINDOW) };
}

/** Struggling: enough misses in the window, and the latest answer is one of them. */
export function isStruggling(outcomes: readonly boolean[]): boolean {
	if (outcomes.length === 0 || outcomes[outcomes.length - 1]) return false;
	return outcomes.filter((ok) => !ok).length >= STRUGGLE_MISSES;
}

export interface Miss {
	question: DrillQuestion;
	/** What the learner typed ('' for a skip). */
	typed: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ALL_GENDERS: AdjectiveGenderKey[] = ['m_anim', 'm_inanim', 'f', 'n'];

/** Noun questions leave `wordCategory` unset. */
const isNoun = (q: DrillQuestion) => q.wordCategory !== 'adjective' && q.wordCategory !== 'pronoun';

/** The answer's form as the sentence shows it. */
function answerForm(q: DrillQuestion): string {
	return q.correctAnswer.split('/')[0];
}

/** A short slice of the question with the answer in it: "v tom jezeře". */
function examplePhrase(q: DrillQuestion): CardPhrase {
	const form = answerForm(q);
	if (q.template.id.startsWith('_') || !q.template.template.includes('___')) {
		// A bare form: "foťák → foťáku", or the adjective with its noun.
		if (isNoun(q)) return p(`${q.word.forms[q.number][0] || q.word.lemma} → `, form);
		const noun = q.wordCategory === 'adjective' ? agreeingNoun(q) : null;
		const nounForm = noun ? noun.forms[q.number][CASE_INDEX[q.case]] : '';
		return p('', form, nounForm ? ` ${nounForm}` : '');
	}
	const [before = '', after = ''] = applyPrepositionVoicing(q.template.template, form).split('___');
	const lead = before.trim().split(/\s+/).pop() ?? '';
	const tail = after.trim().split(/\s+/)[0] ?? '';
	return p(
		lead ? `${lead.toLowerCase()} ` : '',
		form,
		tail ? ` ${tail.replace(/[.,!?;:]+$/, '')}` : ''
	);
}

/** The rule line: what the learner keeps getting wrong, in a sentence or two. */
function ruleLine(latest: Miss): string {
	const q = latest.question;
	if (q.wordCategory === 'adjective' && q.adjective) {
		const noun = agreeingNoun(q);
		if (noun) {
			const slot = { case: q.case, number: q.number };
			const own = getAdjectiveGenderKey(noun);
			const formOf = (g: AdjectiveGenderKey) => q.adjective?.forms[g][q.number][CASE_INDEX[q.case]];
			const ownForm = formOf(own);
			const sharers = ALL_GENDERS.filter((g) => g !== own && formOf(g) === ownForm);
			// Name masculine as one gender unless its animate and inanimate forms differ here.
			const splitMasculine = formOf('m_anim') !== formOf('m_inanim');
			const nameOf = (g: AdjectiveGenderKey) =>
				g.startsWith('m') && !splitMasculine ? 'masculine' : GENDER_NAMES[g];
			const ownName = nameOf(own);
			const others = [...new Set(sharers.map(nameOf))].filter((n) => n !== ownName);
			const shared =
				sharers.length === ALL_GENDERS.length - 1
					? 'All genders share this form.'
					: others.length > 0
						? `${capitalize(ownName)} and ${others.join(' and ')} share this form.`
						: `${capitalize(ownName)} has its own form here.`;
			const match = wrongGenderMatch(q.adjective, noun, slot, latest.typed);
			return match ? `${shared} ${capitalize(match.form)} is only for ${match.theirs}.` : shared;
		}
	}
	if (isNoun(q)) {
		const [ending] = matchedEndings(q.word.paradigm, q.case, q.number, [answerForm(q)]);
		if (ending !== undefined) {
			const end = ending === '' ? 'no ending' : `-${ending}`;
			return `${capitalize(q.word.lemma)} takes ${end} here (${answerForm(q)}).`;
		}
	}
	// A real sentence's own rule; the bare-form drills' stand-in template has
	// nothing worth repeating.
	return q.template.id.startsWith('_') ? '' : q.template.why.split('\n')[0];
}

/**
 * The rundown for a run of misses of one kind (`struggleKey`), most recent
 * last. Its examples are the questions just missed, answered.
 */
export function struggleCard(key: string, misses: readonly Miss[]): LearningCardModel | null {
	const latest = misses[misses.length - 1];
	if (!latest) return null;
	const q = latest.question;
	let detail = '';
	if (q.wordCategory === 'adjective') {
		const noun = agreeingNoun(q);
		if (noun)
			detail = ` · ${GENDER_NAMES[getAdjectiveGenderKey(noun)].replace(/ (in)?animate$/, '')}`;
	} else if (isNoun(q)) {
		detail = ` · like ${q.word.paradigm}`;
	}
	const examples: CardPhrase[] = [];
	for (const miss of [...misses].reverse()) {
		const phrase = examplePhrase(miss.question);
		const text = `${phrase.before}${phrase.bold}${phrase.after}`;
		if (!examples.some((e) => `${e.before}${e.bold}${e.after}` === text)) examples.push(phrase);
		if (examples.length === 2) break;
	}
	return {
		kind: 'struggle',
		key: `struggle:${key}`,
		title: `${CASE_LABELS[q.case]}${q.number === 'pl' ? ' plural' : ''}${detail}`,
		case: q.case,
		line: ruleLine(latest),
		examples,
		highlight: 'chip',
		primary: 'Practise 5',
		secondary: 'Not now'
	};
}
