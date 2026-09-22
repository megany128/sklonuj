import { describe, expect, it } from 'vitest';
import { loadAdjectiveBank } from './adjective-drill.ts';
import {
	adjectiveCellsByCase,
	cachedPoolSize,
	nounCellsByCase,
	pronounCellsByCase
} from './cell-pools.ts';
import { loadWordBank } from './drill.ts';
import { loadPronounBank } from './pronoun-drill.ts';

describe('nounCellsByCase', () => {
	it('lists only slots with a valid form and adds the recognition cell', () => {
		const bank = loadWordBank();
		const hrad = bank.find((w) => w.lemma === 'hrad');
		expect(hrad).toBeDefined();
		if (!hrad) return;
		const cells = nounCellsByCase([hrad], ['gen', 'voc'], ['sg', 'pl']);
		// hrad is an inanimate place noun: no vocative drilling.
		expect(cells.get('voc')).toEqual([]);
		expect(cells.get('gen')).toEqual(['n:hrad:gen:sg', 'n:hrad:gen:pl', 'c:gen:sg', 'c:gen:pl']);
	});

	it('dedupes paradigms across words', () => {
		const bank = loadWordBank();
		const hrads = bank.filter((w) => w.paradigm === 'hrad').slice(0, 5);
		expect(hrads.length).toBeGreaterThan(1);
		expect(nounCellsByCase(hrads, ['dat'], ['sg'])?.get('dat')).toEqual([
			'n:hrad:dat:sg',
			'c:dat:sg'
		]);
	});
});

describe('adjectiveCellsByCase', () => {
	it('crosses paradigm types with the genders the nouns can take in that slot', () => {
		const adjectives = loadAdjectiveBank();
		const hard = adjectives.find((a) => a.paradigmType === 'hard');
		const soft = adjectives.find((a) => a.paradigmType === 'soft');
		const bank = loadWordBank();
		const hrad = bank.find((w) => w.lemma === 'hrad');
		expect(hard && soft && hrad).toBeTruthy();
		if (!hard || !soft || !hrad) return;
		const cells = adjectiveCellsByCase([hard, soft], [hrad], ['acc', 'voc'], ['sg']);
		expect(cells.get('acc')?.sort()).toEqual(['a:hard:m_inanim:acc:sg', 'a:soft:m_inanim:acc:sg']);
		expect(cells.get('voc')).toEqual([]);
	});
});

describe('pronounCellsByCase', () => {
	it('skips numbers a pronoun lacks and adds the recognition cell when anything is drillable', () => {
		const ja = loadPronounBank().find((p) => p.lemma === 'já');
		expect(ja).toBeDefined();
		if (!ja) return;
		// "já" has no plural forms.
		expect(pronounCellsByCase([ja], ['dat'], ['sg', 'pl']).get('dat')).toEqual([
			'p:já:dat:sg',
			'c:dat:sg',
			'c:dat:pl'
		]);
		expect(pronounCellsByCase([ja], ['dat'], ['pl']).get('dat')).toEqual([]);
	});
});

describe('cachedPoolSize', () => {
	it('evaluates each template once', () => {
		let calls = 0;
		const size = cachedPoolSize((t: { id: string }) => {
			calls++;
			return t.id.length;
		});
		expect(size({ id: 'abc' })).toBe(3);
		expect(size({ id: 'abc' })).toBe(3);
		expect(size({ id: 'de' })).toBe(2);
		expect(calls).toBe(2);
	});
});
