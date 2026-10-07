import { describe, it, expect } from 'vitest';
import { declensionNoteForSlot } from './declension-note-slot';

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
});
