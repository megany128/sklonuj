import { describe, expect, it } from 'vitest';
import type { Progress } from '../types.ts';
import { loadPronounBank, weightedRandomPronoun } from './pronoun-drill.ts';
import { pronounCellKey } from './spacing.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function progressWith(cellSchedule: Progress['cellSchedule']): Progress {
	return {
		level: 'A1',
		caseScores: {},
		paradigmScores: {},
		lemmaScores: {},
		cellSchedule,
		lastSession: '',
		longestStreak: 0
	};
}

describe('weightedRandomPronoun', () => {
	it('prefers the pronoun whose cell is due over one just practised', () => {
		const bank = loadPronounBank();
		const ja = bank.find((p) => p.lemma === 'já');
		const ty = bank.find((p) => p.lemma === 'ty');
		expect(ja).toBeDefined();
		expect(ty).toBeDefined();
		if (!ja || !ty) return;
		const now = 20 * DAY_MS;
		const progress = progressWith({
			[pronounCellKey('já', 'dat', 'sg')]: { last: now, box: 2, streak: 2 },
			[pronounCellKey('ty', 'dat', 'sg')]: { last: 0, box: 2, streak: 2 }
		});
		// já 0.5 vs ty 5.75: a mid draw lands on ty, a tiny one on já.
		expect(weightedRandomPronoun([ja, ty], progress, 'dat', 'sg', now, () => 0.5)).toBe(ty);
		expect(weightedRandomPronoun([ja, ty], progress, 'dat', 'sg', now, () => 0.01)).toBe(ja);
	});

	it('treats unseen pronouns alike and throws on an empty pool', () => {
		const bank = loadPronounBank().slice(0, 4);
		const progress = progressWith({});
		expect(weightedRandomPronoun(bank, progress, 'gen', 'sg', 0, () => 0.26)).toBe(bank[1]);
		expect(() => weightedRandomPronoun([], progress, 'gen', 'sg')).toThrow(
			'weightedRandomPronoun called with empty candidates array'
		);
	});
});
