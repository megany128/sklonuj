import { describe, it, expect } from 'vitest';
import { paradigmRuleApplies } from './paradigm-endings';
import type { CaseForms, Paradigm, WordEntry } from '$lib/types';

function word(paradigm: Paradigm, sg: CaseForms, pl: CaseForms): WordEntry {
	return {
		lemma: sg[0] || pl[0],
		translation: '',
		gender: 'm',
		animate: false,
		paradigm,
		difficulty: 'A1',
		categories: [],
		forms: { sg, pl }
	};
}

const les = word(
	'hrad',
	['les', 'lesa', 'lesu', 'les', 'lese', 'lese', 'lesem'],
	['lesy', 'lesů', 'lesům', 'lesy', 'lesy', 'lesích', 'lesy']
);
const hřiště = word(
	'moře',
	['hřiště', 'hřiště', 'hřišti', 'hřiště', 'hřiště', 'hřišti', 'hřištěm'],
	['hřiště', 'hřišť', 'hřištím', 'hřiště', 'hřiště', 'hřištích', 'hřišti']
);
const ředitel = word(
	'muž',
	['ředitel', 'ředitele', 'řediteli', 'ředitele', 'řediteli', 'řediteli', 'ředitelem'],
	['ředitelé', 'ředitelů', 'ředitelům', 'ředitele', 'ředitelé', 'ředitelích', 'řediteli']
);
const ruka = word(
	'žena',
	['ruka', 'ruky', 'ruce', 'ruku', 'ruko', 'ruce', 'rukou'],
	['ruce', 'rukou', 'rukám', 'ruce', 'ruce', 'rukou', 'rukama']
);
const kočka = word(
	'žena',
	['kočka', 'kočky', 'kočce', 'kočku', 'kočko', 'kočce', 'kočkou'],
	['kočky', 'koček', 'kočkám', 'kočky', 'kočky', 'kočkách', 'kočkami']
);
const muzeum = word(
	'město',
	['muzeum', 'muzea', 'muzeu', 'muzeum', 'muzeum', 'muzeu', 'muzeem'],
	['muzea', 'muzeí', 'muzeím', 'muzea', 'muzea', 'muzeích', 'muzei']
);
const rok = word(
	'hrad',
	['rok', 'roku', 'roku', 'rok', 'roku', 'roce', 'rokem'],
	['roky', 'roků', 'rokům', 'roky', 'roky', 'rocích', 'roky']
);

describe('paradigmRuleApplies', () => {
	it('keeps the rule where the word follows its paradigm', () => {
		expect(paradigmRuleApplies('hrad', 'dat', 'sg', les)).toBe(true);
		expect(paradigmRuleApplies('hrad', 'gen', 'pl', les)).toBe(true);
		expect(paradigmRuleApplies('muž', 'dat', 'sg', ředitel)).toBe(true);
		expect(paradigmRuleApplies('moře', 'dat', 'pl', hřiště)).toBe(true);
	});

	it('drops the rule where the stored primary carries a different ending', () => {
		expect(paradigmRuleApplies('hrad', 'gen', 'sg', les)).toBe(false); // lesa, not -u
		expect(paradigmRuleApplies('moře', 'gen', 'pl', hřiště)).toBe(false); // hřišť, not -í
		expect(paradigmRuleApplies('muž', 'nom', 'pl', ředitel)).toBe(false); // ředitelé
		expect(paradigmRuleApplies('město', 'nom', 'sg', muzeum)).toBe(false); // -um
		expect(paradigmRuleApplies('město', 'gen', 'pl', muzeum)).toBe(false); // muzeí
	});

	it('treats a zero ending as applying only to consonant-final forms', () => {
		expect(paradigmRuleApplies('žena', 'gen', 'pl', kočka)).toBe(true); // koček
		expect(paradigmRuleApplies('žena', 'gen', 'pl', ruka)).toBe(false); // rukou
		expect(paradigmRuleApplies('hrad', 'nom', 'sg', les)).toBe(true);
	});

	it('accepts palatalised -e where the paradigm says -ě', () => {
		expect(paradigmRuleApplies('hrad', 'loc', 'sg', rok)).toBe(true); // roce
		expect(paradigmRuleApplies('žena', 'dat', 'sg', ruka)).toBe(true); // ruce
	});

	it('drops rules whose whyNote does not mention the ending the word takes', () => {
		expect(paradigmRuleApplies('hrad', 'voc', 'sg', rok)).toBe(false); // roku, note says -e
		expect(paradigmRuleApplies('hrad', 'loc', 'pl', rok)).toBe(false); // rocích, note says -ech
	});

	it('keeps "same as nominative" rules whatever the ending', () => {
		expect(paradigmRuleApplies('město', 'acc', 'sg', muzeum)).toBe(true);
		expect(paradigmRuleApplies('město', 'acc', 'pl', muzeum)).toBe(true);
		expect(paradigmRuleApplies('město', 'voc', 'pl', muzeum)).toBe(true);
	});

	it('never applies to an empty form', () => {
		const dveře = word(
			'růže',
			['', '', '', '', '', '', ''],
			['dveře', 'dveří', 'dveřím', 'dveře', 'dveře', 'dveřích', 'dveřmi']
		);
		expect(paradigmRuleApplies('růže', 'gen', 'sg', dveře)).toBe(false);
	});
});
