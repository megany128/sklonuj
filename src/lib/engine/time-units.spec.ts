import { describe, it, expect } from 'vitest';
import { checkAnswer, generateFormProduction, loadWordBank } from './drill.ts';
import { declensionNoteForSlot } from '../utils/declension-note-slot.ts';
import { filterParadigmNote, type NoteSlot } from '../utils/filter-paradigm-note.ts';
import { paradigmRuleApplies } from '../utils/paradigm-endings.ts';
import paradigmsData from '../data/paradigms.json';
import { CASE_INDEX } from '../types.ts';
import type { WordEntry } from '../types.ts';

const bank = loadWordBank();

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

const GEN_PL: NoteSlot = { case: 'gen', number: 'pl' };
const GEN_SG: NoteSlot = { case: 'gen', number: 'sg' };

describe('rok → let', () => {
	const rok = word('rok');

	it('asks for let in the genitive plural and still accepts roků', () => {
		expect(rok.forms.pl[CASE_INDEX.gen]).toBe('let');
		const question = generateFormProduction(rok, 'gen', 'pl');
		if (!question) throw new Error('no question for rok gen pl');
		expect(question.correctAnswer).toBe('let');
		expect(checkAnswer(question, 'let')?.correct).toBe(true);
		expect(checkAnswer(question, 'roků')?.correct).toBe(true);
		expect(checkAnswer(question, 'roky')?.correct).toBe(false);
	});

	it('leaves the other plural cases on the rok stem', () => {
		expect(rok.forms.pl).toEqual(['roky', 'let', 'rokům', 'roky', 'roky', 'rocích', 'roky']);
	});

	it('explains let in the Why note, only for the genitive plural', () => {
		const note = rok.declensionNote ?? '';
		expect(declensionNoteForSlot(note, GEN_PL, rok.forms)).toBe(
			'Genitive pl: let after numbers and quantities (pět let, kolik let); roků is also possible'
		);
		expect(declensionNoteForSlot(note, GEN_SG, rok.forms)).toBeNull();
		expect(declensionNoteForSlot(note, { case: 'ins', number: 'pl' }, rok.forms)).toBeNull();
	});

	it('does not claim that let ends in -ů', () => {
		// The page drops the paradigm rule when the form doesn't carry its
		// ending, so the lemma note stands alone for this slot.
		expect(paradigmRuleApplies('hrad', 'gen', 'pl', rok)).toBe(false);
		const hrad = paradigmsData.find((p) => p.id === 'hrad');
		const whyNotes: Record<string, string> = hrad?.whyNotes ?? {};
		const rule = filterParadigmNote(whyNotes['gen_pl'], rok, GEN_PL);
		expect(rule).toBe('rok → let: irregular form');
		expect(rule).not.toContain('ů');
	});
});

describe('count_time', () => {
	it('tags exactly the time units counted after numbers, keeping their other tags', () => {
		const tagged = bank.filter((w) => w.categories.includes('count_time')).map((w) => w.lemma);
		expect(tagged.sort()).toEqual(['den', 'hodina', 'minuta', 'měsíc', 'rok', 'týden'].sort());
		for (const lemma of tagged) {
			expect(word(lemma).categories, lemma).toEqual(
				expect.arrayContaining(['time', 'duration', 'whole_span', 'in_time'])
			);
		}
	});

	it('has the counted forms: pět let, měsíců, týdnů, dní, hodin, minut', () => {
		const genPl = (lemma: string): string[] => {
			const w = word(lemma);
			return [w.forms.pl[CASE_INDEX.gen], ...(w.variantForms?.pl?.[CASE_INDEX.gen] ?? [])];
		};
		expect(genPl('rok')[0]).toBe('let');
		expect(genPl('měsíc')[0]).toBe('měsíců');
		expect(genPl('týden')[0]).toBe('týdnů');
		expect(genPl('den')).toEqual(expect.arrayContaining(['dnů', 'dní']));
		expect(genPl('hodina')[0]).toBe('hodin');
		expect(genPl('minuta')[0]).toBe('minut');
	});
});
