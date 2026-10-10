import { describe, it, expect } from 'vitest';
import { adjectiveMatchesNoun, loadAdjectiveBank } from './adjective-drill';
import { getCandidates, hasValidForm, loadTemplates, loadWordBank } from './drill';
import type { AdjectiveEntry, Progress, WordEntry } from '../types';

const bank = loadWordBank();
const adjectives = loadAdjectiveBank();

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

function adjective(lemma: string): AdjectiveEntry {
	const a = adjectives.find((x) => x.lemma === lemma);
	if (!a) throw new Error(`missing adjective ${lemma}`);
	return a;
}

const PERSON_CATEGORIES = ['people', 'family', 'profession', 'nationality'];

describe('field and usefulness adjectives on people', () => {
	const FIELD = ['politický', 'vědecký', 'společenský', 'historický', 'praktický'];

	it('are the domain and utility profiles', () => {
		for (const lemma of FIELD) {
			expect(['domain', 'utility'], lemma).toContain(adjective(lemma).profile);
		}
	});

	it('never describe a person, whichever noun it is', () => {
		const allowed = new Set([
			'praktický|lékař',
			'praktický|lékařka',
			'vědecký|pracovník',
			'vědecký|pracovnice',
			'politický|poradce'
		]);
		const people = bank.filter((w) => w.categories.some((c) => PERSON_CATEGORIES.includes(c)));
		expect(people.length).toBeGreaterThan(400);
		for (const lemma of FIELD) {
			const adj = adjective(lemma);
			const taken = people
				.filter((w) => adjectiveMatchesNoun(adj, w))
				.map((w) => `${lemma}|${w.lemma}`);
			for (const pair of taken) expect(allowed.has(pair), pair).toBe(true);
		}
	});

	it('covers the older nouns that had no pair-by-pair block', () => {
		for (const noun of ['novinář', 'herec', 'ředitel', 'učitelka', 'soused', 'bratr']) {
			expect(adjectiveMatchesNoun(adjective('vědecký'), word(noun)), noun).toBe(false);
			expect(adjectiveMatchesNoun(adjective('společenský'), word(noun)), noun).toBe(false);
		}
	});

	it('keeps the fixed terms and the things these adjectives do describe', () => {
		expect(adjectiveMatchesNoun(adjective('praktický'), word('lékař'))).toBe(true);
		expect(adjectiveMatchesNoun(adjective('vědecký'), word('pracovník'))).toBe(true);
		expect(adjectiveMatchesNoun(adjective('politický'), word('poradce'))).toBe(true);
		expect(adjectiveMatchesNoun(adjective('historický'), word('budova'))).toBe(true);
		expect(adjectiveMatchesNoun(adjective('praktický'), word('taška'))).toBe(true);
		expect(adjectiveMatchesNoun(adjective('politický'), word('strana'))).toBe(true);
	});

	it('leaves ordinary adjectives on people alone', () => {
		for (const lemma of ['mladý', 'starý', 'nový', 'dobrý']) {
			expect(adjectiveMatchesNoun(adjective(lemma), word('učitel')), lemma).toBe(true);
		}
	});
});

describe('favorit', () => {
	const favorit = word('favorit');
	const b2: Progress = {
		level: 'B2',
		caseScores: {},
		paradigmScores: {},
		lemmaScores: {},
		cellSchedule: {},
		lastSession: '',
		longestStreak: 0
	};

	it('is a person: masculine animate, like pán', () => {
		expect(favorit.gender).toBe('m');
		expect(favorit.animate).toBe(true);
		expect(favorit.paradigm).toBe('pán');
		expect(favorit.categories).toContain('people');
		expect(favorit.forms.sg).toEqual([
			'favorit',
			'favorita',
			'favoritovi',
			'favorita',
			'favorite',
			'favoritovi',
			'favoritem'
		]);
		expect(favorit.forms.pl).toEqual([
			'favorité',
			'favoritů',
			'favoritům',
			'favority',
			'favorité',
			'favoritech',
			'favority'
		]);
		expect(favorit.variantForms?.sg).toEqual({ 2: ['favoritu'], 5: ['favoritu'] });
		expect(favorit.variantForms?.pl).toEqual({ 0: ['favoriti'], 4: ['favoriti'] });
	});

	it('is asked in sentences about people', () => {
		const frames = loadTemplates()
			.filter((t) => getCandidates(t, b2).some((w) => w.lemma === 'favorit'))
			.map((t) => t.id);
		expect(frames).toContain('acc_znam_033');
		expect(frames).toContain('dat_verit_100');
		expect(hasValidForm(favorit, 'acc', 'sg')).toBe(true);
	});
});
