import { describe, it, expect } from 'vitest';
import { filterParadigmNote } from './filter-paradigm-note';
import type { WordEntry } from '$lib/types';

function makeWord(lemma: string, overrides: Partial<WordEntry> = {}): WordEntry {
	return {
		lemma,
		translation: '',
		gender: 'm',
		animate: false,
		paradigm: 'hrad',
		categories: [],
		forms: {
			sg: [lemma, '', '', '', '', '', ''],
			pl: ['', '', '', '', '', '', '']
		},
		...overrides
	} as WordEntry;
}

const HRAD_LOC_SG =
	'Hrad-type nouns take -ě or -u in locative singular (e.g. na hradě, ve vlaku). Before -ě: k→c (rok → roce), r→ř (papír → papíře); nouns with h/ch take -u instead (e.g. břehu, smíchu). Nouns with a fleeting e drop it: dárek → dárku.';

describe('filterParadigmNote', () => {
	it('drops the "Before -ě:" sentence entirely for lemmas with no relevant alternation (e.g. stůl)', () => {
		const out = filterParadigmNote(HRAD_LOC_SG, makeWord('stůl'), 'loc', 'sg');
		expect(out).not.toContain('Before -ě:');
		expect(out).not.toContain('břehu');
		expect(out).toContain('na hradě, ve vlaku');
	});

	it('keeps "h/ch take -u" clause for lemmas ending in h or ch (e.g. břeh)', () => {
		const out = filterParadigmNote(HRAD_LOC_SG, makeWord('břeh'), 'loc', 'sg');
		expect(out).toContain('h/ch take -u');
		expect(out).toContain('břehu, smíchu');
	});

	it('keeps "k→c" clause for lemmas ending in k (e.g. rok)', () => {
		const out = filterParadigmNote(HRAD_LOC_SG, makeWord('rok'), 'loc', 'sg');
		expect(out).toContain('k→c');
		expect(out).toContain('Before -ě:');
	});

	it('does not split sentences on the period inside "e.g."', () => {
		const out = filterParadigmNote(HRAD_LOC_SG, makeWord('rok'), 'loc', 'sg');
		expect(out).toContain('(e.g. na hradě, ve vlaku)');
	});
});
