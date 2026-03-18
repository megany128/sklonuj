import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { Progress, DrillResult, DrillQuestion, WordEntry, SentenceTemplate } from '../types';
import {
	isValidProgress,
	isValidCaseScore,
	isValidScoresRecord,
	recordResult,
	resetProgress,
	getCombinedCaseStrength,
	pickWeightedCase,
	getAccuracy,
	setLevel,
	progress
} from './progress';

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

function makeDrillResult(correct: boolean, overrides: Partial<DrillResult> = {}): DrillResult {
	return {
		question: makeQuestion(),
		userAnswer: correct ? 'hradu' : 'wrong',
		correct,
		nearMiss: false,
		...overrides
	};
}

describe('isValidProgress', () => {
	it('accepts a valid progress object', () => {
		const valid: Progress = {
			level: 'A1',
			caseScores: { gen_sg: { attempts: 5, correct: 3 } },
			paradigmScores: {},
			lastSession: '2024-01-01'
		};
		expect(isValidProgress(valid)).toBe(true);
	});

	it('accepts valid progress with all levels', () => {
		for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
			const p = { level, caseScores: {}, paradigmScores: {}, lastSession: '' };
			expect(isValidProgress(p)).toBe(true);
		}
	});

	it('rejects null', () => {
		expect(isValidProgress(null)).toBe(false);
	});

	it('rejects a string', () => {
		expect(isValidProgress('hello')).toBe(false);
	});

	it('rejects an array', () => {
		expect(isValidProgress([])).toBe(false);
	});

	it('rejects object with invalid level', () => {
		expect(
			isValidProgress({ level: 'C1', caseScores: {}, paradigmScores: {}, lastSession: '' })
		).toBe(false);
	});

	it('rejects object with missing lastSession', () => {
		expect(isValidProgress({ level: 'A1', caseScores: {}, paradigmScores: {} })).toBe(false);
	});

	it('rejects object with non-string lastSession', () => {
		expect(
			isValidProgress({ level: 'A1', caseScores: {}, paradigmScores: {}, lastSession: 123 })
		).toBe(false);
	});

	it('rejects object with invalid caseScores', () => {
		expect(
			isValidProgress({
				level: 'A1',
				caseScores: { bad: 'not a score' },
				paradigmScores: {},
				lastSession: ''
			})
		).toBe(false);
	});

	it('rejects object with invalid paradigmScores', () => {
		expect(
			isValidProgress({
				level: 'A1',
				caseScores: {},
				paradigmScores: { bad: { attempts: 'wrong', correct: 0 } },
				lastSession: ''
			})
		).toBe(false);
	});

	it('accepts object with missing paradigmScores (backwards compatibility)', () => {
		const obj = { level: 'A1', caseScores: {}, lastSession: '' };
		expect(isValidProgress(obj)).toBe(true);
	});
});

describe('isValidCaseScore', () => {
	it('accepts valid CaseScore', () => {
		expect(isValidCaseScore({ attempts: 10, correct: 5 })).toBe(true);
	});

	it('rejects non-object', () => {
		expect(isValidCaseScore('string')).toBe(false);
	});

	it('rejects null', () => {
		expect(isValidCaseScore(null)).toBe(false);
	});

	it('rejects missing attempts', () => {
		expect(isValidCaseScore({ correct: 5 })).toBe(false);
	});

	it('rejects missing correct', () => {
		expect(isValidCaseScore({ attempts: 5 })).toBe(false);
	});
});

describe('isValidScoresRecord', () => {
	it('accepts empty object', () => {
		expect(isValidScoresRecord({})).toBe(true);
	});

	it('accepts valid scores record', () => {
		expect(isValidScoresRecord({ gen_sg: { attempts: 3, correct: 2 } })).toBe(true);
	});

	it('rejects record with invalid score entry', () => {
		expect(isValidScoresRecord({ gen_sg: 'bad' })).toBe(false);
	});

	it('rejects non-object', () => {
		expect(isValidScoresRecord(42)).toBe(false);
	});
});

describe('recordResult', () => {
	beforeEach(() => {
		resetProgress();
	});

	it('creates correct case key from case and number', () => {
		const result = makeDrillResult(true);
		recordResult(result);

		const current = get(progress);
		expect(current).toBeDefined();
		expect(current.caseScores).toHaveProperty('gen_sg');
		expect(current.caseScores['gen_sg']).toEqual({ attempts: 1, correct: 1 });
	});

	it('creates correct paradigm key from paradigm, case, and number', () => {
		const result = makeDrillResult(true);
		recordResult(result);

		const current = get(progress);
		expect(current.paradigmScores).toHaveProperty('hrad_gen_sg');
		expect(current.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 1, correct: 1 });
	});

	it('increments attempts for incorrect answer without incrementing correct', () => {
		const result = makeDrillResult(false);
		recordResult(result);

		const current = get(progress);
		expect(current.caseScores['gen_sg']).toEqual({ attempts: 1, correct: 0 });
		expect(current.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 1, correct: 0 });
	});

	it('accumulates multiple results correctly', () => {
		recordResult(makeDrillResult(true));
		recordResult(makeDrillResult(true));
		recordResult(makeDrillResult(false));

		const current = get(progress);
		expect(current.caseScores['gen_sg']).toEqual({ attempts: 3, correct: 2 });
		expect(current.paradigmScores['hrad_gen_sg']).toEqual({ attempts: 3, correct: 2 });
	});

	it('sets lastSession to current date', () => {
		recordResult(makeDrillResult(true));

		const current = get(progress);
		const today = new Date().toISOString().slice(0, 10);
		expect(current.lastSession).toBe(today);
	});

	it('tracks different case keys independently', () => {
		const genResult = makeDrillResult(true);
		const accResult = makeDrillResult(true, {
			question: makeQuestion({ case: 'acc', number: 'pl', correctAnswer: 'hrady' })
		});

		recordResult(genResult);
		recordResult(accResult);

		const current = get(progress);
		expect(current.caseScores['gen_sg']).toEqual({ attempts: 1, correct: 1 });
		expect(current.caseScores['acc_pl']).toEqual({ attempts: 1, correct: 1 });
	});
});

describe('resetProgress', () => {
	it('resets to initial state', () => {
		recordResult(makeDrillResult(true));
		resetProgress();

		const current = get(progress);
		expect(current).toEqual({
			level: 'A1',
			caseScores: {},
			paradigmScores: {},
			lastSession: ''
		});
	});
});

describe('getCombinedCaseStrength', () => {
	beforeEach(() => {
		resetProgress();
	});

	it('returns zero accuracy and attempts for unseen case', () => {
		const strength = getCombinedCaseStrength('gen');
		expect(strength).toEqual({ accuracy: 0, attempts: 0 });
	});

	it('combines sg and pl scores correctly', () => {
		progress.set({
			level: 'A1',
			caseScores: {
				gen_sg: { attempts: 10, correct: 8 },
				gen_pl: { attempts: 10, correct: 6 }
			},
			paradigmScores: {},
			lastSession: ''
		});

		const strength = getCombinedCaseStrength('gen');
		expect(strength.attempts).toBe(20);
		expect(strength.accuracy).toBeCloseTo(14 / 20);
	});

	it('handles case with only sg scores', () => {
		progress.set({
			level: 'A1',
			caseScores: {
				dat_sg: { attempts: 5, correct: 3 }
			},
			paradigmScores: {},
			lastSession: ''
		});

		const strength = getCombinedCaseStrength('dat');
		expect(strength.attempts).toBe(5);
		expect(strength.accuracy).toBeCloseTo(3 / 5);
	});
});

describe('pickWeightedCase', () => {
	beforeEach(() => {
		resetProgress();
	});

	it('throws on empty array', () => {
		expect(() => pickWeightedCase([])).toThrow('pickWeightedCase called with empty cases array');
	});

	it('returns the only case when given a single-element array', () => {
		expect(pickWeightedCase(['gen'])).toBe('gen');
	});

	it('favors cases with lower accuracy (statistical test)', () => {
		// Mark gen and dat as well-known, leave loc unseen
		progress.set({
			level: 'A1',
			caseScores: {
				gen_sg: { attempts: 20, correct: 20 },
				gen_pl: { attempts: 20, correct: 20 },
				dat_sg: { attempts: 20, correct: 20 },
				dat_pl: { attempts: 20, correct: 20 }
			},
			paradigmScores: {},
			lastSession: ''
		});

		const counts: Record<string, number> = { gen: 0, dat: 0, loc: 0 };
		const iterations = 1000;
		for (let i = 0; i < iterations; i++) {
			const picked = pickWeightedCase(['gen', 'dat', 'loc']);
			counts[picked]++;
		}

		// Unseen case (loc, weight=3) should be picked much more often than
		// well-known cases (gen/dat, weight ~= 1/(1+0.1) ~= 0.91)
		expect(counts['loc']).toBeGreaterThan(iterations * 0.5);
	});
});

describe('getAccuracy', () => {
	beforeEach(() => {
		resetProgress();
	});

	it('returns 0 for unseen case key', () => {
		expect(getAccuracy('gen_sg')).toBe(0);
	});

	it('returns correct accuracy for existing case key', () => {
		progress.set({
			level: 'A1',
			caseScores: { gen_sg: { attempts: 10, correct: 7 } },
			paradigmScores: {},
			lastSession: ''
		});
		expect(getAccuracy('gen_sg')).toBeCloseTo(0.7);
	});
});

describe('setLevel', () => {
	beforeEach(() => {
		resetProgress();
	});

	it('updates the level', () => {
		setLevel('B1');
		const current = get(progress);
		expect(current.level).toBe('B1');
	});

	it('preserves other progress fields', () => {
		progress.set({
			level: 'A1',
			caseScores: { gen_sg: { attempts: 5, correct: 3 } },
			paradigmScores: {},
			lastSession: '2024-01-01'
		});
		setLevel('A2');
		const current = get(progress);
		expect(current.level).toBe('A2');
		expect(current.caseScores['gen_sg']).toEqual({ attempts: 5, correct: 3 });
		expect(current.lastSession).toBe('2024-01-01');
	});
});
