import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Case, DrillQuestion, WordEntry } from '../types';
import {
	caseIntroCard,
	deckIntroCard,
	isStruggling,
	loadSeenCards,
	markCardSeen,
	struggleCard,
	struggleKey,
	withStruggleAnswer
} from './learning-cards';
import { loadDeterminerBank } from './determiners';
import { loadWordBank } from './drill';

const noun = (lemma: string): WordEntry => {
	const w = loadWordBank().find((x) => x.lemma === lemma);
	if (!w) throw new Error(`no ${lemma}`);
	return w;
};

const ten = loadDeterminerBank().find((d) => d.lemma === 'ten');

/** A Ten, ta, to question: "Mluvíme o ___ jezeře." */
function tenQuestion(lemma: string, sentence: string, answer: string): DrillQuestion {
	if (!ten) throw new Error('no ten');
	return {
		word: noun(lemma),
		adjective: ten,
		template: {
			id: `t_${lemma}`,
			template: sentence,
			lemmaCategory: 'general',
			requiredCase: 'loc',
			number: 'sg',
			trigger: 'o',
			why: 'o (about) + topic → locative',
			difficulty: 'A2',
			nounLemma: lemma
		},
		correctAnswer: answer,
		case: 'loc',
		number: 'sg',
		drillType: 'sentence_fill_in',
		wordCategory: 'adjective'
	};
}

describe('intro cards', () => {
	it('has an intro for every case but the nominative', () => {
		expect(caseIntroCard('nom')).toBeNull();
		const cases: Case[] = ['gen', 'dat', 'acc', 'voc', 'loc', 'ins'];
		for (const c of cases) {
			const card = caseIntroCard(c);
			expect(card?.examples?.length).toBe(3);
			expect(card?.key).toBe(`case:${c}`);
		}
	});

	it('keeps the deck intro short, with the tenhle / tento note', () => {
		const card = deckIntroCard('demonstratives', 'Ten, ta, to');
		expect(card.rows?.length).toBe(3);
		expect(card.note?.bold).toBe('tenhle, tento');
		expect(card.line.length).toBeLessThan(60);
	});
});

describe('seen cards', () => {
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			}
		});
	});

	afterEach(() => vi.unstubAllGlobals());

	it('remembers what was seen on this device', () => {
		expect(loadSeenCards().has('case:dat')).toBe(false);
		markCardSeen('case:dat');
		markCardSeen('case:dat');
		expect([...loadSeenCards()]).toEqual(['case:dat']);
	});

	it('shrugs off a malformed store', () => {
		localStorage.setItem('sklonuj_seen_cards', '{"x":1}');
		expect(loadSeenCards().has('x')).toBe(false);
	});

	it('still counts a card as seen when storage refuses the write', () => {
		vi.stubGlobal('localStorage', {
			getItem: () => null,
			setItem: () => {
				throw new Error('QuotaExceededError');
			}
		});
		markCardSeen('deck:verbs');
		expect(loadSeenCards().has('deck:verbs')).toBe(true);
	});
});

describe('struggles', () => {
	it('needs 3 misses in the last 5, ending on a miss', () => {
		expect(isStruggling([false, false])).toBe(false);
		expect(isStruggling([false, true, false, false])).toBe(true);
		expect(isStruggling([false, false, false, true])).toBe(false);
		let log: Record<string, boolean[]> = {};
		for (const ok of [false, false, false, true, true, true, true])
			log = withStruggleAnswer(log, 'k', ok);
		expect(log.k).toEqual([false, true, true, true, true]);
	});

	it('keys adjective questions by the sentence noun’s gender', () => {
		expect(struggleKey(tenQuestion('jezero', 'Mluvíme o ___ jezeře.', 'tom'))).toBe('adj:loc:sg:n');
	});

	it('builds the rundown from the misses: rule, gender and the answered phrases', () => {
		const card = struggleCard('adj:loc:sg:n', [
			{ question: tenQuestion('město', 'Mluvíme o ___ městě.', 'tom'), typed: 'té' },
			{ question: tenQuestion('jezero', 'Mluvíme o ___ jezeře.', 'tom'), typed: 'te' }
		]);
		expect(card?.title).toBe('Locative · neuter');
		expect(card?.line).toBe('Neuter and masculine share this form. Té is only for feminine.');
		expect(card?.examples).toEqual([
			{ before: 'o ', bold: 'tom', after: ' jezeře' },
			{ before: 'o ', bold: 'tom', after: ' městě' }
		]);
		expect(card?.primary).toBe('Practise 5');
	});

	it('says when every gender shares the form', () => {
		const q = tenQuestion('jezero', 'Mluvíme o ___ jezerech.', 'těch');
		const plural: DrillQuestion = {
			...q,
			number: 'pl',
			template: { ...q.template, number: 'pl' }
		};
		const card = struggleCard('adj:loc:pl:n', [{ question: plural, typed: 'tech' }]);
		expect(card?.line).toBe('All genders share this form.');
	});
});
