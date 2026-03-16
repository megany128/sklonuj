import { describe, expect, it } from 'vitest';
import {
	checkAnswer,
	generateFormProduction,
	generateCaseIdentification,
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
	it('returns non-empty array of templates', () => {
		const templates = loadTemplates();
		expect(templates.length).toBeGreaterThan(0);
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
			paradigmScores: {},
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
		expect(question.drillType).toBe('form_production');
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
		expect(question.drillType).toBe('sentence_fill_in');
	});
});

describe('generateCaseIdentification', () => {
	it('returns the case abbreviation as correctAnswer', () => {
		const templates = loadTemplates();
		const template = templates.find((t) => t.id === 'loc_v_001');
		expect(template).toBeDefined();
		if (!template) return;
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateCaseIdentification(template, dum);
		expect(question.correctAnswer).toBe('loc');
		expect(question.case).toBe('loc');
		expect(question.drillType).toBe('case_identification');
	});

	it('checkAnswer correctly validates case identification', () => {
		const templates = loadTemplates();
		const template = templates.find((t) => t.id === 'acc_vid_006');
		expect(template).toBeDefined();
		if (!template) return;
		const bank = loadWordBank();
		const word = bank[0];
		const question = generateCaseIdentification(template, word);
		const correct = checkAnswer(question, 'acc');
		expect(correct.correct).toBe(true);
		const wrong = checkAnswer(question, 'loc');
		expect(wrong.correct).toBe(false);
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

	it('near miss with wrong diacritics counts as correct with nearMiss true', () => {
		const bank = loadWordBank();
		const dum = bank.find((w) => w.lemma === 'dům');
		expect(dum).toBeDefined();
		if (!dum) return;
		const question = generateFormProduction(dum, 'loc', 'sg');
		// correctAnswer is "domě", user types "dome" (missing háček)
		const result = checkAnswer(question, 'dome');
		expect(result.correct).toBe(true);
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
			paradigmScores: {},
			lastSession: ''
		};
		const picked = weightedRandom(candidates, progress, 'nom', 'sg');
		expect(candidates).toContainEqual(picked);
	});

	it('favors words with lower per-paradigm accuracy', () => {
		const bank = loadWordBank();
		// Pick candidates with different paradigms so we can mark some as known
		const hrad = bank.find((w) => w.paradigm === 'hrad');
		const zena = bank.find((w) => w.paradigm === 'žena');
		const mesto = bank.find((w) => w.paradigm === 'město');
		expect(hrad).toBeDefined();
		expect(zena).toBeDefined();
		expect(mesto).toBeDefined();
		if (!hrad || !zena || !mesto) return;
		const candidates = [hrad, zena, mesto];
		// Mark hrad and žena paradigms as well-known, leave město unseen
		const progress: Progress = {
			level: 'A1',
			caseScores: {},
			paradigmScores: {
				['hrad_loc_sg']: { attempts: 20, correct: 20 },
				['žena_loc_sg']: { attempts: 20, correct: 20 }
			},
			lastSession: ''
		};

		const counts: Record<string, number> = {};
		for (const c of candidates) counts[c.paradigm] = 0;

		const iterations = 1000;
		for (let i = 0; i < iterations; i++) {
			const picked = weightedRandom(candidates, progress, 'loc', 'sg');
			counts[picked.paradigm]++;
		}

		// The unseen paradigm (accuracy=0, weight~10) should be picked much more often
		// than the well-known paradigms (accuracy=1, weight~0.91)
		expect(counts['město']).toBeGreaterThan(iterations * 0.7);
	});
});
