import { describe, it, expect } from 'vitest';
import { drillHints, findTrigger, whyClue } from './drill-hints';
import {
	generateCaseIdentification,
	generateFormProduction,
	generateSentenceDrill,
	loadTemplates,
	loadWordBank
} from '$lib/engine/drill';
import type { Paradigm, SentenceTemplate, WordEntry } from '$lib/types';

const bank = loadWordBank();
const models = (p: Paradigm) => bank.find((w) => w.lemma === p);

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

function template(text: string): SentenceTemplate {
	const found = loadTemplates().find((t) => t.template === text);
	if (!found) throw new Error(`missing template ${text}`);
	return found;
}

describe('drillHints', () => {
	it('form production: model word, then first letters', () => {
		const q = generateFormProduction(word('stůl'), 'loc', 'sg');
		if (!q) throw new Error('no question');
		expect(drillHints(q, models)).toEqual([
			{ kind: 'like', model: 'hrad', form: 'hradě' },
			{ kind: 'start', prefix: 'st' }
		]);
	});

	it('skips the model hint for the model word itself', () => {
		const q = generateFormProduction(word('hrad'), 'loc', 'sg');
		if (!q) throw new Error('no question');
		expect(drillHints(q, models)).toEqual([{ kind: 'start', prefix: 'hrad' }]);
	});

	it('sentence fill-in leads with the case and its cue', () => {
		const q = generateSentenceDrill(template('Mluvíme o ___.'), word('stůl'));
		if (!q) throw new Error('no question');
		expect(drillHints(q, models)[0]).toEqual({
			kind: 'case',
			case: 'loc',
			plural: q.number === 'pl',
			clue: 'o (about) + topic'
		});
	});

	it('case identification gets only the cue, never the case', () => {
		const q = generateCaseIdentification(template('Mluvíme o ___.'), word('stůl'));
		expect(drillHints(q, models)).toEqual([{ kind: 'clue', text: 'o (about) + topic' }]);
		expect(whyClue(q)).toBe('o (about) + topic');
	});
});

describe('findTrigger', () => {
	it('finds the last whole-word match, voiced or not', () => {
		expect(findTrigger('Jdu ke stolu.', 'k')).toEqual({ start: 4, end: 6 });
		expect(findTrigger('V lese v ', 'v')).toEqual({ start: 7, end: 8 });
		expect(findTrigger('Pojď se ', 's/se + instrumental')).toEqual({ start: 5, end: 7 });
		expect(findTrigger('Mluvíme o ', 'o')).toEqual({ start: 8, end: 9 });
	});

	it('ignores sub-word matches and multi-word or empty triggers', () => {
		expect(findTrigger('Ono ', 'o')).toBeNull();
		expect(findTrigger('Zeptej se ', 'zeptat se + genitive')).toBeNull();
		expect(findTrigger('To je ', '')).toBeNull();
	});
});
