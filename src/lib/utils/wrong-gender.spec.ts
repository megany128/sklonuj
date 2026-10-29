import { describe, it, expect } from 'vitest';
import { explainWrongGender } from './wrong-gender';
import { loadDeterminerBank } from '$lib/engine/determiners';
import { loadWordBank } from '$lib/engine/drill';
import type { Case, Number_ } from '$lib/types';

const ten = loadDeterminerBank().find((d) => d.lemma === 'ten');
const noun = (lemma: string) => loadWordBank().find((w) => w.lemma === lemma);

describe('explainWrongGender', () => {
	it('names the gender of a form from another gender, accents or not', () => {
		const jezero = noun('jezero');
		if (!ten || !jezero) throw new Error('missing bank entries');
		const slot: { case: Case; number: Number_ } = { case: 'loc', number: 'sg' };
		const line = 'té is the feminine form — jezero is neuter, so it takes tom';
		expect(explainWrongGender(ten, jezero, slot, 'té', 'tom')).toBe(line);
		expect(explainWrongGender(ten, jezero, slot, 'te', 'tom')).toBe(line);
	});

	it('says nothing for the right gender or a form of no gender here', () => {
		const jezero = noun('jezero');
		if (!ten || !jezero) throw new Error('missing bank entries');
		const slot: { case: Case; number: Number_ } = { case: 'loc', number: 'sg' };
		expect(explainWrongGender(ten, jezero, slot, 'tom', 'tom')).toBeNull();
		expect(explainWrongGender(ten, jezero, slot, 'tu', 'tom')).toBeNull();
	});

	it('tells masculine animate from inanimate where the forms differ', () => {
		const stul = noun('stůl');
		if (!ten || !stul) throw new Error('missing bank entries');
		expect(explainWrongGender(ten, stul, { case: 'acc', number: 'sg' }, 'toho', 'ten')).toBe(
			'toho is the masculine animate form — stůl is masculine inanimate, so it takes ten'
		);
	});
});
