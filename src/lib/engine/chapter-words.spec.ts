import { describe, it, expect } from 'vitest';
import {
	CHAPTER_TIER_WEIGHTS,
	pickChapterPool,
	pickChapterTier,
	splitChapterPools
} from './chapter-words';

const w = (lemma: string) => ({ lemma });

/** Deterministic stand-in for Math.random: walks evenly through [0, 1). */
function sweep(steps: number): () => number {
	let i = 0;
	return () => (i++ % steps) / steps + 1 / (2 * steps);
}

describe('pickChapterTier', () => {
	it('splits picks by the tier weights', () => {
		const random = sweep(1000);
		const counts = { current: 0, previous: 0, general: 0 };
		for (let i = 0; i < 1000; i++) {
			const tier = pickChapterTier(() => true, random);
			if (tier) counts[tier]++;
		}
		expect(counts.current / 1000).toBeCloseTo(CHAPTER_TIER_WEIGHTS.current, 2);
		expect(counts.previous / 1000).toBeCloseTo(CHAPTER_TIER_WEIGHTS.previous, 2);
		expect(counts.general / 1000).toBeCloseTo(CHAPTER_TIER_WEIGHTS.general, 2);
	});

	it('skips tiers without words', () => {
		const random = sweep(100);
		for (let i = 0; i < 100; i++) {
			expect(pickChapterTier((t) => t === 'previous', random)).toBe('previous');
		}
		expect(pickChapterTier(() => false)).toBeNull();
	});
});

describe('pickChapterPool', () => {
	it('weighs earlier chapters per chapter, not per word', () => {
		const big = Array.from({ length: 500 }, (_, i) => w(`big${i}`));
		const small = [w('small')];
		const pools = { current: [], previous: [big, small, []], general: [] };
		const random = sweep(1000);
		let fromSmall = 0;
		for (let i = 0; i < 500; i++) {
			if (pickChapterPool(pools, random) === small) fromSmall++;
		}
		expect(fromSmall / 500).toBeCloseTo(0.5, 1);
	});

	it('returns an empty pool when nothing has words', () => {
		expect(pickChapterPool({ current: [], previous: [[]], general: [] })).toEqual([]);
	});
});

describe('splitChapterPools', () => {
	it('files each word once: current first, then its earliest chapter', () => {
		const words = ['Hrad', 'pes', 'kočka', 'stůl', 'dům'].map(w);
		const pools = splitChapterPools(
			words,
			['hrad'],
			[
				['pes', 'hrad'],
				['pes', 'kočka']
			],
			true
		);
		expect(pools.current.map((x) => x.lemma)).toEqual(['Hrad']);
		expect(pools.previous.map((ch) => ch.map((x) => x.lemma))).toEqual([['pes'], ['kočka']]);
		expect(pools.general.map((x) => x.lemma)).toEqual(['stůl', 'dům']);
	});

	it('leaves general empty when the chapter takes no general words', () => {
		expect(splitChapterPools([w('stůl')], [], [], false).general).toEqual([]);
	});
});
