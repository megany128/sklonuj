import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWordBank } from './drill';
import { loadAdjectiveBank } from './adjective-drill';
import { loadPronounBank } from './pronoun-drill';
import {
	isMistakeLemmaInBank,
	parseMistakeRecords,
	type BankLemmaSets,
	type MistakeRecord,
	loadBankLemmaSets
} from './mistakes';

const STORAGE_KEY = 'sklonuj_mistakes';

function makeMistake(overrides: Partial<MistakeRecord> = {}): MistakeRecord {
	return {
		lemma: 'hrad',
		translation: 'castle',
		targetCase: 'gen',
		targetNumber: 'sg',
		userAnswer: 'hrada',
		correctAnswer: 'hradu',
		drillType: 'form_production',
		timestamp: '2026-10-01T10:00:00.000Z',
		...overrides
	};
}

/** Small hand-made banks, so each test controls exactly which lemmas exist. */
const BANKS: BankLemmaSets = {
	noun: new Set(['hrad', 'žena']),
	adjective: new Set(['nový']),
	pronoun: new Set(['já'])
};

function lemmas(records: MistakeRecord[]): string[] {
	return records.map((m) => m.lemma);
}

describe('isMistakeLemmaInBank', () => {
	it('keeps a noun mistake whose lemma is in the noun bank', () => {
		expect(isMistakeLemmaInBank(makeMistake({ wordCategory: 'noun' }), BANKS)).toBe(true);
	});

	it('drops a noun mistake whose lemma was removed from the noun bank', () => {
		expect(
			isMistakeLemmaInBank(makeMistake({ lemma: 'trojice', wordCategory: 'noun' }), BANKS)
		).toBe(false);
	});

	it('judges an adjective mistake against the adjective bank only', () => {
		expect(
			isMistakeLemmaInBank(makeMistake({ lemma: 'nový', wordCategory: 'adjective' }), BANKS)
		).toBe(true);
		// A noun lemma is not an adjective, and a removed adjective is gone.
		expect(
			isMistakeLemmaInBank(makeMistake({ lemma: 'hrad', wordCategory: 'adjective' }), BANKS)
		).toBe(false);
		expect(
			isMistakeLemmaInBank(makeMistake({ lemma: 'starý', wordCategory: 'adjective' }), BANKS)
		).toBe(false);
	});

	it('judges a pronoun mistake against the pronoun bank only', () => {
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'já', wordCategory: 'pronoun' }), BANKS)).toBe(
			true
		);
		expect(
			isMistakeLemmaInBank(makeMistake({ lemma: 'hrad', wordCategory: 'pronoun' }), BANKS)
		).toBe(false);
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'ty', wordCategory: 'pronoun' }), BANKS)).toBe(
			false
		);
	});

	it('does not accept an adjective or pronoun lemma as a noun', () => {
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'nový', wordCategory: 'noun' }), BANKS)).toBe(
			false
		);
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'já', wordCategory: 'noun' }), BANKS)).toBe(
			false
		);
	});

	it('judges a multi-step mistake against the noun bank whatever its category', () => {
		expect(isMistakeLemmaInBank(makeMistake({ drillType: 'multi_step' }), BANKS)).toBe(true);
		expect(
			isMistakeLemmaInBank(makeMistake({ lemma: 'nový', drillType: 'multi_step' }), BANKS)
		).toBe(false);
	});

	it('keeps a record without a category when any bank has the lemma', () => {
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'hrad' }), BANKS)).toBe(true);
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'nový' }), BANKS)).toBe(true);
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'já' }), BANKS)).toBe(true);
		expect(isMistakeLemmaInBank(makeMistake({ lemma: 'trojice' }), BANKS)).toBe(false);
	});
});

describe('parseMistakeRecords', () => {
	it('keeps mistakes on current lemmas and drops the ones on removed lemmas', () => {
		const parsed = parseMistakeRecords(
			[
				makeMistake({ lemma: 'hrad', wordCategory: 'noun' }),
				makeMistake({ lemma: 'trojice', wordCategory: 'noun' }),
				makeMistake({ lemma: 'nový', wordCategory: 'adjective' }),
				makeMistake({ lemma: 'starý', wordCategory: 'adjective' }),
				makeMistake({ lemma: 'já', wordCategory: 'pronoun' }),
				makeMistake({ lemma: 'ty', wordCategory: 'pronoun' }),
				makeMistake({ lemma: 'žena' }),
				makeMistake({ lemma: 'sex' })
			],
			BANKS
		);
		expect(lemmas(parsed)).toEqual(['hrad', 'nový', 'já', 'žena']);
	});

	it('still rejects malformed records', () => {
		const good = makeMistake();
		const parsed = parseMistakeRecords(
			[
				good,
				null,
				'hrad',
				42,
				[good],
				{ ...good, lemma: 7 },
				{ ...good, translation: undefined },
				{ ...good, targetCase: 'abl' },
				{ ...good, targetNumber: 'dual' },
				{ ...good, userAnswer: null },
				{ ...good, correctAnswer: 1 },
				{ ...good, drillType: 'flashcard' },
				{ ...good, timestamp: 1700000000 },
				{ ...good, userParadigm: 'not-a-paradigm' },
				{ ...good, correctParadigm: 5 },
				{ ...good, wordCategory: 'verb' }
			],
			BANKS
		);
		expect(parsed).toEqual([good]);
	});

	it('returns an empty list for anything that is not an array', () => {
		expect(parseMistakeRecords(null, BANKS)).toEqual([]);
		expect(parseMistakeRecords(undefined, BANKS)).toEqual([]);
		expect(parseMistakeRecords({ 0: makeMistake() }, BANKS)).toEqual([]);
		expect(parseMistakeRecords('[]', BANKS)).toEqual([]);
	});

	it('keeps optional fields on the records it returns', () => {
		const multiStep = makeMistake({
			drillType: 'multi_step',
			sentence: 'Vidím ___.',
			userParadigm: 'žena',
			correctParadigm: 'hrad',
			wordCategory: 'noun'
		});
		expect(parseMistakeRecords([multiStep], BANKS)).toEqual([multiStep]);
	});
});

describe('parseMistakeRecords without banks', () => {
	it('only validates: the bank check needs the banks loaded', () => {
		const removed = makeMistake({ lemma: 'milenec', wordCategory: 'noun' });
		expect(parseMistakeRecords([removed, { lemma: 'hrad' }])).toEqual([removed]);
	});
});

describe('parseMistakeRecords against the real banks', () => {
	const nounLemmas = new Set(loadWordBank().map((w) => w.lemma));

	it('drops the nouns removed from the word bank and keeps a current one', async () => {
		const removed = ['trojice', 'sex', 'milenec', 'sebevražda'];
		for (const lemma of removed) expect(nounLemmas.has(lemma)).toBe(false);
		expect(nounLemmas.has('hrad')).toBe(true);

		const parsed = parseMistakeRecords(
			[
				makeMistake({ lemma: 'hrad', wordCategory: 'noun' }),
				...removed.map((lemma) => makeMistake({ lemma, wordCategory: 'noun' })),
				...removed.map((lemma) => makeMistake({ lemma, drillType: 'multi_step' })),
				...removed.map((lemma) => makeMistake({ lemma }))
			],
			await loadBankLemmaSets()
		);
		expect(lemmas(parsed)).toEqual(['hrad']);
	});

	it('checks adjective and pronoun mistakes against their own banks', async () => {
		const adjective = loadAdjectiveBank().find((a) => !nounLemmas.has(a.lemma));
		const pronoun = loadPronounBank().find((p) => !nounLemmas.has(p.lemma));
		if (!adjective || !pronoun) throw new Error('banks have no adjective/pronoun-only lemma');

		const parsed = parseMistakeRecords(
			[
				makeMistake({ lemma: adjective.lemma, wordCategory: 'adjective' }),
				makeMistake({ lemma: pronoun.lemma, wordCategory: 'pronoun' }),
				// Saved before `wordCategory` existed: kept, the lemma is in a bank.
				makeMistake({ lemma: adjective.lemma }),
				makeMistake({ lemma: pronoun.lemma }),
				// Filed under the wrong bank: dropped.
				makeMistake({ lemma: adjective.lemma, wordCategory: 'noun' }),
				makeMistake({ lemma: pronoun.lemma, wordCategory: 'adjective' }),
				makeMistake({ lemma: 'hrad', wordCategory: 'pronoun' })
			],
			await loadBankLemmaSets()
		);
		expect(lemmas(parsed)).toEqual([
			adjective.lemma,
			pronoun.lemma,
			adjective.lemma,
			pronoun.lemma
		]);
	});
});

describe('loading mistakes from localStorage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	/** Load a fresh copy of the module as the browser would, with `stored` in localStorage. */
	async function loadWithStorage(stored: string | null): Promise<{
		records: MistakeRecord[];
		storage: Map<string, string>;
	}> {
		const storage = new Map<string, string>();
		if (stored !== null) storage.set(STORAGE_KEY, stored);
		vi.stubGlobal('window', {});
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			}
		});
		vi.resetModules();
		const module = await import('./mistakes');
		// The check against the banks runs in the background after load.
		await module.purgeRemovedWords();
		return { records: module.getAllMistakes(), storage };
	}

	it('drops mistakes on removed lemmas and writes the cleaned list back', async () => {
		const kept = makeMistake({ lemma: 'hrad', wordCategory: 'noun' });
		const { records, storage } = await loadWithStorage(
			JSON.stringify([
				kept,
				makeMistake({ lemma: 'milenec', wordCategory: 'noun' }),
				makeMistake({ lemma: 'sebevražda' }),
				{ lemma: 'hrad' }
			])
		);
		expect(records).toEqual([kept]);
		expect(JSON.parse(storage.get(STORAGE_KEY) ?? 'null')).toEqual([kept]);
	});

	it('leaves a clean list as it is', async () => {
		const stored = [makeMistake({ lemma: 'hrad' }), makeMistake({ lemma: 'žena' })];
		const { records, storage } = await loadWithStorage(JSON.stringify(stored));
		expect(records).toEqual(stored);
		expect(JSON.parse(storage.get(STORAGE_KEY) ?? 'null')).toEqual(stored);
	});

	it('shows stored mistakes at once and loads no bank when there are none', async () => {
		const storage = new Map<string, string>();
		vi.stubGlobal('window', {});
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => {
				storage.set(key, value);
			}
		});
		vi.resetModules();
		const drill = vi.fn();
		vi.doMock('./drill', () => {
			drill();
			return { loadWordBank: () => [] };
		});
		const module = await import('./mistakes');
		await module.purgeRemovedWords();
		expect(module.getAllMistakes()).toEqual([]);
		expect(drill).not.toHaveBeenCalled();
		vi.doUnmock('./drill');
	});

	it('starts empty when storage is missing or corrupt', async () => {
		expect((await loadWithStorage(null)).records).toEqual([]);
		expect((await loadWithStorage('{not json')).records).toEqual([]);
		expect((await loadWithStorage('{"lemma":"hrad"}')).records).toEqual([]);
	});
});
