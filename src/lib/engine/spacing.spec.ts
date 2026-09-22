import { describe, expect, it } from 'vitest';
import type { CellSchedule } from '../types.ts';
import {
	CELL_INTERVALS_MS,
	MAX_BOX,
	OVERDUE_CAP,
	W_DUE,
	W_FLOOR,
	W_MAX,
	W_NEW,
	adjectiveCellKey,
	adjectiveCellKeysForCase,
	advanceCell,
	caseCellKey,
	caseWeight,
	cellWeight,
	isValidCellState,
	mergeCellSchedules,
	nounCellKey,
	nounCellKeysForCase,
	pickSpacedCase,
	pronounCellKey,
	pronounCellKeysForCase,
	sanitizeCellSchedule,
	weightedPick
} from './spacing.ts';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

describe('cell keys', () => {
	it('builds distinct, prefixed keys per content type', () => {
		expect(nounCellKey('hrad', 'gen', 'sg')).toBe('n:hrad:gen:sg');
		expect(adjectiveCellKey('hard', 'm_anim', 'acc', 'pl')).toBe('a:hard:m_anim:acc:pl');
		expect(pronounCellKey('já', 'dat', 'sg')).toBe('p:já:dat:sg');
		expect(caseCellKey('loc', 'pl')).toBe('c:loc:pl');
	});

	it('expands paradigms × numbers for a case', () => {
		expect(nounCellKeysForCase(['hrad', 'žena'], 'loc', ['sg', 'pl'])).toEqual([
			'n:hrad:loc:sg',
			'n:hrad:loc:pl',
			'n:žena:loc:sg',
			'n:žena:loc:pl'
		]);
		expect(adjectiveCellKeysForCase(['hard'], ['f', 'n'], 'ins', ['sg'])).toEqual([
			'a:hard:f:ins:sg',
			'a:hard:n:ins:sg'
		]);
		expect(pronounCellKeysForCase(['on'], 'gen', ['pl'])).toEqual(['p:on:gen:pl']);
	});
});

describe('cellWeight', () => {
	it('gives never-seen cells the new weight', () => {
		expect(cellWeight(undefined, 0)).toBe(W_NEW);
	});

	it('sits at the floor right after an attempt', () => {
		expect(cellWeight({ last: 1000, box: 2, streak: 2 }, 1000)).toBe(W_FLOOR);
	});

	it('reaches the due weight exactly when the box interval has elapsed', () => {
		for (let box = 0; box <= MAX_BOX; box++) {
			const state = { last: 0, box, streak: 0 };
			expect(cellWeight(state, CELL_INTERVALS_MS[box])).toBeCloseTo(W_DUE);
		}
	});

	it('ramps linearly between floor and due', () => {
		const state = { last: 0, box: 1, streak: 1 };
		expect(cellWeight(state, DAY_MS / 2)).toBeCloseTo(W_FLOOR + (W_DUE - W_FLOOR) / 2);
	});

	it('caps overdue growth', () => {
		const state = { last: 0, box: 1, streak: 1 };
		expect(cellWeight(state, 100 * DAY_MS)).toBeCloseTo(W_MAX);
		expect(W_MAX).toBeCloseTo(W_FLOOR + (W_DUE - W_FLOOR) * OVERDUE_CAP);
	});

	it('treats a just-failed cell (box 0) as due again after ten minutes', () => {
		const state = { last: 0, box: 0, streak: 0 };
		expect(cellWeight(state, 10 * MINUTE_MS)).toBeCloseTo(W_DUE);
		expect(cellWeight(state, 5 * MINUTE_MS)).toBeLessThan(W_DUE);
	});

	it('ignores clock skew that puts last in the future', () => {
		expect(cellWeight({ last: 5000, box: 3, streak: 3 }, 1000)).toBe(W_FLOOR);
	});

	it('clamps an out-of-range box', () => {
		expect(cellWeight({ last: 0, box: 99, streak: 0 }, CELL_INTERVALS_MS[MAX_BOX])).toBeCloseTo(
			W_DUE
		);
		expect(cellWeight({ last: 0, box: -3, streak: 0 }, CELL_INTERVALS_MS[0])).toBeCloseTo(W_DUE);
	});
});

describe('advanceCell', () => {
	it('starts a new cell in box 1 on a correct answer', () => {
		expect(advanceCell(undefined, 'correct', 42)).toEqual({ last: 42, box: 1, streak: 1 });
	});

	it('starts a new cell in box 0 on a miss', () => {
		expect(advanceCell(undefined, 'incorrect', 42)).toEqual({ last: 42, box: 0, streak: 0 });
	});

	it('moves up one box per correct answer, capped at the top box', () => {
		let state = advanceCell(undefined, 'correct', 1);
		for (let i = 0; i < 10; i++) state = advanceCell(state, 'correct', i + 2);
		expect(state.box).toBe(MAX_BOX);
		expect(state.streak).toBe(11);
		expect(state.last).toBe(11);
	});

	it('drops two boxes on a miss, floored at zero, and resets the streak', () => {
		expect(advanceCell({ last: 0, box: 4, streak: 4 }, 'incorrect', 7)).toEqual({
			last: 7,
			box: 2,
			streak: 0
		});
		expect(advanceCell({ last: 0, box: 1, streak: 1 }, 'incorrect', 7)).toEqual({
			last: 7,
			box: 0,
			streak: 0
		});
	});
});

describe('advanceCell on skip', () => {
	it('drops one box on a skip, not two, and resets the streak', () => {
		expect(advanceCell({ last: 0, box: 5, streak: 9 }, 'skipped', 3)).toEqual({
			last: 3,
			box: 4,
			streak: 0
		});
		expect(advanceCell(undefined, 'skipped', 3)).toEqual({ last: 3, box: 0, streak: 0 });
	});
});

describe('weightedPick', () => {
	it('throws on an empty list', () => {
		expect(() => weightedPick([], [], () => 0)).toThrow(
			'weightedPick called with empty items array'
		);
	});

	it('picks proportionally and never lands on a zero-weight item', () => {
		const items = ['a', 'b', 'c'];
		expect(weightedPick(items, [0, 1, 3], () => 0)).toBe('b');
		expect(weightedPick(items, [0, 1, 3], () => 0.24)).toBe('b');
		expect(weightedPick(items, [0, 1, 3], () => 0.26)).toBe('c');
		expect(weightedPick(items, [0, 1, 3], () => 0.999)).toBe('c');
	});

	it('falls back to a uniform pick when every weight is zero', () => {
		const items = ['a', 'b', 'c'];
		expect(weightedPick(items, [0, 0, 0], () => 0.5)).toBe('b');
		expect(weightedPick(items, [-1, 0, 0], () => 0.9)).toBe('c');
	});
});

describe('caseWeight / pickSpacedCase', () => {
	const now = 30 * DAY_MS;
	const schedule: CellSchedule = {
		'n:hrad:gen:sg': { last: now, box: 3, streak: 3 }, // just seen
		'n:žena:gen:sg': { last: now, box: 3, streak: 3 }, // just seen
		'n:hrad:dat:sg': { last: now - 20 * DAY_MS, box: 2, streak: 2 } // long overdue
	};

	it('averages over the cells a case can drill and gives an undrillable case no weight', () => {
		expect(caseWeight(['n:hrad:gen:sg', 'n:žena:gen:sg'], schedule, now)).toBe(W_FLOOR);
		expect(caseWeight(['n:hrad:dat:sg', 'n:žena:dat:sg'], schedule, now)).toBeCloseTo(
			(W_MAX + W_NEW) / 2
		);
		expect(caseWeight([], schedule, now)).toBe(0);
	});

	it('never picks a case with no drillable cells while another has some', () => {
		const keys = (c: 'gen' | 'voc' | 'dat' | 'nom' | 'acc' | 'loc' | 'ins'): string[] =>
			c === 'voc' ? [] : ['n:hrad:gen:sg'];
		for (const draw of [0, 0.3, 0.7, 0.999]) {
			expect(pickSpacedCase(['voc', 'gen'], keys, schedule, now, () => draw)).toBe('gen');
		}
	});

	it('picks uniformly when no case has drillable cells', () => {
		expect(
			pickSpacedCase(
				['gen', 'dat'],
				() => [],
				schedule,
				now,
				() => 0.6
			)
		).toBe('dat');
	});

	it('throws on an empty case list', () => {
		expect(() => pickSpacedCase([], () => [], schedule, now)).toThrow(
			'pickSpacedCase called with empty cases array'
		);
	});

	it('returns the only case when given one', () => {
		expect(
			pickSpacedCase(
				['loc'],
				() => [],
				schedule,
				now,
				() => 0.99
			)
		).toBe('loc');
	});

	it('favours the case whose cells are due', () => {
		const keys = (c: 'gen' | 'dat' | 'loc' | 'nom' | 'acc' | 'voc' | 'ins'): string[] =>
			nounCellKeysForCase(['hrad', 'žena'], c, ['sg']);
		// gen weight 0.5, dat weight (5.75 + 3) / 2 = 4.375: any draw past
		// gen's slice lands on dat.
		expect(pickSpacedCase(['gen', 'dat'], keys, schedule, now, () => 0.2)).toBe('dat');
		expect(pickSpacedCase(['gen', 'dat'], keys, schedule, now, () => 0.05)).toBe('gen');
	});

	it('never picks a zero-weight slot when random returns exactly 0', () => {
		// Both cases carry positive weight, so a 0 draw is the first case.
		expect(
			pickSpacedCase(
				['gen', 'dat'],
				() => [],
				schedule,
				now,
				() => 0
			)
		).toBe('gen');
	});
});

describe('validation', () => {
	it('accepts well-formed states and rejects malformed ones', () => {
		expect(isValidCellState({ last: 0, box: 0, streak: 0 })).toBe(true);
		expect(isValidCellState({ last: 1, box: MAX_BOX, streak: 12 })).toBe(true);
		expect(isValidCellState({ last: -1, box: 0, streak: 0 })).toBe(false);
		expect(isValidCellState({ last: 0, box: MAX_BOX + 1, streak: 0 })).toBe(false);
		expect(isValidCellState({ last: 0, box: 1.5, streak: 0 })).toBe(false);
		expect(isValidCellState({ last: 0, box: 0, streak: -1 })).toBe(false);
		expect(isValidCellState({ last: Number.NaN, box: 0, streak: 0 })).toBe(false);
		expect(isValidCellState({ last: 0, box: 0 })).toBe(false);
		expect(isValidCellState(null)).toBe(false);
		expect(isValidCellState([])).toBe(false);
	});
});

describe('sanitizeCellSchedule', () => {
	it('keeps valid cells, drops malformed ones and clamps future timestamps', () => {
		const now = 5000;
		expect(
			sanitizeCellSchedule(
				{
					good: { last: 100, box: 2, streak: 2 },
					future: { last: 9999, box: 1, streak: 1 },
					badBox: { last: 100, box: 9, streak: 0 },
					badShape: { last: 100 },
					notObject: 4
				},
				now
			)
		).toEqual({
			good: { last: 100, box: 2, streak: 2 },
			future: { last: 5000, box: 1, streak: 1 }
		});
	});

	it('returns an empty schedule for anything that is not a record', () => {
		expect(sanitizeCellSchedule(undefined, 0)).toEqual({});
		expect(sanitizeCellSchedule(null, 0)).toEqual({});
		expect(sanitizeCellSchedule([], 0)).toEqual({});
		expect(sanitizeCellSchedule('x', 0)).toEqual({});
	});

	it('copies entries rather than aliasing the input', () => {
		const input = { k: { last: 1, box: 1, streak: 1 } };
		const out = sanitizeCellSchedule(input, 10);
		out['k'].box = 4;
		expect(input.k.box).toBe(1);
	});
});

describe('mergeCellSchedules', () => {
	it('keeps the more recently attempted state per cell and one-sided cells', () => {
		const local: CellSchedule = {
			shared: { last: 200, box: 2, streak: 2 },
			localOnly: { last: 50, box: 1, streak: 1 }
		};
		const remote: CellSchedule = {
			shared: { last: 100, box: 4, streak: 4 },
			remoteOnly: { last: 75, box: 0, streak: 0 }
		};
		expect(mergeCellSchedules(local, remote)).toEqual({
			shared: { last: 200, box: 2, streak: 2 },
			localOnly: { last: 50, box: 1, streak: 1 },
			remoteOnly: { last: 75, box: 0, streak: 0 }
		});
	});

	it('prefers remote when timestamps differ in its favour and local on a tie', () => {
		const tie = mergeCellSchedules(
			{ k: { last: 10, box: 1, streak: 1 } },
			{ k: { last: 10, box: 3, streak: 3 } }
		);
		expect(tie['k'].box).toBe(1);
		const remoteNewer = mergeCellSchedules(
			{ k: { last: 10, box: 1, streak: 1 } },
			{ k: { last: 11, box: 3, streak: 3 } }
		);
		expect(remoteNewer['k'].box).toBe(3);
	});

	it('does not mutate its inputs', () => {
		const local: CellSchedule = { k: { last: 1, box: 1, streak: 1 } };
		const remote: CellSchedule = {};
		const merged = mergeCellSchedules(local, remote);
		merged['k'].box = 5;
		expect(local['k'].box).toBe(1);
	});
});
