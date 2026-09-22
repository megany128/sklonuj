import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type {
	Progress,
	DrillResult,
	DrillQuestion,
	WordEntry,
	SentenceTemplate,
	Case
} from '../types';
import { loadAdjectiveBank } from './adjective-drill';
import { loadPronounBank } from './pronoun-drill';
import { adjectiveCellKey, caseCellKey, nounCellKey, pronounCellKey } from './spacing';
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
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '2024-01-01',
			longestStreak: 0
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
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '',
			longestStreak: 0
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
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '',
			longestStreak: 0
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
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '',
			longestStreak: 0
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
		expect(() => pickWeightedCase([], () => [])).toThrow(
			'pickWeightedCase called with empty cases array'
		);
	});

	it('returns the only case when given a single-element array', () => {
		expect(pickWeightedCase(['gen'], () => [])).toBe('gen');
	});

	it('favors the case whose spacing cells are due or unseen', () => {
		const now = 1_000_000_000;
		// gen and dat cells were just practised; loc has never been seen.
		progress.set({
			level: 'A1',
			caseScores: {},
			paradigmScores: {},
			lemmaScores: {},
			cellSchedule: {
				[nounCellKey('hrad', 'gen', 'sg')]: { last: now, box: 2, streak: 2 },
				[nounCellKey('hrad', 'dat', 'sg')]: { last: now, box: 2, streak: 2 }
			},
			lastSession: '',
			longestStreak: 0
		});
		const keys = (c: Case): string[] => [nounCellKey('hrad', c, 'sg')];

		// Weights: gen 0.5, dat 0.5, loc 3 (new). Total 4: a draw of 0.3 lands on loc.
		expect(pickWeightedCase(['gen', 'dat', 'loc'], keys, now, () => 0.3)).toBe('loc');
		expect(pickWeightedCase(['gen', 'dat', 'loc'], keys, now, () => 0.1)).toBe('gen');
		expect(pickWeightedCase(['gen', 'dat', 'loc'], keys, now, () => 0.2)).toBe('dat');
	});

	it('favors a case that is overdue over one practised recently', () => {
		const now = 40 * 24 * 60 * 60 * 1000;
		progress.set({
			level: 'A1',
			caseScores: {},
			paradigmScores: {},
			lemmaScores: {},
			cellSchedule: {
				[nounCellKey('hrad', 'gen', 'sg')]: { last: now, box: 2, streak: 2 },
				[nounCellKey('hrad', 'loc', 'sg')]: { last: 0, box: 2, streak: 2 }
			},
			lastSession: '',
			longestStreak: 0
		});
		const keys = (c: Case): string[] => [nounCellKey('hrad', c, 'sg')];
		// gen 0.5 vs loc capped overdue 5.75: anything past gen's 8% slice is loc.
		expect(pickWeightedCase(['gen', 'loc'], keys, now, () => 0.5)).toBe('loc');
	});

	it('falls back to a uniform pick when no cells are supplied', () => {
		expect(
			pickWeightedCase(
				['gen', 'dat'],
				() => [],
				0,
				() => 0.51
			)
		).toBe('dat');
		expect(
			pickWeightedCase(
				['gen', 'dat'],
				() => [],
				0,
				() => 0.49
			)
		).toBe('gen');
	});
});

describe('cellSchedule recording', () => {
	beforeEach(() => {
		resetProgress();
	});

	it('records the noun cell on a noun drill', () => {
		recordResult(makeDrillResult(true));
		const state = get(progress).cellSchedule[nounCellKey('hrad', 'gen', 'sg')];
		expect(state).toBeDefined();
		expect(state.box).toBe(1);
		expect(state.streak).toBe(1);
		expect(state.last).toBeGreaterThan(0);
	});

	it('advances and demotes the same cell across results', () => {
		recordResult(makeDrillResult(true));
		recordResult(makeDrillResult(true));
		recordResult(makeDrillResult(true));
		expect(get(progress).cellSchedule[nounCellKey('hrad', 'gen', 'sg')].box).toBe(3);
		recordResult(makeDrillResult(false));
		const after = get(progress).cellSchedule[nounCellKey('hrad', 'gen', 'sg')];
		expect(after.box).toBe(1);
		expect(after.streak).toBe(0);
	});

	it('records the pronoun cell on a pronoun drill', () => {
		const pronoun = loadPronounBank().find((p) => p.lemma === 'já');
		expect(pronoun).toBeDefined();
		if (!pronoun) return;
		recordResult(
			makeDrillResult(true, {
				question: makeQuestion({ wordCategory: 'pronoun', pronoun, case: 'dat' })
			})
		);
		expect(get(progress).cellSchedule[pronounCellKey('já', 'dat', 'sg')]).toMatchObject({
			box: 1,
			streak: 1
		});
	});

	it('records the adjective cell (type × gender) on an adjective drill', () => {
		const adjective = loadAdjectiveBank().find((a) => a.paradigmType === 'hard');
		expect(adjective).toBeDefined();
		if (!adjective) return;
		recordResult(
			makeDrillResult(false, {
				question: makeQuestion({ wordCategory: 'adjective', adjective })
			})
		);
		// hrad is masculine inanimate.
		expect(
			get(progress).cellSchedule[adjectiveCellKey('hard', 'm_inanim', 'gen', 'sg')]
		).toMatchObject({ box: 0, streak: 0 });
	});

	it('moves the recognition cell, not the paradigm cell, on case identification', () => {
		recordResult(
			makeDrillResult(true, {
				question: makeQuestion({ drillType: 'case_identification', correctAnswer: 'gen' }),
				userAnswer: 'gen'
			})
		);
		const cells = get(progress).cellSchedule;
		expect(cells[nounCellKey('hrad', 'gen', 'sg')]).toBeUndefined();
		expect(cells[caseCellKey('gen', 'sg')]).toMatchObject({ box: 1, streak: 1 });
		// Lifetime stats still record it.
		expect(get(progress).caseScores['gen_sg']).toEqual({ attempts: 1, correct: 1 });
	});

	it('drops a cell one box on a skip instead of two', () => {
		for (let i = 0; i < 4; i++) recordResult(makeDrillResult(true));
		expect(get(progress).cellSchedule[nounCellKey('hrad', 'gen', 'sg')].box).toBe(4);
		recordResult(makeDrillResult(false, { userAnswer: '', skipped: true }));
		expect(get(progress).cellSchedule[nounCellKey('hrad', 'gen', 'sg')]).toMatchObject({
			box: 3,
			streak: 0
		});
	});

	it('drops a cell one box on a graded-wrong near-miss instead of two', () => {
		for (let i = 0; i < 4; i++) recordResult(makeDrillResult(true));
		recordResult(makeDrillResult(false, { userAnswer: 'hradu', nearMiss: true }));
		expect(get(progress).cellSchedule[nounCellKey('hrad', 'gen', 'sg')]).toMatchObject({
			box: 3,
			streak: 0
		});
	});

	it('is cleared by resetProgress', () => {
		recordResult(makeDrillResult(true));
		resetProgress();
		expect(get(progress).cellSchedule).toEqual({});
	});
});

describe('isValidProgress with cellSchedule', () => {
	const base = {
		level: 'A1',
		caseScores: {},
		paradigmScores: {},
		lemmaScores: {},
		lastSession: '',
		longestStreak: 0
	};

	it('accepts a payload without cellSchedule (older clients)', () => {
		expect(isValidProgress(base)).toBe(true);
	});

	it('accepts a well-formed cellSchedule', () => {
		expect(
			isValidProgress({
				...base,
				cellSchedule: { 'n:hrad:gen:sg': { last: 1, box: 1, streak: 1 } }
			})
		).toBe(true);
	});

	it('does not reject progress over a malformed cellSchedule (sanitised on load instead)', () => {
		expect(isValidProgress({ ...base, cellSchedule: { k: { last: 1, box: 7, streak: 1 } } })).toBe(
			true
		);
		expect(isValidProgress({ ...base, cellSchedule: [] })).toBe(true);
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
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '',
			longestStreak: 0
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
			lemmaScores: {},
			cellSchedule: {},
			lastSession: '2024-01-01',
			longestStreak: 0
		});
		setLevel('A2');
		const current = get(progress);
		expect(current.level).toBe('A2');
		expect(current.caseScores['gen_sg']).toEqual({ attempts: 5, correct: 3 });
		expect(current.lastSession).toBe('2024-01-01');
	});
});
