import { describe, it, expect } from 'vitest';
import { buildDictionary, getDictionary, loadDictionary } from './dictionary';

const SG = ['pes', 'psa', 'psovi', 'psa', 'pse', 'psovi', 'psem'];
const PL = ['psi', 'psů', 'psům', 'psy', 'psi', 'psech', 'psy'];

describe('buildDictionary', () => {
	const dict = buildDictionary([
		['pes', 'dog', SG, PL, 'Hard Masc. Animate'],
		['Pes', 'second sense', SG, PL],
		['růže', 'rose', SG, PL],
		['broken', 'no forms', 'x', PL],
		['short', 'too few forms', ['a'], PL]
	]);

	it('keeps well-formed rows and skips the rest', () => {
		expect(dict.entries.map((e) => e.lemma)).toEqual(['pes', 'Pes', 'růže']);
		expect(dict.entries[0]).toEqual({
			lemma: 'pes',
			translation: 'dog',
			sg: SG,
			pl: PL,
			paradigmHint: 'Hard Masc. Animate'
		});
		expect(dict.entries[1].paradigmHint).toBe('');
	});

	it('finds a lemma whatever its capitals, first entry winning', () => {
		expect(dict.find('PES')?.translation).toBe('dog');
		expect(dict.find('kočka')).toBeNull();
	});

	it('finds a lemma typed without diacritics, but only through findStripped', () => {
		expect(dict.find('ruze')).toBeNull();
		expect(dict.findStripped('ruze')?.lemma).toBe('růže');
	});
});

describe('loadDictionary', () => {
	it('is not loaded until asked for, then stays loaded', async () => {
		expect(getDictionary()).toBeNull();
		const dict = await loadDictionary();
		expect(dict.entries.length).toBeGreaterThan(15000);
		expect(getDictionary()).toBe(dict);
		expect(await loadDictionary()).toBe(dict);
		// A word the drill bank doesn't carry.
		expect(dict.find('abakus')?.sg[1]).toBe('abaku');
	});
});
