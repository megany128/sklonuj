import { describe, it, expect } from 'vitest';
import type { Case } from '$lib/types';
import { declensionNoteForSlot } from './declension-note-slot';

const NOM_ACC: Case[] = ['nom', 'acc'];
const EVERY_CASE: Case[] = ['nom', 'gen', 'dat', 'acc', 'voc', 'loc', 'ins'];

const HRBITOV = 'Genitive sg: -a (hřbitova)\nDative hřbitovu, locative na hřbitově';

describe('declensionNoteForSlot', () => {
	it('keeps only the clauses about the drilled case', () => {
		expect(declensionNoteForSlot(HRBITOV, { case: 'gen', number: 'sg' })).toBe(
			'Genitive sg: -a (hřbitova)'
		);
		expect(declensionNoteForSlot(HRBITOV, { case: 'loc', number: 'sg' })).toBe(
			'Locative na hřbitově'
		);
		expect(declensionNoteForSlot(HRBITOV, { case: 'ins', number: 'sg' })).toBeNull();
	});

	it('carries the number the note last named onto unlabelled cases', () => {
		expect(declensionNoteForSlot(HRBITOV, { case: 'loc', number: 'pl' })).toBeNull();
		expect(declensionNoteForSlot(HRBITOV, { case: 'gen', number: 'pl' })).toBeNull();
		const lod = 'Mixes píseň and kost: gen sg lodě or lodi, dat/loc lodi\nPlural: lodě, lodí';
		expect(declensionNoteForSlot(lod, { case: 'loc', number: 'pl' })).toBe('Plural: lodě, lodí');
	});

	it('filters by number and keeps unlabelled lines everywhere', () => {
		const note = 'Fleeting e: den → dne, dnu, dnem (pl dny, dnů, dnech)\nGenitive pl: dat';
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'sg' })).toBe(
			'Fleeting e: den → dne, dnu, dnem (pl dny, dnů, dnech)'
		);
		expect(declensionNoteForSlot(note, { case: 'gen', number: 'pl' })).toBe(note);
	});

	it('reads "outside" as every other case in that number and keeps the line as written', () => {
		const note = 'ů → o outside nom/acc sg (domu, v domě)';
		expect(declensionNoteForSlot(note, { case: 'acc', number: 'sg' })).toBeNull();
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'sg' })).toBe(note);
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'pl' })).toBeNull();
	});

	it('takes the label after a colon when the one before names no case', () => {
		const note = 'Mixes píseň and kost: gen sg lodě or lodi, dat/loc lodi';
		expect(declensionNoteForSlot(note, { case: 'dat', number: 'sg' })).toBe('Dat/loc lodi');
	});

	it('lets "Also accepted in both" follow the line above', () => {
		const note =
			'Genitive sg kostela (do kostela), locative v kostele\nAlso accepted in both: kostelu';
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'sg' })).toBe(
			'Locative v kostele\nAlso accepted in both: kostelu'
		);
		expect(declensionNoteForSlot(note, { case: 'dat', number: 'sg' })).toBeNull();
	});

	it('swaps singular-only examples for the plural form on plural questions', () => {
		const leden = {
			sg: ['leden', 'ledna', 'lednu', 'leden', 'ledne', 'lednu', 'lednem'],
			pl: ['ledny', 'lednů', 'lednům', 'ledny', 'ledny', 'lednech', 'ledny']
		};
		const note = 'Fleeting e: leden → ledna, v lednu, lednem\nGenitive sg: -a (ledna)';
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'pl' }, leden)).toBe(
			'Fleeting e: leden → lednech'
		);
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'sg' }, leden)).toBe(
			'Fleeting e: leden → ledna, v lednu, lednem'
		);

		const den = {
			sg: ['den', 'dne', 'dnu', 'den', 'dni', 'dni', 'dnem'],
			pl: ['dny', 'dnů', 'dnům', 'dny', 'dny', 'dnech', 'dny']
		};
		const denNote = 'Fleeting e: den → dne, dnu, dnem (pl dny, dnů, dnech)';
		expect(declensionNoteForSlot(denNote, { case: 'loc', number: 'pl' }, den)).toBe(denNote);
		// Names the case but no number, and quotes only the singular dne.
		const dneNote = `${denNote}\nGenitive dne in phrases like během dne`;
		expect(declensionNoteForSlot(dneNote, { case: 'gen', number: 'pl' }, den)).toBe(denNote);
		expect(declensionNoteForSlot(dneNote, { case: 'gen', number: 'pl' }, den)).not.toContain(
			'během'
		);
		expect(declensionNoteForSlot(dneNote, { case: 'gen', number: 'sg' }, den)).toBe(dneNote);

		const kocicka = {
			sg: ['kočička', 'kočičky', 'kočičce', 'kočičku', 'kočičko', 'kočičce', 'kočičkou'],
			pl: ['kočičky', 'kočiček', 'kočičkám', 'kočičky', 'kočičky', 'kočičkách', 'kočičkami']
		};
		expect(
			declensionNoteForSlot(
				'Diminutive of kočka; endearment: kočičko',
				{ case: 'dat', number: 'pl' },
				kocicka
			)
		).toBe('Diminutive of kočka');

		// trička is gen sg and nom pl alike, so it doesn't make the line plural.
		const tricko = {
			sg: ['tričko', 'trička', 'tričku', 'tričko', 'tričko', 'tričku', 'tričkem'],
			pl: ['trička', 'triček', 'tričkům', 'trička', 'trička', 'tričkách', 'tričky']
		};
		expect(
			declensionNoteForSlot(
				'Declines like město: trička, tričku',
				{ case: 'dat', number: 'pl' },
				tricko
			)
		).toBe('Declines like město: tričko → tričkům');

		// A rule stated in words keeps its wording; only the examples change.
		const centrum = {
			sg: ['centrum', 'centra', 'centru', 'centrum', 'centrum', 'centru', 'centrem'],
			pl: ['centra', 'center', 'centrům', 'centra', 'centra', 'centrech', 'centry']
		};
		expect(
			declensionNoteForSlot(
				'Latin neuter: -um drops before endings (centra, centru, centrem)',
				{ case: 'loc', number: 'pl' },
				centrum
			)
		).toBe('Latin neuter: -um drops before endings (centrum → centrech)');
	});

	it('keeps a clause that points back at another case with the clause it is about', () => {
		const chleb = {
			sg: ['chléb', 'chleba', 'chlebu', 'chléb', 'chlebe', 'chlebě', 'chlebem'],
			pl: ['chleby', 'chlebů', 'chlebům', 'chleby', 'chleby', 'chlebech', 'chleby']
		};
		const note =
			'é → e outside nom/acc sg (chleba, chlebu, chlebem)\n' +
			'Genitive sg -a: chleba; colloquially also nom/acc\n' +
			'Locative v chlebě or v chlebu';
		// "Colloquially also nom/acc" alone says nothing: also what?
		for (const c of NOM_ACC) {
			expect(declensionNoteForSlot(note, { case: c, number: 'sg' }, chleb)).toBe(
				'Genitive sg -a: chleba; colloquially also nom/acc'
			);
		}
		// The genitive itself is unchanged, and so is every other case.
		expect(declensionNoteForSlot(note, { case: 'gen', number: 'sg' }, chleb)).toBe(
			'é → e outside nom/acc sg (chleba, chlebu, chlebem)\nGenitive sg -a: chleba'
		);
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'sg' }, chleb)).toBe(
			'é → e outside nom/acc sg (chleba, chlebu, chlebem)\nLocative v chlebě or v chlebu'
		);
		expect(declensionNoteForSlot(note, { case: 'ins', number: 'sg' }, chleb)).toBe(
			'é → e outside nom/acc sg (chleba, chlebu, chlebem)'
		);
		// It is about the singular, so the plural gets none of it.
		expect(declensionNoteForSlot(note, { case: 'acc', number: 'pl' }, chleb)).toBeNull();
		expect(declensionNoteForSlot(note, { case: 'nom', number: 'pl' }, chleb)).toBeNull();
	});

	it('brings back only the statement a pointing-back clause belongs to', () => {
		const note = 'Dative mostu, genitive sg -a: mosta, rarely also acc';
		expect(declensionNoteForSlot(note, { case: 'acc', number: 'sg' })).toBe(
			'Genitive sg -a: mosta, rarely also acc'
		);
		expect(declensionNoteForSlot(note, { case: 'gen', number: 'sg' })).toBe(
			'Genitive sg -a: mosta'
		);
		// A label that leads its own form is not pointing back.
		expect(declensionNoteForSlot(HRBITOV, { case: 'loc', number: 'sg' })).toBe(
			'Locative na hřbitově'
		);
		expect(
			declensionNoteForSlot('Dative hřbitovu, locative sg (na hřbitově)', {
				case: 'loc',
				number: 'sg'
			})
		).toBe('Locative sg (na hřbitově)');
	});

	it('drops a singular example made of the word itself on plural questions', () => {
		const ctvrtek = {
			sg: ['čtvrtek', 'čtvrtka', 'čtvrtku', 'čtvrtek', 'čtvrtku', 'čtvrtku', 'čtvrtkem'],
			pl: ['čtvrtky', 'čtvrtků', 'čtvrtkům', 'čtvrtky', 'čtvrtky', 'čtvrtcích', 'čtvrtky']
		};
		const note =
			'Fleeting e: čtvrtka (do čtvrtka) or čtvrtku, čtvrtkem; ve čtvrtek\n' +
			'Plural čtvrtky; k → c in loc pl: čtvrtcích';
		expect(declensionNoteForSlot(note, { case: 'dat', number: 'pl' }, ctvrtek)).toBe(
			'Fleeting e: čtvrtek → čtvrtkům\nPlural čtvrtky'
		);
		expect(declensionNoteForSlot(note, { case: 'loc', number: 'pl' }, ctvrtek)).toBe(
			'Fleeting e: čtvrtek → čtvrtcích\nPlural čtvrtky; k → c in loc pl: čtvrtcích'
		);
		for (const c of EVERY_CASE) {
			expect(declensionNoteForSlot(note, { case: c, number: 'pl' }, ctvrtek)).not.toContain(
				've čtvrtek'
			);
		}
		// "ve čtvrtek" is a singular example, so singular questions keep it.
		expect(declensionNoteForSlot(note, { case: 'acc', number: 'sg' }, ctvrtek)).toBe(
			'Fleeting e: čtvrtka (do čtvrtka) or čtvrtku, čtvrtkem; ve čtvrtek'
		);

		// A word whose dictionary form is also a plural form is not singular-only.
		const kure = {
			sg: ['kuře', 'kuřete', 'kuřeti', 'kuře', 'kuře', 'kuřeti', 'kuřetem'],
			pl: ['kuřata', 'kuřat', 'kuřatům', 'kuřata', 'kuřata', 'kuřatech', 'kuřaty']
		};
		expect(
			declensionNoteForSlot('Stem grows: kuřete; na kuře', { case: 'dat', number: 'pl' }, kure)
		).toBe('Stem grows: kuře → kuřatům');
		const staveni = {
			sg: ['stavení', 'stavení', 'stavení', 'stavení', 'stavení', 'stavení', 'stavením'],
			pl: ['stavení', 'stavení', 'stavením', 'stavení', 'stavení', 'staveních', 'staveními']
		};
		expect(
			declensionNoteForSlot('Verbal noun; ve stavení', { case: 'dat', number: 'pl' }, staveni)
		).toBe('Verbal noun; ve stavení');
	});
});
