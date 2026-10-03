import { describe, it, expect } from 'vitest';
import { explainWrongEnding } from './wrong-ending';
import { loadWordBank } from '$lib/engine/drill';
import type { WordEntry } from '$lib/types';

const bank = loadWordBank();

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

const LOC_SG = { case: 'loc', number: 'sg' } as const;
const DAT_SG = { case: 'dat', number: 'sg' } as const;

describe('explainWrongEnding', () => {
	it('names the paradigm a borrowed ending belongs to', () => {
		expect(explainWrongEnding(word('pokoj'), LOC_SG, 'pokojě')).toBe(
			'You used -ě: the hrad-type locative ending, but pokoj is stroj-type (-i)'
		);
		expect(explainWrongEnding(word('růže'), DAT_SG, 'růžě')).toBe(
			'You used -ě: the žena-type dative ending, but růže takes -i'
		);
	});

	it('explains an alternative ending of the same paradigm', () => {
		// stolu is genitive; the -u still came from the locative rule (ve vlaku).
		expect(explainWrongEnding(word('stůl'), LOC_SG, 'stolu', { accidentalCase: true })).toBe(
			'You used -u: also a hrad-type locative ending, but stůl takes -e'
		);
	});

	it('leaves look-alikes from other paradigms to the accidental-case verdict', () => {
		// ženu is žena's accusative; hrad-type dative -u is beside the point.
		expect(explainWrongEnding(word('žena'), DAT_SG, 'ženu', { accidentalCase: true })).toBeNull();
	});

	it('says nothing when the stem, not the ending, is wrong', () => {
		expect(explainWrongEnding(word('kniha'), DAT_SG, 'knihě')).toBeNull();
	});

	it('says nothing for correct answers, accepted variants, or unrelated text', () => {
		expect(explainWrongEnding(word('hrad'), LOC_SG, 'hradě')).toBeNull();
		expect(explainWrongEnding(word('dům'), LOC_SG, 'domu')).toBeNull();
		expect(explainWrongEnding(word('hrad'), LOC_SG, 'stůl')).toBeNull();
		expect(explainWrongEnding(word('hrad'), LOC_SG, '')).toBeNull();
	});

	it('labels plural slots', () => {
		const line = explainWrongEnding(word('hrad'), { case: 'loc', number: 'pl' }, 'hradích');
		expect(line).toBe(
			'You used -ích: the muž/stroj-type locative plural ending, but hrad takes -ech'
		);
	});
});
