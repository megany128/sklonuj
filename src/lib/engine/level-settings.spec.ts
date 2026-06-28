import { describe, expect, it } from 'vitest';
import curriculumData from '$lib/data/curriculum.json';
import { ALL_CASES, type Difficulty, type DrillType } from '$lib/types';
import type { CurriculumLevel } from './drill';
import { levelDefaultSettings } from './level-settings';

const curriculum: Record<string, CurriculumLevel> = curriculumData;
const LEVELS: Difficulty[] = ['A1', 'A2', 'B1', 'B2'];
const drillTypes: DrillType[] = ['form_production', 'case_identification'];

describe('levelDefaultSettings', () => {
	it('A1 enables nothing beyond singular nouns', () => {
		const s = levelDefaultSettings('A1', drillTypes);
		expect(s.contentMode).toBe('nouns');
		expect(s.wordMode).toBe('nouns');
		expect(s.numberMode).toBe('sg');
	});

	it('A2 turns on adjectives but keeps pronouns and plural off', () => {
		const s = levelDefaultSettings('A2', drillTypes);
		expect(s.contentMode).toBe('nouns'); // pronouns still locked
		expect(s.wordMode).toBe('both'); // adjectives unlocked
		expect(s.numberMode).toBe('sg'); // plural is 'sg_first' -> default singular
	});

	it('B1 and B2 turn on pronouns, adjectives, and plural', () => {
		for (const level of ['B1', 'B2'] as const) {
			const s = levelDefaultSettings(level, drillTypes);
			expect(s.contentMode).toBe('both');
			expect(s.wordMode).toBe('both');
			expect(s.numberMode).toBe('both');
		}
	});

	it('carries drill-type selection through unchanged (not level-gated)', () => {
		const custom: DrillType[] = ['multi_step', 'sentence_fill_in'];
		expect(levelDefaultSettings('B1', custom).selectedDrillTypes).toEqual(custom);
	});

	it('always selects all seven cases (case gating happens elsewhere)', () => {
		for (const level of LEVELS) {
			expect(levelDefaultSettings(level, drillTypes).selectedCases).toEqual([...ALL_CASES]);
		}
	});

	// Honesty check: the derived toggles must track curriculum.json so a future
	// matrix tweak can't silently drift from what the defaults auto-enable.
	it('mirrors curriculum.json unlock flags for every level', () => {
		for (const level of LEVELS) {
			const cfg = curriculum[level];
			const s = levelDefaultSettings(level, drillTypes);
			expect(s.contentMode).toBe(cfg.pronouns_unlocked ? 'both' : 'nouns');
			expect(s.wordMode).toBe(cfg.adjectives_unlocked ? 'both' : 'nouns');
			expect(s.numberMode).toBe(cfg.plural_unlocked === true ? 'both' : 'sg');
		}
	});
});
