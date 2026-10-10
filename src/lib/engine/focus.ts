import type { Case, Difficulty, FocusTopic, SentenceTemplate, WordEntry } from '../types';
import { CASE_INDEX } from '../types';
import { applyPrepositionVoicing } from './preposition-voicing';
import { withCount } from './numbers';

/**
 * Focus topics: the grammar decks on the Decks page. Starting one narrows
 * sentence drills to that topic. A template opts in through its
 * `topics` list in `sentence_templates.json`; everything else about the drill
 * (word choice, grading, spacing) is unchanged. Pure module: the practice page
 * only asks which templates a focus allows.
 */

export interface FocusDef {
	id: FocusTopic;
	/** Its name in links: `/?deck=kam-kde-odkud`. */
	slug: string;
	label: string;
	/** One line under the name on its deck card and practice banner. */
	blurb: string;
	/** Lowest level the topic is offered at. */
	unlockLevel: Difficulty;
	/**
	 * The topic is about singular against plural, so its sentences are asked in
	 * both whatever the number setting says, and without first proving the
	 * singular (the A2 singular-first rule).
	 */
	bothNumbers?: true;
}

export const FOCUS_DEFS: readonly FocusDef[] = [
	{
		id: 'direction',
		slug: 'kam-kde-odkud',
		label: 'Kam? Kde? Odkud?',
		blurb: 'Where to, where, where from: do školy, ve škole, ze školy',
		unlockLevel: 'A1'
	},
	{
		id: 'verbs',
		slug: 'verbs',
		label: 'Verbs + case',
		blurb: 'Verbs that decide the case: pomáhat + dative, bát se + genitive',
		unlockLevel: 'A1'
	},
	{
		id: 'numbers',
		slug: 'numbers',
		label: 'Kolik? Numbers',
		blurb: 'What a number does to the noun: jeden dům, dva domy, pět domů',
		unlockLevel: 'A2',
		bothNumbers: true
	}
];

const FOCUS_IDS: ReadonlySet<string> = new Set(FOCUS_DEFS.map((d) => d.id));

export function isFocusTopic(value: unknown): value is FocusTopic {
	return typeof value === 'string' && FOCUS_IDS.has(value);
}

export function focusDef(id: FocusTopic): FocusDef {
	const def = FOCUS_DEFS.find((d) => d.id === id);
	if (!def) throw new Error(`Unknown focus topic "${id}"`);
	return def;
}

/** The topic a deck link names, or null for an unknown or missing slug. */
export function focusFromSlug(slug: string | null | undefined): FocusTopic | null {
	return FOCUS_DEFS.find((d) => d.slug === slug)?.id ?? null;
}

const LEVEL_ORDER: readonly Difficulty[] = ['A1', 'A2', 'B1', 'B2'];

export function focusUnlocked(id: FocusTopic, level: Difficulty): boolean {
	return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(focusDef(id).unlockLevel);
}

/** The templates a focus allows; with no focus, all of them. */
export function templatesForFocus<T extends { topics?: FocusTopic[] }>(
	templates: T[],
	focus: FocusTopic | null
): T[] {
	if (focus === null) return templates;
	return templates.filter((t) => t.topics?.includes(focus) === true);
}

// --- Kam? Kde? Odkud? ---------------------------------------------------

export type DirectionRole = 'kam' | 'kde' | 'odkud';

/**
 * Which preposition set a noun takes. Buildings and enclosed places use
 * do / v / z, surfaces, events and "na" places use na / na / z, and people
 * (going to someone's, being at someone's) use k / u / od.
 */
export type PlaceKind = 'v' | 'na' | 'person';

interface DirectionSlot {
	prep: string;
	case: Case;
}

const DIRECTION_TABLE: Record<PlaceKind, Record<DirectionRole, DirectionSlot>> = {
	v: {
		kam: { prep: 'do', case: 'gen' },
		kde: { prep: 'v', case: 'loc' },
		odkud: { prep: 'z', case: 'gen' }
	},
	na: {
		kam: { prep: 'na', case: 'acc' },
		kde: { prep: 'na', case: 'loc' },
		odkud: { prep: 'z', case: 'gen' }
	},
	person: {
		kam: { prep: 'k', case: 'dat' },
		kde: { prep: 'u', case: 'gen' },
		odkud: { prep: 'od', case: 'gen' }
	}
};

const PERSON_CATEGORIES: ReadonlySet<string> = new Set(['people', 'family', 'profession']);

/** The preposition set a noun takes, or null when it isn't a place or a person. */
export function placeKind(word: Pick<WordEntry, 'categories'>): PlaceKind | null {
	if (word.categories.includes('na_place')) return 'na';
	if (word.categories.includes('v_place')) return 'v';
	if (word.categories.some((c) => PERSON_CATEGORIES.has(c))) return 'person';
	return null;
}

/**
 * The question a direction template answers, read off its preposition and
 * case. Null for templates outside the topic or with another preposition.
 */
export function directionRole(
	template: Pick<SentenceTemplate, 'topics' | 'trigger' | 'requiredCase'>
): DirectionRole | null {
	if (template.topics?.includes('direction') !== true) return null;
	const prep = template.trigger.split('/')[0].trim().toLowerCase();
	for (const kind of ['v', 'na', 'person'] as const) {
		for (const role of ['kam', 'kde', 'odkud'] as const) {
			const slot = DIRECTION_TABLE[kind][role];
			if (slot.prep === prep && slot.case === template.requiredCase) return role;
		}
	}
	return null;
}

const ROLE_LABEL: Record<DirectionRole, string> = {
	kam: 'Kam?',
	kde: 'Kde?',
	odkud: 'Odkud?'
};

function phrase(slot: DirectionSlot, form: string): string {
	return applyPrepositionVoicing(`${slot.prep} ___`, form).replace('___', form);
}

/**
 * The three-way contrast for one word, shown under the answer so the learner
 * sees the whole set, with the asked one in bold:
 *   "Compare: Kam? do školy · **Kde? ve škole** · Odkud? ze školy"
 * Null when the template isn't a direction template, the word isn't a place
 * or a person, the template's preposition doesn't belong to the word's set
 * (v + an "na" place), or a form is missing.
 */
export function directionContrast(template: SentenceTemplate, word: WordEntry): string | null {
	const role = directionRole(template);
	if (!role) return null;
	const kind = placeKind(word);
	if (!kind) return null;
	const asked = DIRECTION_TABLE[kind][role];
	const prep = template.trigger.split('/')[0].trim().toLowerCase();
	if (asked.prep !== prep || asked.case !== template.requiredCase) return null;

	const parts: string[] = [];
	for (const r of ['kam', 'kde', 'odkud'] as const) {
		const slot = DIRECTION_TABLE[kind][r];
		const form = word.forms[template.number][CASE_INDEX[slot.case]];
		if (!form) return null;
		const text = `${ROLE_LABEL[r]} ${phrase(slot, form)}`;
		parts.push(r === role ? `**${text}**` : text);
	}
	return `Compare: ${parts.join(' · ')}`;
}

/**
 * The template with the word's direction contrast appended to its `why`, or
 * the template itself when there is none. The first `why` line (which the
 * hints read) is left as written.
 */
export function withDirectionContrast(
	template: SentenceTemplate,
	word: WordEntry
): SentenceTemplate {
	const contrast = directionContrast(template, word);
	return contrast ? { ...template, why: `${template.why}\n${contrast}` } : template;
}

/**
 * A sentence template made ready for the word it will be asked with: numerals
 * filled in and the word's comparison line (direction or counting) appended
 * to the `why`. Every question built from a sentence goes through here.
 */
export function templateForWord(template: SentenceTemplate, word: WordEntry): SentenceTemplate {
	return withDirectionContrast(withCount(template, word), word);
}
