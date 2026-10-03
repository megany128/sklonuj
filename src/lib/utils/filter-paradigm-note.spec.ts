import { describe, it, expect } from 'vitest';
import { filterParadigmNote, filterParadigmNotes, type NoteSlot } from './filter-paradigm-note';
import { loadWordBank } from '$lib/engine/drill';
import paradigmsData from '$lib/data/paradigms.json';
import type { WordEntry } from '$lib/types';

const bank = loadWordBank();

function word(lemma: string): WordEntry {
	const w = bank.find((x) => x.lemma === lemma);
	if (!w) throw new Error(`missing word ${lemma}`);
	return w;
}

function noteFor(paradigm: string, key: string): string {
	const entry = paradigmsData.find((p) => p.id === paradigm);
	const notes: Record<string, string> = entry?.whyNotes ?? {};
	const note = notes[key];
	if (!note) throw new Error(`missing whyNote ${paradigm}.${key}`);
	return note;
}

const LOC_SG: NoteSlot = { case: 'loc', number: 'sg' };
const DAT_SG: NoteSlot = { case: 'dat', number: 'sg' };

/** Note for `lemma` at `slot`, tailored to that word. */
function noteForWord(lemma: string, slot: NoteSlot): string {
	const w = word(lemma);
	return filterParadigmNote(noteFor(w.paradigm, `${slot.case}_${slot.number}`), w, slot);
}

describe('filterParadigmNote — rule line', () => {
	it('states the word’s own form and the ending it takes', () => {
		// dům also accepts domu, but only the shown form’s ending is described.
		expect(noteForWord('dům', LOC_SG).split('\n')[0]).toBe('dům → domě: ending -ě');
		expect(noteForWord('papír', LOC_SG).split('\n')[0]).toBe('papír → papíře: ending -e');
		expect(noteForWord('park', LOC_SG).split('\n')[0]).toBe('park → parku: ending -u');
	});

	it('flags forms the paradigm endings do not describe instead of quoting the rule', () => {
		expect(noteForWord('člověk', { case: 'nom', number: 'pl' }).split('\n')[0]).toBe(
			'člověk → lidé: irregular form'
		);
	});

	it('words a zero-ending variant naturally', () => {
		expect(noteForWord('ulice', { case: 'gen', number: 'pl' }).split('\n')[0]).toBe(
			'ulice → ulic: no ending'
		);
	});

	it('keeps "same as" wording for syncretic cases', () => {
		expect(noteForWord('doktor', { case: 'acc', number: 'sg' }).split('\n')[0]).toBe(
			'doktor → doktora: same as genitive'
		);
	});

	it('states the model word’s own ending too', () => {
		expect(noteForWord('žena', DAT_SG).split('\n')[0]).toBe('žena → ženě: ending -ě');
	});

	it('still gives the ending when the rule line also names a same-as case', () => {
		expect(noteForWord('čaj', LOC_SG).split('\n')[0]).toBe('čaj → čaji: ending -i');
	});
});

describe('filterParadigmNote — gotchas only where the form shows them', () => {
	it('keeps k→c only when the form really alternates (rok vs park)', () => {
		// rok's own note already explains k → c, so the paradigm line would repeat it.
		expect(noteForWord('rok', LOC_SG)).not.toContain('Before -ě');
		expect(noteForWord('park', LOC_SG)).not.toContain('Before -ě');
		expect(noteForWord('papír', LOC_SG)).toContain('Before -ě: r→ř (papír → papíře)');
		expect(noteForWord('papír', LOC_SG)).not.toContain('k→c');
	});

	it('keeps "After h/ch: -u" only for h/ch stems that take -u', () => {
		expect(noteForWord('břeh', LOC_SG)).toContain('After h/ch: -u');
		expect(noteForWord('dům', LOC_SG)).not.toContain('After h/ch');
	});

	it('keeps the fleeting-e line only where this form drops the e', () => {
		expect(noteForWord('dárek', LOC_SG)).toContain('Fleeting e drops: dárek → dárku');
		expect(noteForWord('dům', LOC_SG)).not.toContain('Fleeting e');
	});

	it('keeps vocative gotchas only for words they describe', () => {
		const voc: NoteSlot = { case: 'voc', number: 'sg' };
		expect(noteForWord('vlak', voc)).toContain('After k/h/ch: -u');
		expect(noteForWord('vlak', voc)).not.toContain('r→ř');
		expect(noteForWord('bratr', voc)).toContain('Before -e: r→ř after a consonant');
		expect(noteForWord('doktor', voc)).not.toContain('r→ř');
		// svetře is the main form (svetre an accepted variant), so the tip shows on it.
		expect(noteForWord('svetr', voc)).toContain(
			'Before -e: r→ř after a consonant (svetr → svetře)'
		);
	});

	it('does not mistake the h in ch for a plain h', () => {
		const nomPl: NoteSlot = { case: 'nom', number: 'pl' };
		const vrah = noteForWord('vrah', nomPl);
		expect(vrah).toContain('h→z (vrah → vrazi)');
		expect(vrah).not.toContain('ch→š');
		expect(vrah).not.toContain('k→c');
	});

	it('keeps the spelling line only when the form is spelled with plain -e', () => {
		expect(noteForWord('škola', DAT_SG)).toContain(
			'Spelling: -e after c/z/ř/š/l/s (škola → škole)'
		);
		expect(noteForWord('žena', DAT_SG)).not.toContain('Spelling');
		expect(noteForWord('kniha', DAT_SG)).toContain('h→z (kniha → knize)');
	});

	it('illustrates kept gotchas with the drilled word, not the stock example', () => {
		expect(noteForWord('kočka', DAT_SG).split('\n').slice(1)).toEqual([
			'Before -ě: k→c (kočka → kočce)',
			'Spelling: -e after c/z/ř/š/l/s'
		]);
		expect(noteForWord('břeh', LOC_SG)).toContain('After h/ch: -u (břeh → břehu)');
		expect(noteForWord('ulice', { case: 'gen', number: 'pl' })).toContain(
			'Watch: some have no ending (ulice → ulic)'
		);
	});

	it('keeps "no ending" warnings only for words with no ending', () => {
		const genPl: NoteSlot = { case: 'gen', number: 'pl' };
		expect(noteForWord('ulice', genPl)).toContain('Watch: some have no ending');
		expect(noteForWord('růže', genPl)).not.toContain('Watch');
	});
});

describe('filterParadigmNotes', () => {
	it('tailors case keys and passes other keys through', () => {
		const out = filterParadigmNotes(
			{ loc_sg: noteFor('hrad', 'loc_sg'), extra: 'x\nFleeting e drops' },
			word('park')
		);
		expect(out.loc_sg).toBe('park → parku: ending -u');
		expect(out.extra).toBe('x\nFleeting e drops');
	});
});

describe('paradigms.json whyNotes format', () => {
	const CASE_NAMES: Record<string, string> = {
		nom: 'nominative',
		gen: 'genitive',
		dat: 'dative',
		acc: 'accusative',
		voc: 'vocative',
		loc: 'locative',
		ins: 'instrumental'
	};

	for (const p of paradigmsData) {
		const notes: Record<string, string> = p.whyNotes;
		for (const [key, note] of Object.entries(notes)) {
			it(`${p.id}.${key} is terse rule lines`, () => {
				const [c, n] = key.split('_');
				const lines = note.split('\n');
				expect(lines[0].startsWith(`${p.id}-type · ${CASE_NAMES[c]} ${n} → `)).toBe(true);
				expect(lines.length).toBeLessThanOrEqual(4);
				for (const line of lines) {
					expect(line).toBe(line.trim());
					expect(line.endsWith('.')).toBe(false);
					expect(line).not.toMatch(/e\.g\./);
				}
			});
		}
	}
});
