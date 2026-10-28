/**
 * Which words a KzK chapter session drills. Pure module: the page builds the
 * pools (the chapter's own nouns, each earlier chapter's, and the level's
 * general nouns) and this picks the one the next question comes from.
 */

export type ChapterTier = 'current' | 'previous' | 'general';

export interface ChapterPools<T> {
	/** The selected chapter's own words. */
	current: T[];
	/** One list per earlier chapter of the book. */
	previous: T[][];
	/** Words from no chapter up to this one; empty when the chapter takes none. */
	general: T[];
}

/**
 * Share of questions per tier. Earlier chapters count per chapter, not per
 * word, so a book's hundreds of earlier nouns can't swamp the new ones.
 */
export const CHAPTER_TIER_WEIGHTS: Record<ChapterTier, number> = {
	current: 0.7,
	previous: 0.25,
	general: 0.05
};

/** General words join from this chapter (0-based index 12 = lesson 13) on. */
export const GENERAL_WORDS_FROM_CHAPTER_INDEX = 12;

const TIERS: ChapterTier[] = ['current', 'previous', 'general'];

/**
 * Pick a tier by `CHAPTER_TIER_WEIGHTS`, renormalised over the tiers that
 * have words. Null when none has.
 */
export function pickChapterTier(
	has: (tier: ChapterTier) => boolean,
	random: () => number = Math.random
): ChapterTier | null {
	const available = TIERS.filter(has);
	const total = available.reduce((sum, tier) => sum + CHAPTER_TIER_WEIGHTS[tier], 0);
	let roll = random() * total;
	for (const tier of available) {
		roll -= CHAPTER_TIER_WEIGHTS[tier];
		if (roll < 0) return tier;
	}
	return available.at(-1) ?? null;
}

/**
 * The words the next question picks from: one tier's words, and for earlier
 * chapters a single chapter chosen uniformly among those with words. Empty
 * when no pool has any.
 */
export function pickChapterPool<T>(
	pools: ChapterPools<T>,
	random: () => number = Math.random
): T[] {
	const earlier = pools.previous.filter((words) => words.length > 0);
	const tier = pickChapterTier(
		(t) =>
			t === 'current'
				? pools.current.length > 0
				: t === 'previous'
					? earlier.length > 0
					: pools.general.length > 0,
		random
	);
	if (tier === 'current') return pools.current;
	if (tier === 'general') return pools.general;
	if (tier === 'previous') return earlier[Math.floor(random() * earlier.length)];
	return [];
}

/**
 * Split `words` into chapter pools by lemma (case-insensitive). A lemma in
 * the current chapter counts only there; one listed in several earlier
 * chapters counts in the first. `general` is the words in no chapter, kept
 * only when `withGeneral`.
 */
export function splitChapterPools<T extends { lemma: string }>(
	words: T[],
	currentLemmas: string[],
	previousChapters: string[][],
	withGeneral: boolean
): ChapterPools<T> {
	const chapterOf = new Map<string, number>();
	previousChapters.forEach((lemmas, i) => {
		for (const l of lemmas) if (!chapterOf.has(l.toLowerCase())) chapterOf.set(l.toLowerCase(), i);
	});
	const currentSet = new Set(currentLemmas.map((l) => l.toLowerCase()));
	const pools: ChapterPools<T> = {
		current: [],
		previous: previousChapters.map(() => []),
		general: []
	};
	for (const w of words) {
		const key = w.lemma.toLowerCase();
		const earlier = chapterOf.get(key);
		if (currentSet.has(key)) pools.current.push(w);
		else if (earlier !== undefined) pools.previous[earlier].push(w);
		else if (withGeneral) pools.general.push(w);
	}
	return pools;
}
