// Static accessor for src/lib/data/lemma_blocks.json — the baked snapshot of
// per-template lemma blocks the admin dashboard mutates. Drill engines (noun /
// adjective / pronoun) call `getBlockedLemmaSet(type, templateId)` to filter
// blocked lemmas out of their candidate pool with O(1) lookup.
//
// Update by running `pnpm audit:bake-blocks` (reads Supabase via service-role)
// then committing the regenerated JSON.

import lemmaBlocksData from '../data/lemma_blocks.json';

type TemplateType = 'sentence' | 'adjective' | 'pronoun';

interface LemmaBlocksFile {
	sentence: Record<string, string[]>;
	adjective: Record<string, string[]>;
	pronoun: Record<string, string[]>;
}

const blocks: LemmaBlocksFile = lemmaBlocksData;

const setCache: Record<TemplateType, Map<string, ReadonlySet<string>>> = {
	sentence: new Map(),
	adjective: new Map(),
	pronoun: new Map()
};

const EMPTY_SET: ReadonlySet<string> = new Set();

/** O(1)-on-cache-hit lookup of blocked lemmas for a given (type, templateId). */
export function getBlockedLemmaSet(type: TemplateType, templateId: string): ReadonlySet<string> {
	const cache = setCache[type];
	const cached = cache.get(templateId);
	if (cached) return cached;
	const list = blocks[type][templateId];
	if (!Array.isArray(list) || list.length === 0) {
		cache.set(templateId, EMPTY_SET);
		return EMPTY_SET;
	}
	const set: ReadonlySet<string> = new Set(list);
	cache.set(templateId, set);
	return set;
}

/**
 * Test-only escape hatch: clear the per-template cache so a test that mutates
 * the underlying JSON (or stubs it) can re-read fresh data. Production code
 * should never call this.
 */
export function _resetLemmaBlockCacheForTests(): void {
	setCache.sentence.clear();
	setCache.adjective.clear();
	setCache.pronoun.clear();
}
