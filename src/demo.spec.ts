import { describe, it, expect, beforeEach } from 'vitest';
import {
	checkAnswer,
	generateFormProduction,
	generateSentenceDrill,
	loadWordBank
} from '$lib/engine/drill';
import { recordResult, resetProgress } from '$lib/engine/progress';
import { mergeProgress } from '$lib/engine/progress-merge';
import type { WordEntry, SentenceTemplate, DrillQuestion } from '$lib/types';

function makeWordEntry(overrides: Partial<WordEntry> = {}): WordEntry {
	return {
		lemma: 'hrad',
		translation: 'castle',
		gender: 'm',
		animate: false,
		paradigm: 'hrad',
		difficulty: 'A1',
		categories: ['places'],
		forms: {
			sg: ['hrad', 'hradu', 'hradu', 'hrad', 'hrade', 'hradě', 'hradem'],
			pl: ['hrady', 'hradů', 'hradům', 'hrady', 'hrady', 'hradech', 'hrady']
		},
		...overrides
	};
}

function makeTemplate(overrides: Partial<SentenceTemplate> = {}): SentenceTemplate {
	return {
		id: 'test_001',
		template: 'Jdu do ___.',
		lemmaCategory: 'places',
		requiredCase: 'gen',
		number: 'sg',
		trigger: 'do',
		why: 'test',
		difficulty: 'A1',
		...overrides
	};
}

function makeQuestion(overrides: Partial<DrillQuestion> = {}): DrillQuestion {
	return {
		word: makeWordEntry(),
		template: makeTemplate(),
		correctAnswer: 'hradu',
		case: 'gen',
		number: 'sg',
		drillType: 'form_production',
		...overrides
	};
}

describe('checkAnswer', () => {
	it('returns correct: true for exact match', () => {
		const question = makeQuestion({ correctAnswer: 'hradu' });
		const result = checkAnswer(question, 'hradu');
		expect(result).toBeDefined();
		expect(result?.correct).toBe(true);
		expect(result?.nearMiss).toBe(false);
	});

	it('returns correct: false for wrong answer', () => {
		const question = makeQuestion({ correctAnswer: 'hradu' });
		const result = checkAnswer(question, 'hrade');
		expect(result).toBeDefined();
		expect(result?.correct).toBe(false);
	});

	it('returns nearMiss: true for missing diacritics at A1 level', () => {
		const question = makeQuestion({ correctAnswer: 'hradu' });
		const result = checkAnswer(question, 'hradu', 'A1');
		expect(result).toBeDefined();
		expect(result?.correct).toBe(true);
		expect(result?.nearMiss).toBe(false);
	});

	it('marks missing diacritics as wrong at B1 level', () => {
		const question = makeQuestion({ correctAnswer: 'hradě' });
		const result = checkAnswer(question, 'hrade', 'B1');
		expect(result).toBeDefined();
		expect(result?.correct).toBe(false);
		expect(result?.nearMiss).toBe(true);
	});

	it('is case-insensitive', () => {
		const question = makeQuestion({ correctAnswer: 'hradu' });
		const result = checkAnswer(question, 'HRADU');
		expect(result).toBeDefined();
		expect(result?.correct).toBe(true);
	});

	it('trims whitespace', () => {
		const question = makeQuestion({ correctAnswer: 'hradu' });
		const result = checkAnswer(question, '  hradu  ');
		expect(result).toBeDefined();
		expect(result?.correct).toBe(true);
	});

	it('returns null for empty correct answer', () => {
		const question = makeQuestion({ correctAnswer: '' });
		const result = checkAnswer(question, 'anything');
		expect(result).toBeNull();
	});
});

describe('loadWordBank', () => {
	it('returns a non-empty array', () => {
		const wordBank = loadWordBank();
		expect(Array.isArray(wordBank)).toBe(true);
		expect(wordBank.length).toBeGreaterThan(0);
	});

	it('returns word entries with expected properties', () => {
		const wordBank = loadWordBank();
		const firstWord = wordBank[0];
		expect(firstWord).toBeDefined();
		expect(typeof firstWord.lemma).toBe('string');
		expect(typeof firstWord.translation).toBe('string');
		expect(['m', 'f', 'n']).toContain(firstWord.gender);
		expect(typeof firstWord.animate).toBe('boolean');
		expect(typeof firstWord.paradigm).toBe('string');
		expect(['A1', 'A2', 'B1', 'B2']).toContain(firstWord.difficulty);
		expect(Array.isArray(firstWord.categories)).toBe(true);
		expect(firstWord.forms).toBeDefined();
		expect(Array.isArray(firstWord.forms.sg)).toBe(true);
		expect(Array.isArray(firstWord.forms.pl)).toBe(true);
		expect(firstWord.forms.sg.length).toBe(7);
		expect(firstWord.forms.pl.length).toBe(7);
	});

	it('caches results on subsequent calls', () => {
		const first = loadWordBank();
		const second = loadWordBank();
		expect(first).toBe(second);
	});
});

describe('generateFormProduction', () => {
	it('generates a valid question with correct answer', () => {
		const word = makeWordEntry();
		const question = generateFormProduction(word, 'gen', 'sg');
		expect(question).toBeDefined();
		expect(question?.word).toBe(word);
		expect(question?.correctAnswer).toBe('hradu');
		expect(question?.case).toBe('gen');
		expect(question?.number).toBe('sg');
		expect(question?.drillType).toBe('form_production');
	});

	it('returns null when form is empty', () => {
		const word = makeWordEntry({
			forms: {
				sg: ['', '', '', '', '', '', ''],
				pl: ['hrady', 'hradů', 'hradům', 'hrady', 'hrady', 'hradech', 'hrady']
			}
		});
		const question = generateFormProduction(word, 'nom', 'sg');
		expect(question).toBeNull();
	});

	it('generates questions for different cases and numbers', () => {
		const word = makeWordEntry();
		const sgGen = generateFormProduction(word, 'gen', 'sg');
		const plAcc = generateFormProduction(word, 'acc', 'pl');
		expect(sgGen?.correctAnswer).toBe('hradu');
		expect(plAcc?.correctAnswer).toBe('hrady');
	});
});

describe('generateSentenceDrill', () => {
	it('generates a valid sentence drill question', () => {
		const template = makeTemplate();
		const word = makeWordEntry();
		const question = generateSentenceDrill(template, word);
		expect(question).toBeDefined();
		expect(question?.word).toBe(word);
		expect(question?.template).toBe(template);
		expect(question?.correctAnswer).toBe('hradu');
		expect(question?.case).toBe('gen');
		expect(question?.number).toBe('sg');
		expect(question?.drillType).toBe('sentence_fill_in');
	});

	it('returns null when form is empty', () => {
		const template = makeTemplate({ requiredCase: 'nom', number: 'sg' });
		const word = makeWordEntry({
			forms: {
				sg: ['', '', '', '', '', '', ''],
				pl: ['hrady', 'hradů', 'hradům', 'hrady', 'hrady', 'hradech', 'hrady']
			}
		});
		const question = generateSentenceDrill(template, word);
		expect(question).toBeNull();
	});
});

describe('recordResult and resetProgress', () => {
	beforeEach(() => {
		resetProgress();
	});

	it('recordResult tracks correct answers', () => {
		const question = makeQuestion();
		const result = {
			question,
			userAnswer: 'hradu',
			correct: true,
			nearMiss: false
		};
		expect(() => recordResult(result)).not.toThrow();
	});

	it('resetProgress clears all progress data', () => {
		const question = makeQuestion();
		const result = {
			question,
			userAnswer: 'hradu',
			correct: true,
			nearMiss: false
		};
		recordResult(result);
		expect(() => resetProgress()).not.toThrow();
	});
});

describe('mergeProgress', () => {
	it('merges two progress objects without throwing', () => {
		const local = {
			level: 'A1' as const,
			caseScores: { gen_sg: { attempts: 5, correct: 3 } },
			paradigmScores: {},
			lastSession: '2024-01-01',
			longestStreak: 0
		};
		const remote = {
			level: 'A1' as const,
			caseScores: { acc_sg: { attempts: 3, correct: 2 } },
			paradigmScores: {},
			lastSession: '2024-01-02',
			longestStreak: 0
		};
		const merged = mergeProgress(local, remote);
		expect(merged).toBeDefined();
		expect(merged.caseScores).toHaveProperty('gen_sg');
		expect(merged.caseScores).toHaveProperty('acc_sg');
	});
});
