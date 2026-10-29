import type {
	Case,
	CaseScore,
	Difficulty,
	FocusTopic,
	Number_,
	Paradigm,
	SentenceTemplate
} from '../types';
import { ALL_CASES, ALL_PARADIGMS } from '../types';
import curriculumData from '../data/curriculum.json';
import { FOCUS_DEFS, focusUnlocked, templatesForFocus, type FocusDef } from './focus';
import {
	deckCellKey,
	deckCompletion,
	type DeckCompletion,
	type DeckProgress,
	type DeckStat
} from './deck-progress';

/**
 * What the Decks page shows. Two kinds of deck: grammar topics (a set of
 * tagged sentences, see `focus.ts`) and word patterns (one of the 14 noun
 * paradigms, practised through the existing `?selectParadigm=` filter).
 * Pure module: the page passes in the learner's level and scores.
 */

interface LevelConfig {
	unlocked_cases: string[];
	unlocked_difficulty: string[];
	plural_unlocked: boolean | string;
}

const curriculum: Record<string, LevelConfig> = curriculumData;

const NUMBERS: Number_[] = ['sg', 'pl'];

export interface GrammarDeck {
	def: FocusDef;
	/** False below the deck's level; the card says which level opens it. */
	unlocked: boolean;
	/** Sentences the learner's level can actually be asked. */
	sentences: number;
	/** Every sentence in the deck, at any level. */
	total: number;
	/** The cases those sentences practise, in the usual case order. */
	cases: Case[];
	stat: DeckStat | undefined;
	/** Cases and numbers with enough right answers, out of those the level asks. */
	completion: DeckCompletion;
}

/**
 * The case and number cells (`deckCellKey`) a deck asks at a level: every
 * case and number its sentences there cover. Plurals count once the level
 * opens them, or always in a deck about both numbers. The deck is complete
 * when each has `DECK_CELL_TARGET` right answers.
 */
export function deckCells(
	def: FocusDef,
	templates: SentenceTemplate[],
	level: Difficulty
): string[] {
	const config = curriculum[level];
	const plural = def.bothNumbers === true || config.plural_unlocked !== false;
	const cells = new Set<string>();
	for (const t of templatesForFocus(templates, def.id)) {
		if (!config.unlocked_cases.includes(t.requiredCase)) continue;
		if (!config.unlocked_difficulty.includes(t.difficulty)) continue;
		if (t.number === 'pl' && !plural) continue;
		cells.add(deckCellKey(t.requiredCase, t.number));
	}
	return ALL_CASES.flatMap((c) => NUMBERS.map((n) => deckCellKey(c, n))).filter((k) =>
		cells.has(k)
	);
}

export function grammarDecks(
	level: Difficulty,
	templates: SentenceTemplate[],
	progress: DeckProgress
): GrammarDeck[] {
	const config = curriculum[level];
	return FOCUS_DEFS.map((def) => {
		const all = templatesForFocus(templates, def.id);
		const usable = all.filter(
			(t) =>
				config.unlocked_cases.includes(t.requiredCase) &&
				config.unlocked_difficulty.includes(t.difficulty)
		);
		const present = new Set(usable.map((t) => t.requiredCase));
		return {
			def,
			unlocked: focusUnlocked(def.id, level),
			sentences: usable.length,
			total: all.length,
			cases: ALL_CASES.filter((c) => present.has(c)),
			stat: progress[def.id],
			completion: deckCompletion(progress[def.id], deckCells(def, templates, level))
		};
	});
}

export interface ParadigmDeck {
	paradigm: Paradigm;
	attempts: number;
	correct: number;
}

const CELL_SUFFIX = /^_(nom|gen|dat|acc|voc|loc|ins)_(sg|pl)$/;

/**
 * Answers per noun paradigm, summed over its case and number cells
 * (`<paradigm>_<case>_<number>` keys in `paradigmScores`, e.g. `hrad_gen_sg`).
 * Other keys in that record (paradigm identification, adjective types) are
 * left out.
 */
export function paradigmDecks(paradigmScores: Record<string, CaseScore>): ParadigmDeck[] {
	return ALL_PARADIGMS.map((paradigm) => {
		let attempts = 0;
		let correct = 0;
		for (const [key, score] of Object.entries(paradigmScores)) {
			if (!key.startsWith(paradigm) || !CELL_SUFFIX.test(key.slice(paradigm.length))) continue;
			attempts += score.attempts;
			correct += score.correct;
		}
		return { paradigm, attempts, correct };
	});
}

/**
 * The sentence count on a deck card. Below the deck's full size it says so
 * ("18 of 27 sentences at A1"), so the learner knows more open up later.
 */
export function sentenceCountLabel(deck: GrammarDeck, level: Difficulty): string {
	if (!deck.unlocked || deck.sentences >= deck.total) return `${deck.total} sentences`;
	return `${deck.sentences} of ${deck.total} sentences at ${level}`;
}

/** The practice link for a grammar deck: `?deck=kam-kde-odkud`. */
export function deckQuery(deck: FocusTopic): string {
	const def = FOCUS_DEFS.find((d) => d.id === deck);
	if (!def) throw new Error(`Unknown deck "${deck}"`);
	return `?deck=${def.slug}`;
}
