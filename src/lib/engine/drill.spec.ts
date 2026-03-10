import { describe, expect, it } from 'vitest';
import {
	checkAnswer,
	generateFormProduction,
	generateSentenceDrill,
	getCandidates,
	loadTemplates,
	loadWordBank,
	weightedRandom
} from './drill.ts';
import type { Progress } from '../types.ts';

describe('loadWordBank', () => {
	it('returns non-empty array with expected shape', () => {
		const bank = loadWordBank();
		expect(bank.length).toBeGreaterThan(0);
		const first = bank[0];
		expect(first).toHaveProperty('lemma');
		expect(first).toHaveProperty('translation');
		expect(first).toHaveProperty('gender');
		expect(first).toHaveProperty('animate');
		expect(first).toHaveProperty('paradigm');
		expect(first).toHaveProperty('difficulty');
		expect(first).toHaveProperty('categories');
		expect(first).toHaveProperty('forms');
		expect(first.forms).toHaveProperty('sg');
		expect(first.forms).toHaveProperty('pl');
	});
});

describe('loadTemplates', () => {
	it('returns array with length 10', () => {
		const templates = loadTemplates();
		expect(templates.length).toBe(10);
	});
});

describe('getCandidates', () => {
	it('filters by category - places template returns only words with places category', () => {
		const templates = loadTemplates();
		const placesTemplate = templates.find((t) => t.lemmaCategory === 'places');
		expect(placesTemplate).toBeDefined();
		if (!placesTemplate) return;
		const progress: Progress = {
			level: 'B1',
			caseScores: {},
			lastSession: ''
		};
		const candidates = getCandidates(placesTemplate, progress);
		expect(candidates.length).toBeGreaterThan(0);
		for (const word of candidates) {
			expect(word.categories).toContain('places');
		}
	});
});

describe('generateFormProduction', () => {
	it('returns correct locative singular form for hrad', () => {
		const bank = loadWordBank();
		const hrad = bank.find((w) => w.lemma === 'hrad');
		expect(hrad).toBeDefined();
		if (!hrad) return;
		const question = generateFormProduction(hrad, 'loc', 'sg');
		expect(question.correctAnswer).toBe('hradu');
		expect(question.case).toBe('loc');
		expect(question.number).toBe('sg');
		expect(question.word.lemma).toBe('hrad');
	});
});

describe('generateSentenceDrill', () => {
	it('returns correct answer for known template + word combo', () => {
		const templates = loadTemplates();
		const template = templates.find((t) => t.id === 'loc_v_001');
		expect(template).toBeDefined();
		if (!template) return;
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateSentenceDrill(template, dum);
		// loc_v_001 requires loc sg; dům loc sg (index 5) = "domě"
		expect(question.correctAnswer).toBe('domě');
		expect(question.case).toBe('loc');
		expect(question.number).toBe('sg');
	});
});

describe('checkAnswer', () => {
	it('exact match returns correct true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		const result = checkAnswer(question, 'domě');
		expect(result.correct).toBe(true);
		expect(result.nearMiss).toBe(false);
	});

	it('near miss with wrong diacritics returns nearMiss true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		// correctAnswer is "domě", user types "dome" (missing háček)
		const result = checkAnswer(question, 'dome');
		expect(result.correct).toBe(false);
		expect(result.nearMiss).toBe(true);
	});

	it('wrong answer returns correct false and nearMiss false', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		// correctAnswer is "domě", user types "domu" — different base letters
		const result = checkAnswer(question, 'domu');
		expect(result.correct).toBe(false);
		expect(result.nearMiss).toBe(false);
	});
});

describe('weightedRandom', () => {
	it('returns a word from the candidates array', () => {
		const bank = loadWordBank();
		const candidates = bank.slice(0, 5);
		const progress: Progress = {
			level: 'A1',
			caseScores: {},
			lastSession: ''
		};
		const picked = weightedRandom(candidates, progress, 'nom', 'sg');
		expect(candidates).toContainEqual(picked);
	});
});
